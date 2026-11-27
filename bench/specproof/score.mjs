// Scorer for specproof-v1. Written and frozen BEFORE looking at any evaluation output.
// Usage: node score.mjs results.json   (results = window.__specproof from the harness)
import { readFileSync } from "node:fs";
import { decideLabel, specAllergens } from "../../src/specproof/decide.js";
const HERE = new URL(".", import.meta.url).pathname;
const gold = JSON.parse(readFileSync(HERE + "specproof-v1.json", "utf8"));
const res = JSON.parse(readFileSync(process.argv[2], "utf8"));
const G = Object.fromEntries([...gold.specs, ...gold.labels].map((c) => [c.id, c]));

const norm = (s) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/[\s　]+/g, " ").replace(/[.,;:]+$/g, "").trim();
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
const ratio = (a, b) => { a = norm(a); b = norm(b); return a || b ? 1 - lev(a, b) / Math.max(a.length, b.length) : 1; };
// An extracted ingredient MATCHES a gold ingredient if similarity >= 0.85 (tolerates OCR-level slips, not different words).
const MATCH = 0.85;
const pct = (x) => Math.round(x * 1000) / 10;
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };

const rows = res.results;
const out = { meta: res.meta, specs: [], labels: [], stress: [] };
let gTot = 0, gHit = 0, gExact = 0, eTot = 0, eFab = 0, specAllergenExact = 0, specMissed = 0, specExtra = 0;
for (const r of rows.filter((r) => r.kind === "spec" && !r.id.startsWith("U"))) {
  const g = G[r.id], ex = r.parsed?.ingredients || [];
  const otherText = [g.supplier, g.product, g.allergen_statement_printed].filter(Boolean);
  const per = g.ingredients.map((gi) => {
    const best = ex.reduce((b, e) => Math.max(b, ratio(e.printed, gi.printed)), 0);
    const exact = ex.some((e) => norm(e.printed) === norm(gi.printed));
    return { gold: gi.printed, hit: best >= MATCH, exact, best: Math.round(best * 100) / 100 };
  });
  const fab = ex.filter((e) => !g.ingredients.some((gi) => ratio(e.printed, gi.printed) >= MATCH) && !otherText.some((t) => ratio(e.printed, t) >= MATCH || norm(t).includes(norm(e.printed))));
  const pred = specAllergens(r.parsed).allergens;
  const missed = g.allergens.filter((a) => !pred.includes(a)), extra = pred.filter((a) => !g.allergens.includes(a));
  gTot += per.length; gHit += per.filter((p) => p.hit).length; gExact += per.filter((p) => p.exact).length;
  eTot += ex.length; eFab += fab.length; specMissed += missed.length; specExtra += extra.length; if (!missed.length && !extra.length) specAllergenExact++;
  out.specs.push({ id: r.id, lang: g.language, cond: r.condition, ms: r.ms, legibleFlag: r.parsed?.legible ?? null, recall: `${per.filter((p) => p.hit).length}/${per.length}`, fabricated: fab.map((f) => f.printed), goldAllergens: g.allergens, predicted: pred, missed, extra, misses: per.filter((p) => !p.hit) });
}
let lOk = 0, falseBlocks = 0, errFlagged = 0, errTot = 0, simSum = 0, contOk = 0;
for (const r of rows.filter((r) => r.kind === "label" && !r.id.startsWith("U"))) {
  const g = G[r.id];
  const dec = decideLabel(g.formula_allergens, r.parsed).decision;
  const sim = ratio(r.parsed?.ingredient_list_printed, g.ingredient_list_printed);
  const cOk = (g.contains_printed == null && !r.parsed?.contains_printed) || (g.contains_printed && ratio(r.parsed?.contains_printed, g.contains_printed) >= 0.95);
  simSum += sim; if (cOk) contOk++;
  const disputed = r.id === "L08";
  const correct = g.expected === "CLEAR" ? dec === "CLEAR_AWAITING_SIGNOFF" : dec === "BLOCK";
  if (!disputed && correct) lOk++;
  if (g.expected === "CLEAR" && dec === "BLOCK") falseBlocks++;
  if (g.expected === "BLOCK" && !disputed) { errTot++; if (dec !== "CLEAR_AWAITING_SIGNOFF") errFlagged++; }
  out.labels.push({ id: r.id, cond: r.condition, ms: r.ms, legibleFlag: r.parsed?.legible ?? null, expected: g.expected, decision: dec, disputed, transcriptionSimilarity: Math.round(sim * 1000) / 1000, containsCorrect: cOk, read: { ing: r.parsed?.ingredient_list_printed, contains: r.parsed?.contains_printed } });
}
for (const r of rows.filter((r) => r.id.startsWith("U"))) {
  const g = G[r.id === "U01" ? "S07" : "L09"];
  const d = r.kind === "spec" ? specAllergens(r.parsed).status : decideLabel(g.formula_allergens, r.parsed).decision;
  out.stress.push({ id: r.id, kind: r.kind, outcome: d, expected: "NEEDS_REVIEW", parsed: r.parsed });
}
const ms = rows.map((r) => r.ms);
out.summary = {
  runs: rows.length, onDevice: rows.filter((r) => r.inferenceSource === "on_device").length, errors: rows.filter((r) => r.error).map((r) => `${r.id}: ${r.error}`),
  externalRequestsDuringInference: rows.reduce((a, r) => a + r.externalRequests.length, 0),
  specIngredientRecall: `${gHit}/${gTot} = ${pct(gHit / gTot)}%`, specExactQuote: `${gExact}/${gTot} = ${pct(gExact / gTot)}%`,
  fabricatedIngredients: `${eFab} of ${eTot} extracted`, specAllergenSetsExact: `${specAllergenExact}/10`, specAllergensMissed: specMissed, specAllergensExtra: specExtra,
  labelDecisionsCorrectExclL08: `${lOk}/9`, falseBlocksOnCompliant: falseBlocks, deliberateErrorsFlaggedExclL08: `${errFlagged}/${errTot}`,
  labelTranscriptionSimilarityMean: Math.round((simSum / 10) * 1000) / 1000, containsLineCorrect: `${contOk}/10`,
  latencyMs: { p50: q(ms, 0.5), p90: q(ms, 0.9), max: Math.max(...ms) },
  legibleFlagFalse: rows.filter((r) => r.parsed && r.parsed.legible === false).length,
};
console.log(JSON.stringify(out, null, 1));
