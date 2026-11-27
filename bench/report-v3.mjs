import { readFileSync } from "node:fs";
import { scoreV3, stability } from "../src/bench/score-v3.js";
import { latency } from "../src/bench/score.js";
const res = JSON.parse(readFileSync(process.argv[2], "utf8"));
const rows = res.rows;
const L = [];
L.push(`Run ${res.started} → ${res.finished} · ${JSON.stringify(res.versions)} · ${res.transport}`);
L.push(`${new Set(rows.map((r) => r.case.id)).size} unique cases × ${res.repeatsV2} repeats = ${rows.length} runs (repeats measure stability, not sample size)\n`);
L.push(`| Arm | Ingredient ID precision | Ingredient ID recall | Classified correctly | Wrong category | Left UNKNOWN for human | Not identified | Precision of confirmed allergens | Ambiguous: flagged / overclaimed | False-positive allergens | Silent misses | Review rate | Unsupported evidence / absence |`);
L.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
const S = {};
for (const a of ["rules", "nano", "hybrid"]) {
  const s = (S[a] = scoreV3(rows, a));
  L.push(`| ${a} | ${s.identification.precision} | ${s.identification.recall} (${s.identification.found}) | ${s.classification.correct} | ${s.classification.wrongCategory} | ${s.classification.leftUnknownForHuman} | ${s.classification.notIdentified} | ${s.classification.precisionOfConfirmed} | ${s.ambiguous.flaggedForHuman} / ${s.ambiguous.overclaimed} of ${s.ambiguous.total} | ${s.falsePositiveAllergens} | ${s.silentMisses} | ${s.reviewRate} | ${s.unsupportedEvidence} / ${s.unsupportedAbsence} |`);
}
const lat = latency(rows);
L.push(`\nLatency (CPU VM): p50 ${lat.p50} ms · p90 ${lat.p90} ms · max ${lat.max} ms · mean ${lat.mean} ms. Statuses ${JSON.stringify(rows.reduce((a, x) => ((a[x.nanoStatus] = (a[x.nanoStatus] || 0) + 1), a), {}))}`);
L.push(`Stability: nano ${stability(rows, "nano")}; hybrid ${stability(rows, "hybrid")}`);
L.push(`\nWrong-category details (nano arm = model guesses): ${S.nano.classification.wrongDetails.join(" · ") || "none"}`);
L.push(`Wrong-category details (hybrid): ${S.hybrid.classification.wrongDetails.join(" · ") || "none"}`);
L.push(`False-positive allergens: rules ${S.rules.fpIds.join(",") || "-"} | nano ${S.nano.fpIds.join(",") || "-"} | hybrid ${S.hybrid.fpIds.join(",") || "-"}`);
L.push(`Silent misses: rules ${S.rules.silentIds.join(",") || "-"} | nano ${S.nano.silentIds.join(",") || "-"} | hybrid ${S.hybrid.silentIds.join(",") || "-"}`);
// review reasons breakdown (hybrid)
const reasons = {};
for (const r of rows) { const kinds = new Set(r.hybrid.unresolved.map((u) => u.startsWith("Possible allergen") ? "nano_unknown_ingredient" : u.startsWith("Dictionary found") ? "dict_without_nano" : / not stated/.test(u) ? "grounded_absence" : u.startsWith("Ingredient with unspecified") ? "dict_ambiguity" : u.startsWith("Contradiction") ? "contradiction" : "other")); for (const k of kinds) reasons[k] = (reasons[k] || 0) + 1; }
L.push(`Hybrid review reasons (runs containing each): ${JSON.stringify(reasons)}`);
L.push(`\n### Per run (hybrid shows confirmed C, UNKNOWN ?:term(guess), grounded absences ABS)`);
L.push(`| Case | Gold | Rules | Nano | Hybrid | ms |`);
L.push(`|---|---|---|---|---|---|`);
const f = (p) => `C:[${p.contains}]${p.possible.length ? " ?:" + p.possible.map((x) => `${x.term}(${x.modelGuess})`).join("; ") : ""}${p.absences.length ? " ABS:" + p.absences.map((a) => a.ingredient).join("; ") : ""}${p.review ? " R" : ""}${p.unsupported.length + p.unsupportedAbsences.length ? ` REJ:${p.unsupported.length}/${p.unsupportedAbsences.length}` : ""}`;
for (const r of rows) L.push(`| ${r.case.id}#${r.rep + 1} | ${r.case.ingredients.map((i) => `${i.term}=${i.allergen}`).join("; ") || "none"}${r.case.review ? " R" : ""} | ${f(r.rules)} | ${f(r.nano)} | ${f(r.hybrid)} | ${r.ms} |`);
console.log(L.join("\n"));
