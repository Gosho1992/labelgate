// Spec-to-Proof: read the two private documents on device. Nano transcribes; src/proof/rules.js checks and decides.
import { readPrivateDocumentStream, firebaseConfigured, lastReadSources } from "../ai/firebase.js";
import { ISSUE } from "./rules.js";
import { audit } from "../ai/extract.js";
import { checkSpecReading, checkLabelReading } from "./rules.js";

export const READ_PROMPT_VERSION = "proof-read-3 (2026-11-26)";
// proof-read-2 also asked for a full line-by-line transcription. On the real laptop that made Gemini Nano generate for
// > 3 minutes on the demo spec (runaway output), and the Firebase SDK cannot cancel an on-device request, so the model
// stayed busy. proof-read-3 returns the structured fields only (the format that ran in 20-48 s on all 22 specproof-v1
// images). Safety does not depend on the model's structure: rules.js re-locates "Contains:" lines inside the fields,
// and the reviewer confirms every reading against the image before any comparison.
export const READ_TIMEOUT_MS = 150000;

export const SPEC_PROMPT = `This image is part of a food supplier's product specification sheet. It may be in English, Spanish or Japanese.
Transcribe only what is printed. Do not guess. Do not add anything that is not printed.
- language: "en", "es" or "ja".
- ingredients: every ingredient exactly as printed (same language and spelling), in order, each with a plain English translation.
- allergen_statement_printed: the allergen statement exactly as printed, or null if there is none.
- allergen_statement_english: its English translation, or null.
Return only the JSON.`;

export const LABEL_PROMPT = `This image is a US retail food label. Transcribe only what is printed, exactly. Do not guess, correct or add anything.
- ingredient_list_printed: the ingredient list exactly as printed, starting with "INGREDIENTS:".
- contains_printed: the "Contains:" line exactly as printed, or null if there is none.
- may_contain_printed: any "May contain" or facility statement exactly as printed, or null.
Return only the JSON.`;

const str = { type: "string" }, strOrNull = { type: ["string", "null"] };
export const SPEC_SCHEMA = {
  type: "object",
  properties: {
    language: { type: "string", enum: ["en", "es", "ja"] },
    ingredients: { type: "array", items: { type: "object", properties: { printed: str, english: str }, required: ["printed", "english"] } },
    allergen_statement_printed: strOrNull, allergen_statement_english: strOrNull,
  },
  required: ["language", "ingredients", "allergen_statement_printed", "allergen_statement_english"],
};
export const LABEL_SCHEMA = {
  type: "object",
  properties: { ingredient_list_printed: str, contains_printed: strOrNull, may_contain_printed: strOrNull },
  required: ["ingredient_list_printed", "contains_printed", "may_contain_printed"],
};

/** File/Blob -> {mimeType, data(base64)}; only JPEG/PNG are accepted for on-device inference. */
export async function toInlineImage(blob) {
  const type = blob.type || "";
  if (!/^image\/(jpeg|png)$/.test(type)) throw new Error("Please use a JPEG or PNG image (on-device reading supports only these).");
  const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  return { mimeType: type, data };
}

/**
 * Read one document image on device and run the deterministic checks.
 * @param {"spec"|"label"} kind
 * @returns {Promise<{ok:boolean, draft?:object, raw?:string, ms:number, error?:string}>}
 */
export async function readDocument(kind, blob, caseId, { onText, retryEmpty = true } = {}) {
  const t0 = performance.now();
  if (!firebaseConfigured) return { ok: false, ms: 0, error: "Firebase is not configured." };
  try {
    const image = await toInlineImage(blob);
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("The on-device model is taking unusually long (over 2½ minutes). It may still be finishing in the background: wait a minute, then press Retry.")), READ_TIMEOUT_MS); });
    const once = () => Promise.race([readPrivateDocumentStream(kind, kind === "spec" ? SPEC_SCHEMA : LABEL_SCHEMA, kind === "spec" ? SPEC_PROMPT : LABEL_PROMPT, image, onText), timeout]);
    let raw = await once();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error("The on-device model returned an unreadable answer. Use Retry."); }
    // One automatic retry when the main field came back empty (seen once in the Nov 26 acceptance run).
    const empty = kind === "spec" ? !(parsed.ingredients || []).length : String(parsed.ingredient_list_printed || "").replace(/ingredients?\s*:?/i, "").trim().length < 5;
    let retried = false;
    if (empty && retryEmpty) {
      retried = true; onText?.("");
      raw = await once();
      try { parsed = JSON.parse(raw); } catch { throw new Error("The on-device model returned an unreadable answer twice. Use Retry or type the reading."); }
    }
    clearTimeout(timer);
    const draft = kind === "spec" ? { ...checkSpecReading(parsed), allergen_statement_english: parsed.allergen_statement_english ?? null }
      : (() => { const d = checkLabelReading(parsed); if (parsed.may_contain_printed) d.precautionary_printed = parsed.may_contain_printed; return d; })();
    const ms = Math.round(performance.now() - t0);
    audit.push({ at: new Date().toISOString(), type: `read_${kind}`, caseId, route: "ON_DEVICE", inferenceSource: "on_device (verified)", ms, cloudBytes: 0, issues: draft.issues.length, retried, prompt: READ_PROMPT_VERSION });
    return { ok: true, draft, raw, ms, retried, inferenceSource: { ...lastReadSources, chunks: [...lastReadSources.chunks] } };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    audit.push({ at: new Date().toISOString(), type: `read_${kind}`, caseId, route: "ON_DEVICE", inferenceSource: null, ms, cloudBytes: 0, error: e.message });
    return { ok: false, ms, error: e.message };
  }
}
