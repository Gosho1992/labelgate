// Build the allergen profile of ONE spec revision from dictionary hits + Nano discovery output.
// Roles (approved Nov 26):
//  - Dictionary = deterministic, validated ingredient->allergen mapping. Only dictionary hits (and later a human
//    reviewer's own determination) make an allergen CONFIRMED. A dictionary hit can never be removed by the model.
//  - Nano = ingredient DISCOVERY. A Nano-found ingredient that the dictionary does not map becomes
//    "Allergen: UNKNOWN - verify" with its verbatim evidence. Nano's allergen guess is stored as modelGuess only.
//  - Evidence validation: every Nano ingredient and every absence claim must quote the spec (after normalising case,
//    whitespace, quotes and dashes). Unsupported items are REJECTED: logged in profile.rejected for debugging, and they
//    create no review flag and do not affect product status (B2 showed they are mostly hallucinated noise).
//  - Absence ("source/composition not stated") is accepted only as a structured claim whose ingredient is quoted.
import { ASSERTION, ALLERGENS } from "../schemas.js";

const norm = (c) => (/[‘’‛′`]/.test(c) ? "'" : /[“”″]/.test(c) ? '"' : /[‐-―−]/.test(c) ? "-" : c.toLowerCase());

/** Normalise text, keeping a map from each normalised char to its original index. */
function normalizeWithMap(text) {
  let out = "";
  const map = [];
  let prevSpace = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) { if (!prevSpace) { out += " "; map.push(i); } prevSpace = true; continue; }
    out += norm(c); map.push(i); prevSpace = false;
  }
  return { out: out.trimEnd(), map };
}
const cleanQuote = (q) => normalizeWithMap(String(q ?? "")).out.replace(/^[\s"'.,;:()\[\]]+|[\s"'.,;:()\[\]]+$/g, "");

/**
 * Locate a model quote in the spec text after normalising case, whitespace, quotes and dashes and trimming
 * surrounding punctuation. Returns {start, end} in ORIGINAL text coordinates, or null.
 */
export function locateSpan(text, quote) {
  const q = cleanQuote(quote);
  if (q.length < 2) return null;
  const { out, map } = normalizeWithMap(text);
  const i = out.indexOf(q);
  if (i < 0) return null;
  return { start: map[i], end: map[i + q.length - 1] + 1 };
}
/** Back-compat: start index or -1. */
export function locate(text, quote) { const s = locateSpan(text, quote); return s ? s.start : -1; }

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/**
 * @param {{id:string,text:string}} spec
 * @param {{claims:any[], unresolved:string[]}} dict   from dictionaryExtract
 * @param {{ingredients:any[], absences:any[]}|null} nano   normalised Nano output, or null if Nano did not run
 * @param {{nanoStatus:string}} meta
 */
export function buildProfile(spec, dict, nano, meta) {
  const claims = dict.claims.map((c) => ({ ...c, end: c.start + c.evidence.length }));
  const unresolved = [...dict.unresolved];
  const possible = [];   // Nano-found ingredients with allergen UNKNOWN (human must determine)
  const absences = [];   // grounded missing-information findings
  const rejected = [];   // unsupported model output, for debugging only
  const negatives = [];

  if (nano) {
    for (const ing of nano.ingredients || []) {
      const span = locateSpan(spec.text, ing.evidence); // strict: the EVIDENCE quote must be in the spec
      if (!span) { rejected.push({ kind: "ingredient", term: ing.term, evidence: ing.evidence, reason: "evidence not found in spec text" }); continue; }
      const evidence = spec.text.slice(span.start, span.end);
      if (ing.assertion === ASSERTION.NEGATIVE) { negatives.push({ ...ing, evidence, ...span }); continue; }
      // Deterministic mapping available? (the dictionary already matched a word inside this span)
      const mapped = claims.filter((c) => overlaps(c, span));
      if (mapped.length) { for (const c of mapped) c.nanoAgrees = true; continue; }
      const term = locateSpan(spec.text, ing.term) ? ing.term : evidence;
      possible.push({ specId: spec.id, term, evidence, start: span.start, end: span.end, assertion: ing.assertion,
        allergen: "UNKNOWN", modelGuess: ALLERGENS.includes(ing.allergen_guess) ? ing.allergen_guess : "unknown", source: "nano" });
    }
    for (const a of nano.absences || []) {
      const span = locateSpan(spec.text, a.ingredient_evidence); // strict: ingredient_evidence must be in the spec
      if (!span) { rejected.push({ kind: "absence", term: a.ingredient, evidence: a.ingredient_evidence, reason: "ingredient not found in spec text" }); continue; }
      if (absences.some((x) => overlaps(x, span) && x.missing === a.missing)) continue;
      absences.push({ ingredient: spec.text.slice(span.start, span.end), missing: a.missing, start: span.start, end: span.end });
    }
    for (const p of possible) unresolved.push(`Possible allergen in "${p.term}" (${p.assertion}) — allergen UNKNOWN, verify`);
    for (const a of absences) unresolved.push(`"${a.ingredient}": ${a.missing.replace("_", " ")} not stated — could hide an allergen`);
  } else if (meta.nanoStatus !== "not_used") {
    unresolved.push(`On-device extraction did not run (${meta.nanoStatus}); unfamiliar wording not checked`);
  }

  const verified = claims.filter((c) => c.status === "verified");
  const contains = new Set(verified.filter((c) => c.assertion === ASSERTION.INTENTIONAL).map((c) => c.allergen));
  const mayContain = new Set(verified.filter((c) => c.assertion === ASSERTION.PRECAUTIONARY && !contains.has(c.allergen)).map((c) => c.allergen));

  if (nano) {
    // Per allergen (as before): flag only if NONE of the dictionary's spans for that allergen was also found by Nano.
    const dictIntentional = verified.filter((x) => x.source === "dictionary" && x.assertion === ASSERTION.INTENTIONAL);
    for (const a of new Set(dictIntentional.map((c) => c.allergen))) {
      const spans = dictIntentional.filter((c) => c.allergen === a);
      if (!spans.some((c) => c.nanoAgrees)) unresolved.push(`Dictionary found ${a} ("${spans[0].evidence}") but on-device model did not; kept as present, please confirm`);
    }
    for (const n of negatives) {
      if (n.allergen_guess && contains.has(n.allergen_guess)) unresolved.push(`Contradiction: spec says "${n.evidence}" but an ingredient contains ${n.allergen_guess}`);
    }
  }
  return { specId: spec.id, contains, mayContain, unresolved, claims, possible, absences, rejected };
}

/**
 * Apply a human reviewer's own determinations (never pre-filled from the model guess).
 * @param {Object<string,string>} dets   key `${specId}|${term}` -> allergen key or "none"
 */
export function applyDeterminations(profile, dets = {}) {
  if (!profile?.possible?.length) return profile;
  const contains = new Set(profile.contains);
  const mayContain = new Set(profile.mayContain);
  const claims = [...profile.claims];
  const possible = [];
  const resolvedTerms = new Set();
  for (const p of profile.possible) {
    const d = dets[`${p.specId}|${p.term}`];
    if (!d) { possible.push(p); continue; }
    resolvedTerms.add(p.term);
    if (d !== "none") {
      (p.assertion === ASSERTION.PRECAUTIONARY ? mayContain : contains).add(d);
      claims.push({ specId: p.specId, allergen: d, assertion: p.assertion, evidence: p.evidence, start: p.start, source: "reviewer", status: "verified" });
    }
  }
  const unresolved = profile.unresolved.filter((u) => ![...resolvedTerms].some((t) => u.startsWith(`Possible allergen in "${t}"`)));
  return { ...profile, contains, mayContain, claims, possible, unresolved };
}
