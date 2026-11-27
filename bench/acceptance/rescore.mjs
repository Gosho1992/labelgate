// Re-score run-1's STORED readings with the fixed rules (no new model calls). Same cases => NOT independent.
import { readFileSync } from "node:fs";
import { compare, checkSpecReading, checkLabelReading, blocking } from "/home/claude/labelgate-app/src/proof/rules.js";
import { specs, formulas, currentSpecByItem } from "/home/claude/labelgate-app/src/data/sample.js";
import { dictionaryExtract } from "/home/claude/labelgate-app/src/allergens/dictionary.js";
const R = JSON.parse(readFileSync("/home/claude/labelgate-app/bench/acceptance/results-run1-2026-11-26.json","utf8")).readings;
const E = JSON.parse(readFileSync("/home/claude/labelgate-app/bench/acceptance/EXPECTED-2026-11-26.json","utf8"));
const other = (sku) => { const o=new Set(); for (const l of formulas.find(f=>f.sku===sku).lines){ if(l.itemId==="SEAS-01")continue; const sp=specs[currentSpecByItem[l.itemId]]; for(const c of dictionaryExtract(sp.id,sp.text).claims) if(c.assertion!=="precautionary")o.add(c.allergen);} return [...o]; };
for (const c of E.cases) {
  const s = R[E.spec_readings[c.spec]].d, l = R[c.label].d;
  const sd = checkSpecReading({ ingredients: s.ing.map(([printed, english]) => ({ printed, english })), allergen_statement_printed: s.st });
  const ld = checkLabelReading({ ingredient_list_printed: l.ing, contains_printed: l.c }); if (l.m) ld.precautionary_printed = l.m;
  const issues = [...sd.issues, ...ld.issues];
  const r = compare({ spec: { ...sd, allergen_statement_printed: s.ste || s.st, confirmed: true }, label: { ...ld, ...(c.correction||{}), confirmed: true }, otherAllergens: other(c.sku) });
  const app = blocking(issues).length ? "NEEDS_REVIEW" : r.state;
  console.log(c.id, "expect", c.expect, "| rules", r.state, "| app", app, "|", r.findings.map(f=>f.allergen+":"+f.status).join(","), "|", issues.map(i=>i.kind).join(","));
}
