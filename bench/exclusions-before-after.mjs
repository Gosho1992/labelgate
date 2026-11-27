// Before/after for the Nov 26 look-alike exclusions, rules arm only (deterministic), on the frozen v2 cases.
// "before" = bench/results/rules-node-2026-11-25.json (dictionary 2026.11.25-1, untouched). v2 results are not modified.
import { readFileSync } from "node:fs";
import { detectFromOutput, MODE, VERSIONS } from "../src/detect/pipeline.js";
import { toPrediction, score } from "../src/bench/score.js";
import { SETS } from "../src/bench/sets.js";
const before = JSON.parse(readFileSync("bench/results/rules-node-2026-11-25.json", "utf8"));
const out = { after: VERSIONS.dictionary, before: before.versions.dictionary, sets: {} };
for (const s of SETS) {
  const rows = s.cases.map((c) => ({ case: c, rules: toPrediction(detectFromOutput({ id: c.id, text: c.text }, { mode: MODE.RULES })) }));
  const changed = rows.filter((r) => { const b = before.sets[s.key].perCase.find((x) => x.id === r.case.id); return JSON.stringify(b.rules.c) !== JSON.stringify(r.rules.contains); })
    .map((r) => ({ id: r.case.id, before: before.sets[s.key].perCase.find((x) => x.id === r.case.id).rules.c, after: r.rules.contains, gold: r.case.gold.contains }));
  out.sets[s.key] = { before: before.sets[s.key].rules, after: score(rows, "rules"), changed };
}
console.log(JSON.stringify(out, null, 1));
