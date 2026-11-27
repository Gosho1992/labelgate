// Deterministic arm (rules) on the app pipeline, in Node. Cross-checks the browser run.
import { detectFromOutput, MODE, VERSIONS } from "../src/detect/pipeline.js";
import { toPrediction, score } from "../src/bench/score.js";
import { SETS } from "../src/bench/sets.js";
const out = { versions: VERSIONS, sets: {} };
for (const s of SETS) {
  const rows = s.cases.map((c) => ({ case: c, rules: toPrediction(detectFromOutput({ id: c.id, text: c.text }, { mode: MODE.RULES })) }));
  out.sets[s.key] = { name: s.name, rules: score(rows, "rules"), perCase: rows.map((r) => ({ id: r.case.id, gold: r.case.gold, rules: { c: r.rules.contains, m: r.rules.may, review: r.rules.review } })) };
}
console.log(JSON.stringify(out, null, 1));
