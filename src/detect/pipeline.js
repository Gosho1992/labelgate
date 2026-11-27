// The ONE detection pipeline. Used by the app (src/ai/extract.js) and by the benchmark (src/bench/*).
//   1. deterministic dictionary matching (validated ingredient->allergen mapping; the only source of CONFIRMED allergens)
//   2. Nano ingredient DISCOVERY: ingredients + verbatim evidence + unreliable allergen guess + structured absences
//   3. shape check + normalisation of the guess key (malformed output -> status "malformed", spec unresolved)
//   4. evidence validation (engine/profile.js): unsupported ingredients/absences rejected and logged, no review flag
//   5. profile = confirmed contains / mayContain / possible (UNKNOWN allergen) / grounded absences / unresolved
// Benchmark arms are modes of this same pipeline:
//   rules  = step 1 only
//   nano   = steps 2-5 without the dictionary (nothing can be confirmed; scored on discovery + guesses)
//   hybrid = all steps (what the app ships)
import { dictionaryExtract, DICTIONARY_VERSION } from "../allergens/dictionary.js";
import { buildProfile } from "../engine/profile.js";
import { ALLERGENS, SCHEMA_VERSION } from "../schemas.js";
import { PROMPT_VERSION } from "./prompt.js";

export const PIPELINE_VERSION = "detect-2"; // detect-1 = B2 (claims schema); detect-2 = discovery schema, Nov 26
export const MODE = { RULES: "rules", NANO: "nano", HYBRID: "hybrid" };
export const VERSIONS = { pipeline: PIPELINE_VERSION, dictionary: DICTIONARY_VERSION, prompt: PROMPT_VERSION, schema: SCHEMA_VERSION };

// Explicit synonym map for keys a model may emit despite the enum constraint.
const NORMALIZE = {
  milk: "milk", dairy: "milk",
  egg: "egg", eggs: "egg",
  fish: "fish",
  shellfish: "shellfish", crustacean: "shellfish", crustaceans: "shellfish", "crustacean shellfish": "shellfish",
  treenut: "treenut", "tree nut": "treenut", "tree nuts": "treenut", tree_nut: "treenut", treenuts: "treenut",
  peanut: "peanut", peanuts: "peanut",
  wheat: "wheat",
  soy: "soy", soya: "soy", soybean: "soy",
  sesame: "sesame",
};
const ASSERTIONS = new Set(["intentional", "precautionary", "explicit_negative"]);

/**
 * Validate the SHAPE of raw model output (schema discovery-v2) and normalise allergen guesses.
 * Malformed output never becomes "no allergens": it becomes nanoStatus "malformed" (spec unresolved).
 * Unknown guess keys become "unknown" (the guess is never authoritative anyway).
 * @returns {{ok:true, nano:{ingredients:any[], absences:any[]}} | {ok:false, reason:string}}
 */
export function normalizeNanoOutput(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.ingredients)) return { ok: false, reason: "model output missing ingredients[]" };
  const ingredients = [];
  for (const c of raw.ingredients) {
    if (!c || typeof c.evidence !== "string" || !ASSERTIONS.has(c.assertion)) continue;
    const g = NORMALIZE[String(c.allergen_guess ?? "").toLowerCase().trim()];
    ingredients.push({ term: typeof c.term === "string" ? c.term : c.evidence, evidence: c.evidence, assertion: c.assertion, allergen_guess: g && ALLERGENS.includes(g) ? g : "unknown" });
  }
  const absences = (Array.isArray(raw.absences) ? raw.absences : [])
    .filter((a) => a && typeof a.ingredient_evidence === "string" && ["source", "composition", "allergen_statement"].includes(a.missing))
    .map((a) => ({ ingredient: String(a.ingredient ?? ""), missing: a.missing, ingredient_evidence: a.ingredient_evidence }));
  return { ok: true, nano: { ingredients, absences } };
}

/**
 * Pure, synchronous part: build the profile for one mode from already-obtained model output.
 * @param {{id:string,text:string}} spec
 * @param {{mode:string, rawNano?:any, nanoStatus?:string}} opts
 */
export function detectFromOutput(spec, { mode = MODE.HYBRID, rawNano = null, nanoStatus = "skipped" }) {
  const empty = { claims: [], unresolved: [] }; // Nano-only arm: no dictionary, so nothing is ever CONFIRMED
  if (mode === MODE.RULES) return buildProfile(spec, dictionaryExtract(spec.id, spec.text), null, { nanoStatus: "not_used" });

  let nano = null;
  let status = nanoStatus;
  if (nanoStatus === "ok") {
    const n = normalizeNanoOutput(rawNano);
    if (n.ok) nano = n.nano;
    else status = "malformed";
  }
  const dict = mode === MODE.NANO ? empty : dictionaryExtract(spec.id, spec.text);
  const profile = buildProfile(spec, dict, nano, { nanoStatus: status });
  return { ...profile, nanoStatus: status };
}

/**
 * Async part: call the runner (once) and build the profile.
 * @param {{id:string,text:string}} spec
 * @param {{mode?:string, runner?:(text:string, signal?:AbortSignal)=>Promise<any>, timeoutMs?:number, signal?:AbortSignal}} opts
 * @returns {Promise<{profile:any, rawNano:any, nanoStatus:string, ms:number, error?:string}>}
 */
export async function detect(spec, { mode = MODE.HYBRID, runner = null, timeoutMs = 90000, signal } = {}) {
  if (mode === MODE.RULES || !runner) {
    const status = mode === MODE.RULES ? "not_used" : "unavailable";
    return { profile: detectFromOutput(spec, { mode, nanoStatus: status }), rawNano: null, nanoStatus: status, ms: 0 };
  }
  const t0 = performance.now();
  let rawNano = null, nanoStatus = "ok", error;
  const ctl = new AbortController();
  const onAbort = () => ctl.abort(signal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctl.abort(new Error("timeout")), timeoutMs);
  try {
    rawNano = await Promise.race([
      runner(spec.text, ctl.signal),
      new Promise((_, rej) => ctl.signal.addEventListener("abort", () => rej(ctl.signal.reason ?? new Error("aborted")), { once: true })),
    ]);
  } catch (e) {
    error = e?.message || String(e);
    nanoStatus = /timeout/i.test(error) ? "timeout" : signal?.aborted ? "cancelled" : "error";
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  const ms = Math.round(performance.now() - t0);
  const profile = detectFromOutput(spec, { mode, rawNano, nanoStatus });
  return { profile, rawNano, nanoStatus: profile.nanoStatus, ms, error };
}
