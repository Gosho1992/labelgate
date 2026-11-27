// On-device model lifecycle + Prompt API transport for the detection pipeline.
// States: unsupported | unavailable | downloadable | downloading | ready | error
//  - "downloadable"/"downloading" are NOT treated as unavailable: ensureReady() starts/joins the download
//    (Chrome requires a user gesture for that, so call it from a click handler) and reports progress.
//  - One base session holds the frozen system prompt; every spec gets a clone() so specs never share context.
// Transports (same prompt + schema + pipeline):
//  - "firebase-ai-logic": Firebase AI Logic SDK, InferenceMode.ONLY_ON_DEVICE  <- what the app ships
//  - "prompt-api": Chrome Prompt API directly                                    <- benchmark comparison only
// LanguageModel.availability() is used for UI status only (it runs no inference).
import { EXTRACT_SYSTEM, userPrompt } from "../detect/prompt.js";
import { NANO_EXTRACTION_SCHEMA } from "../schemas.js";
import { firebaseConfigured, privateExtractionModel, firebaseOnDeviceRunner } from "./firebase.js";

let transport = firebaseConfigured ? "firebase-ai-logic" : "prompt-api";
export const getTransport = () => transport;
/** Benchmark/test hook only. */
export const setTransport = (t) => { transport = t; base = null; fbReady = false; };
export let TRANSPORT = transport;
const OPTS = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };

export const nano = { state: "unknown", progress: 0, error: null };
const listeners = new Set();
const emit = () => listeners.forEach((f) => f({ ...nano }));
export const onNanoChange = (f) => { listeners.add(f); return () => listeners.delete(f); };

let base = null;
let creating = null;

export async function checkAvailability() {
  if (isReady()) { nano.state = "ready"; emit(); return nano.state; }
  if (!("LanguageModel" in globalThis)) { nano.state = "unsupported"; emit(); return nano.state; }
  try {
    const a = await globalThis.LanguageModel.availability(OPTS);
    nano.state = a === "available" ? "available" : a; // available | downloadable | downloading | unavailable
  } catch (e) {
    nano.state = "error"; nano.error = e.message;
  }
  emit();
  return nano.state;
}

let fbReady = false;
/** Create (and if needed download) the on-device model. Safe to call repeatedly; concurrent calls share one attempt.
 *  Must be called from a user gesture if a download is needed (Chrome requirement). */
export async function ensureReady() {
  if (transport === "firebase-ai-logic" ? fbReady : base) return true;
  if (creating) return creating;
  const st = await checkAvailability();
  if (st === "unsupported" || st === "unavailable" || st === "error") return false;
  creating = (async () => {
    try {
      nano.state = st === "available" ? "initializing" : "downloading"; nano.progress = 0; emit();
      if (transport === "firebase-ai-logic") {
        await privateExtractionModel().initializeDeviceModel((p) => { nano.state = "downloading"; nano.progress = p; emit(); });
        fbReady = true;
      } else {
        base = await globalThis.LanguageModel.create({
          ...OPTS,
          initialPrompts: [{ role: "system", content: EXTRACT_SYSTEM }],
          monitor(m) { m.addEventListener("downloadprogress", (e) => { nano.state = "downloading"; nano.progress = e.loaded; emit(); }); },
        });
      }
      nano.state = "ready"; nano.progress = 1; nano.error = null; emit();
      return true;
    } catch (e) {
      nano.state = "error"; nano.error = e.message; emit();
      return false;
    } finally {
      creating = null;
    }
  })();
  return creating;
}

/** The runner detect() should use for private specs with the current transport. */
export const activeRunner = () => (transport === "firebase-ai-logic" ? firebaseOnDeviceRunner : promptApiRunner);

export const isReady = () => (transport === "firebase-ai-logic" ? fbReady : !!base);

/** Runner for detect(): one clone per spec, JSON-schema constrained, abortable. */
export async function promptApiRunner(specText, signal) {
  if (!base) throw new Error("on-device model not ready");
  const s = await base.clone({ signal });
  try {
    const raw = await s.prompt(userPrompt(specText), { responseConstraint: NANO_EXTRACTION_SCHEMA, signal });
    try { return JSON.parse(raw); } catch { return { malformedText: String(raw).slice(0, 500) }; } // -> nanoStatus "malformed"
  } finally {
    s.destroy();
  }
}
