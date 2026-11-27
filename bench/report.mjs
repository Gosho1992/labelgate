// Turns a results JSON from the browser runner into a markdown report. Also cross-checks the rules arm vs Node.
import { readFileSync } from "node:fs";
import { score, latency } from "../src/bench/score.js";
const res = JSON.parse(readFileSync(process.argv[2], "utf8"));
const node = JSON.parse(readFileSync("bench/results/rules-node-2026-11-25.json", "utf8"));
const L = [];
L.push(`Run: ${res.started} → ${res.finished} · versions ${JSON.stringify(res.versions)} · transport ${res.transport}`);
L.push(`Browser: ${res.ua}`);
L.push(`Model calls: ${res.rows.length} (held-out v2 repeated ${res.repeatsV2}×)\n`);
const sets = [...new Set(res.rows.map((r) => r.set))];
for (const k of sets) {
  const rows = res.rows.filter((r) => r.set === k);
  const reps = [...new Set(rows.map((r) => r.rep))];
  L.push(`### ${k} — ${rows.length} runs`);
  L.push(`| Arm | Precision | Recall | Missed | Silent misses | False pos. | Review rate | Review recall | Unsupported claims | Contains exact |`);
  L.push(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const arm of ["rules", "nano", "hybrid"]) {
    const s = score(rows, arm);
    L.push(`| ${arm} | ${s.precision} | ${s.recall} | ${s.missed} | ${s.silentMisses} | ${s.falsePositives} | ${s.reviewRate} | ${s.reviewRecall} | ${s.unsupportedClaims} | ${s.containsExact} |`);
  }
  if (reps.length > 1) {
    L.push(`\nPer repeat (recall / silent misses / FP / review rate):`);
    for (const rep of reps) {
      const rr = rows.filter((r) => r.rep === rep);
      L.push(`- repeat ${rep + 1}: ` + ["nano", "hybrid"].map((a) => { const s = score(rr, a); return `${a} ${s.recall} / ${s.silentMisses} / ${s.falsePositives} / ${s.reviewRate}`; }).join(" · "));
    }
  }
  const lat = latency(rows);
  const st = rows.reduce((a, x) => ((a[x.nanoStatus] = (a[x.nanoStatus] || 0) + 1), a), {});
  L.push(`\nModel latency: p50 ${lat.p50} ms · p90 ${lat.p90} ms · max ${lat.max} ms · mean ${lat.mean} ms · statuses ${JSON.stringify(st)}`);
  // cross-check deterministic arm
  const nodeRules = node.sets[k]?.perCase;
  if (nodeRules) {
    const bad = rows.filter((r) => { const n = nodeRules.find((x) => x.id === r.case.id); return JSON.stringify(n.rules.c) !== JSON.stringify(r.rules.contains) || n.rules.review !== r.rules.review; });
    L.push(`Rules arm browser vs Node: ${bad.length ? "MISMATCH " + bad.map((r) => r.case.id).join(",") : "identical"}\n`);
  }
}
L.push(`### Per case (held-out v2, every repeat)`);
L.push(`| ID | Gold | Rules | Nano | Hybrid | ms |`);
L.push(`|---|---|---|---|---|---|`);
const f = (p) => `C:[${p.contains}]${p.may.length ? " M:[" + p.may + "]" : ""}${p.review ? " R" : ""}${p.unsupported.length ? " U:" + p.unsupported.length : ""}`;
for (const r of res.rows.filter((r) => r.set === "v2")) L.push(`| ${r.case.id}#${r.rep + 1} | C:[${r.case.gold.contains}]${r.case.gold.may.length ? " M:[" + r.case.gold.may + "]" : ""}${r.case.gold.review ? " R" : ""} | ${f(r.rules)} | ${f(r.nano)} | ${f(r.hybrid)} | ${r.ms} |`);
console.log(L.join("\n"));
