// Browser benchmark: runs the APP's detect() pipeline (same dictionary, prompt, schema, validation, profile code)
// on every case. The model is called ONCE per case; the three arms are derived from that one output.
import { detect, detectFromOutput, MODE, VERSIONS } from "../detect/pipeline.js";
import { checkAvailability, ensureReady, onNanoChange, nano, activeRunner, getTransport, setTransport } from "../ai/nano.js";

// ?transport=prompt-api|firebase-ai-logic (default: whatever is configured; Firebase when the build has Firebase config)
const qp = new URLSearchParams(location.search).get("transport");
if (qp) setTransport(qp);
let initInfo = null;
import { toPrediction, score, latency } from "./score.js";
import { SETS_V3 as SETS } from "./sets.js";
import { scoreV3, stability } from "./score-v3.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let results = null;

onNanoChange((n) => { $("status").textContent = `Model state: ${n.state}${n.state === "downloading" ? " " + Math.round(n.progress * 100) + "%" : ""}${n.error ? " (" + n.error + ")" : ""}`; });

$("btn-model").onclick = async () => {
  const before = nano.state, t0 = performance.now();
  const ok = await ensureReady();
  initInfo = { stateBefore: before, initMs: Math.round(performance.now() - t0), downloaded: before === "downloadable" || before === "downloading" };
  $("btn-run").disabled = !ok;
  if (ok) $("status").textContent = "Model ready. Click Run.";
};

$("btn-run").onclick = async () => {
  $("btn-run").disabled = true;
  const repeatsV2 = Number($("repeats").value) || 1;
  const rows = [];
  const plan = [];
  for (const s of SETS) for (let rep = 0; rep < repeatsV2; rep++) for (const c of s.cases) plan.push({ s, c, rep });
  const started = new Date().toISOString();
  for (let i = 0; i < plan.length; i++) {
    const { s, c, rep } = plan[i];
    $("status").textContent = `Case ${i + 1}/${plan.length} · ${s.key} ${c.id}${rep ? " (repeat " + (rep + 1) + ")" : ""}`;
    const spec = { id: c.id, text: c.text };
    const nanoRun = await detect(spec, { mode: MODE.NANO, runner: activeRunner(), timeoutMs: 120000 });
    const status = nanoRun.nanoStatus === "malformed" ? "ok" : nanoRun.nanoStatus;
    const row = {
      transport: getTransport(), outChars: JSON.stringify(nanoRun.rawNano ?? "").length,
      set: s.key, rep, case: c, ms: nanoRun.ms, nanoStatus: nanoRun.nanoStatus, error: nanoRun.error ?? null, rawNano: nanoRun.rawNano,
      rules: toPrediction(detectFromOutput(spec, { mode: MODE.RULES })),
      nano: toPrediction(nanoRun.profile),
      hybrid: toPrediction(detectFromOutput(spec, { mode: MODE.HYBRID, rawNano: nanoRun.rawNano, nanoStatus: status })),
    };
    rows.push(row);
    render(rows);
  }
  results = { versions: VERSIONS, transport: getTransport(), initInfo, ua: navigator.userAgent, started, finished: new Date().toISOString(), repeatsV2, rows };
  $("status").textContent = `Done. ${rows.length} model calls.`;
  $("btn-copy").disabled = false; $("btn-dl").disabled = false;
};

function summarise(rows) {
  const out = {};
  for (const s of SETS) {
    const r = rows.filter((x) => x.set === s.key);
    if (!r.length) continue;
    out[s.key] = { name: s.name, v3: Object.fromEntries(["rules", "nano", "hybrid"].map((a) => [a, scoreV3(r, a)])), stability: Object.fromEntries(["nano", "hybrid"].map((a) => [a, stability(r, a)])), latency: latency(r), statuses: r.reduce((a, x) => ((a[x.nanoStatus] = (a[x.nanoStatus] || 0) + 1), a), {}) };
  }
  return out;
}

function render(rows) {
  const sum = summarise(rows);
  let h = "";
  for (const [k, v] of Object.entries(sum)) {
    h += `<h3>${esc(v.name)} — ${rows.filter((x) => x.set === k).length} runs</h3><table><tr><th>Arm</th><th>Ingredient ID precision</th><th>Ingredient ID recall</th><th>Class. correct</th><th>Wrong category</th><th>Left UNKNOWN for human</th><th>Ambiguous flagged / overclaimed</th><th>False-pos. allergens</th><th>Silent misses</th><th>Review rate</th><th>Unsupported evidence / absence</th></tr>`;
    for (const arm of ["rules", "nano", "hybrid"]) {
      const s = v.v3[arm];
      h += `<tr><td>${arm}</td><td>${s.identification.precision}</td><td>${s.identification.recall} (${s.identification.found})</td><td>${s.classification.correct}</td><td>${s.classification.wrongCategory}</td><td>${s.classification.leftUnknownForHuman}</td><td>${s.ambiguous.flaggedForHuman}/${s.ambiguous.overclaimed} of ${s.ambiguous.total}</td><td>${s.falsePositiveAllergens} ${esc(s.fpIds.join(","))}</td><td>${s.silentMisses} ${esc(s.silentIds.join(","))}</td><td>${s.reviewRate}</td><td>${s.unsupportedEvidence} / ${s.unsupportedAbsence}</td></tr>`;
    }
    h += `</table><p>Model latency: p50 ${v.latency.p50} ms · p90 ${v.latency.p90} ms · max ${v.latency.max} ms · statuses ${esc(JSON.stringify(v.statuses))} · stability ${esc(JSON.stringify(v.stability))}</p>`;
  }
  $("summary").innerHTML = h;
  $("detail").innerHTML = `<table><tr><th>Set</th><th>ID</th><th>Text</th><th>Gold</th><th>Rules</th><th>Nano</th><th>Hybrid</th><th>ms</th></tr>${rows.map((r) => {
    const f = (p) => `C:[${p.contains}]${p.possible.length ? " ?:" + p.possible.map((x) => `${x.term}(guess ${x.modelGuess})`).join(";") : ""}${p.absences.length ? " ABS:" + p.absences.map((a) => a.ingredient).join(";") : ""}${p.review ? " REVIEW" : ""}${p.unsupported.length ? " REJ:" + p.unsupported.length : ""}`;
    const gold = [...new Set(r.case.ingredients.filter((i) => i.allergen !== "ambiguous").map((i) => i.allergen))].sort();
    const ok = (p) => (JSON.stringify(p.contains) === JSON.stringify(gold) ? "ok" : "bad");
    return `<tr><td>${r.set}${r.rep ? "#" + (r.rep + 1) : ""}</td><td>${r.case.id}</td><td>${esc(r.case.text)}</td><td>${esc(r.case.ingredients.map((i) => i.term + "=" + i.allergen).join("; "))}${r.case.review ? " REVIEW" : ""}</td><td class="${ok(r.rules)}">${esc(f(r.rules))}</td><td class="${ok(r.nano)}">${esc(f(r.nano))}</td><td class="${ok(r.hybrid)}">${esc(f(r.hybrid))}</td><td>${r.ms}</td></tr>`;
  }).join("")}</table>`;
}

$("btn-copy").onclick = async () => {
  const txt = JSON.stringify({ ...results, summary: summarise(results.rows) });
  try { await navigator.clipboard.writeText(txt); $("status").textContent = `Copied ${txt.length} characters.`; }
  catch (e) { $("out").value = txt; $("out").style.display = "block"; $("out").select(); document.execCommand("copy"); $("status").textContent = `Copied via textarea (${txt.length} chars).`; }
};
$("btn-dl").onclick = () => {
  const b = new Blob([JSON.stringify({ ...results, summary: summarise(results.rows) }, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "labelgate-v3-results.json"; a.click();
};

$("versions").textContent = JSON.stringify({ ...VERSIONS, transport: getTransport() });
checkAvailability().then((s) => { $("btn-run").disabled = s !== "available" && s !== "ready"; if (s === "available") ensureReady().then((ok) => ($("btn-run").disabled = !ok)); });
