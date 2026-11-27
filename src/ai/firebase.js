// Firebase AI Logic (firebase/ai, JS SDK 13.4.0) + App Check. ALL model inference in the app goes through this file.
//  - privateExtractionModel(): InferenceMode.ONLY_ON_DEVICE. The SDK's callCloudOrDevice() only ever calls the
//    on-device adapter in this mode and throws AIError(UNSUPPORTED) if Nano is not available; it has no cloud branch.
//    We additionally assert response.inferenceSource === InferenceSource.ON_DEVICE on every call.
//  - publicRecallModel(): InferenceMode.PREFER_ON_DEVICE (hybrid), for PUBLIC recall notices only: Nano on device when
//    available, otherwise Gemini in the cloud (App Check enforced by Firebase).
//  - There is NO cloud model for private specs: the old PREFER_ON_DEVICE "demo" model was removed (Nov 26).
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource } from "firebase/ai";
import { NANO_EXTRACTION_SCHEMA, RECALL_SCHEMA } from "../schemas.js";
import { EXTRACT_SYSTEM, userPrompt } from "../detect/prompt.js";

const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_APP_ID);
export const SDK = { package: "firebase", version: "13.4.0", module: "firebase/ai" };
export { InferenceSource };

let app = null, ai = null, appCheck = null;
export function initFirebase() {
  if (ai) return ai;
  if (!firebaseConfigured) throw new Error("Firebase is not configured (missing VITE_FIREBASE_* values)");
  app = initializeApp(firebaseConfig);
  // Debug provider ONLY when explicitly requested for local testing; production builds use reCAPTCHA Enterprise.
  if (env.VITE_APPCHECK_DEBUG === "1") self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
  ai = getAI(app, { backend: new GoogleAIBackend() });
  return ai;
}

/** For the App Check verification panel: obtains a token (does not reveal it). */
export async function appCheckStatus() {
  initFirebase();
  try {
    const t = await getToken(appCheck, false);
    return { ok: true, tokenLength: t.token.length, debug: env.VITE_APPCHECK_DEBUG === "1" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const ON_DEVICE_CREATE = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
  initialPrompts: [{ role: "system", content: EXTRACT_SYSTEM }],
};

let privateModel = null;
/** PRIVATE data: on-device only. Throws if Nano is unavailable. */
export function privateExtractionModel() {
  if (privateModel) return privateModel;
  privateModel = getGenerativeModel(initFirebase(), {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: ON_DEVICE_CREATE, promptOptions: { responseConstraint: NANO_EXTRACTION_SCHEMA } },
  });
  return privateModel;
}

/** Runner for detect(): Firebase AI Logic, ONLY_ON_DEVICE, verified on every call. */
export async function firebaseOnDeviceRunner(specText) {
  const result = await privateExtractionModel().generateContent(userPrompt(specText));
  const src = result.response.inferenceSource;
  if (src !== InferenceSource.ON_DEVICE) throw new Error(`privacy guard: inferenceSource was "${src}", expected "${InferenceSource.ON_DEVICE}"`);
  const raw = result.response.text();
  try { return JSON.parse(raw); } catch { return { malformedText: String(raw).slice(0, 500) }; }
}

// ---- Spec-to-Proof: PRIVATE document images (supplier spec photos/scans, label artwork) ----
// Same rule as private specs: ONLY_ON_DEVICE, no cloud fallback, and the result is rejected unless the SDK reports on_device.
export const DOC_CREATE = {
  expectedInputs: [{ type: "text", languages: ["en", "es", "ja"] }, { type: "image" }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};
const docModels = {};
/** @param {"spec"|"label"} kind @param {object} schema JSON schema for the transcription */
export function privateDocumentModel(kind, schema) {
  return (docModels[kind] ||= getGenerativeModel(initFirebase(), {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: DOC_CREATE, promptOptions: { responseConstraint: schema } },
  }));
}
/** Transcribe one private document image on device. Throws if the model did not run on this device. */
export async function readPrivateDocument(kind, schema, prompt, image) {
  const result = await privateDocumentModel(kind, schema).generateContent([prompt, { inlineData: image }]);
  const src = result.response.inferenceSource;
  if (src !== InferenceSource.ON_DEVICE) throw new Error(`privacy guard: inferenceSource was "${src}", expected "${InferenceSource.ON_DEVICE}"`);
  return result.response.text();
}

/** Same as readPrivateDocument, but streams text as Nano writes it (onText(partialText)). The final answer is still
 * rejected unless the SDK reports on_device. Partial text is for display only; rules never run on it. */
/** inferenceSource values observed on the last private read (every chunk + final response), for audit records. */
export const lastReadSources = { chunks: [], final: null };
export async function readPrivateDocumentStream(kind, schema, prompt, image, onText) {
  const model = privateDocumentModel(kind, schema);
  lastReadSources.chunks = []; lastReadSources.final = null;
  if (typeof model.generateContentStream !== "function") return readPrivateDocument(kind, schema, prompt, image);
  const result = await model.generateContentStream([prompt, { inlineData: image }]);
  let text = "";
  for await (const chunk of result.stream) {
    if (!lastReadSources.chunks.includes(String(chunk.inferenceSource))) lastReadSources.chunks.push(String(chunk.inferenceSource));
    if (chunk.inferenceSource && chunk.inferenceSource !== InferenceSource.ON_DEVICE) throw new Error(`privacy guard: inferenceSource was "${chunk.inferenceSource}"`);
    text += chunk.text();
    onText?.(text);
  }
  const final = await result.response;
  lastReadSources.final = final.inferenceSource ?? null;
  if (final.inferenceSource !== InferenceSource.ON_DEVICE) throw new Error(`privacy guard: inferenceSource was "${final.inferenceSource}", expected "${InferenceSource.ON_DEVICE}"`);
  return text;
}

/**
 * PUBLIC data: recall notices. HYBRID — InferenceMode.PREFER_ON_DEVICE:
 * Gemini Nano on this device when it is available; Gemini in the cloud (via Firebase AI Logic, App Check) when it is not.
 * Safe because a public recall notice contains nothing confidential. Private documents never use this model.
 * The instruction is part of the prompt (RECALL_INSTRUCTION) so both paths receive exactly the same task.
 */
export const RECALL_CLOUD_MODEL = "gemini-3.5-flash-lite";
export const RECALL_INSTRUCTION = "Extract structured fields from this PUBLIC food recall notice. Use only the allowed allergen keys. ingredientTerms = the recalled ingredient/product names a manufacturer would see on a supplier spec. Return JSON only.";
let recallModel = null;
export function publicRecallModel() {
  if (recallModel) return recallModel;
  recallModel = getGenerativeModel(initFirebase(), {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: {
      createOptions: { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] },
      promptOptions: { responseConstraint: RECALL_SCHEMA },
    },
    inCloudParams: {
      model: RECALL_CLOUD_MODEL,
      generationConfig: { responseMimeType: "application/json", responseSchema: RECALL_SCHEMA },
    },
  });
  return recallModel;
}

export { InferenceMode };

/**
 * Warm up Gemini Nano when the page opens, so the first document read does not pay the model-load cost.
 * Measured on the demo laptop (Chrome 158, Intel iGPU), 26 Nov: a cold LanguageModel.create took 23.8 s plus 14.2 s for
 * the first tiny prompt; once warm, 9 ms and 1.6 s. Sends NO document content (a fixed one-word prompt), runs only
 * on device, and keeps one idle session open so the model stays loaded while the page is open.
 */
let warmSession = null;
export async function warmUpDeviceModel() {
  if (typeof LanguageModel === "undefined" || warmSession) return null;
  const t0 = performance.now();
  warmSession = await LanguageModel.create(DOC_CREATE);
  await warmSession.prompt("Reply with the word OK.");
  return Math.round(performance.now() - t0);
}
