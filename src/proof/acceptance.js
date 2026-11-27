// Spec-to-Proof integration acceptance check: the app's real reading path (Firebase AI Logic ONLY_ON_DEVICE) +
// the app's real rules. Each distinct document is read once; cases that share a document reuse that reading.
import expected from "../../bench/acceptance/EXPECTED-2026-11-26.json";
import { readDocument } from "./read.js";
import { compare, blocking } from "./rules.js";
import { specs, formulas, currentSpecByItem } from "../data/sample.js";
import { dictionaryExtract } from "../allergens/dictionary.js";

const $ = (id) => document.getElementById(id);
const net = [];
new PerformanceObserver((l) => { for (const e of l.getEntries()) net.push({ url: e.name, at: performance.now() }); }).observe({ type: "resource", buffered: false });
const external = (u) => !u.startsWith(location.origin) && !u.startsWith("data:") && !u.startsWith("blob:");

function otherAllergens(sku) {
  const out = new Set();
  for (const line of formulas.find((f) => f.sku === sku).lines) {
    if (line.itemId === "SEAS-01") continue;
    const sp = specs[currentSpecByItem[line.itemId]];
    for (const c of dictionaryExtract(sp.id, sp.text).claims) if (c.assertion !== "precautionary") out.add(c.allergen);
  }
  return [...out];
}

const readings = {};
async function readOnce(kind, url) {
  if (readings[url]) return readings[url];
  $("status").textContent = `Reading ${kind} ${url} on device…`;
  const blob = await (await fetch(url)).blob();
  const t0 = performance.now();
  const r = await readDocument(kind, blob, "ACCEPT");
  const ext = net.filter((n) => n.at >= t0 && external(n.url)).map((n) => n.url);
  readings[url] = { kind, url, ok: r.ok, ms: r.ms, error: r.error ?? null, draft: r.draft ?? null, externalRequests: ext };
  $("rows").insertAdjacentHTML("beforeend", `<tr><td colspan="5">read ${kind} ${url}: ${r.ok ? "ok" : "ERROR " + r.error} · ${r.ms} ms · issues ${r.draft?.issues.length ?? "-"} · external ${ext.length}</td></tr>`);
  return readings[url];
}

$("btn-run").onclick = async () => {
  const t0 = new Date().toISOString();
  const results = [];
  for (const c of expected.cases) {
    const sp = await readOnce("spec", expected.spec_readings[c.spec]);
    const lb = await readOnce("label", c.label);
    let outcome = "READ_ERROR", detail = null;
    if (sp.ok && lb.ok) {
      const label = { ...lb.draft, ...(c.correction || {}), confirmed: true };
      const spec = { ...sp.draft, allergen_statement_printed: sp.draft.allergen_statement_english || sp.draft.allergen_statement_printed, confirmed: true };
      const r = compare({ spec, label, otherAllergens: otherAllergens(c.sku) });
      outcome = r.state;
      detail = { findings: r.findings.map((f) => `${f.allergen}:${f.status}`), specAllergens: r.sources?.allergens, reasons: r.reasons };
    }
    const issues = [...(sp.draft?.issues ?? []), ...(lb.draft?.issues ?? [])];
    // What the APP shows: a reading with an unresolved problem cannot be confirmed, so the case stays NEEDS_REVIEW
    // until the reviewer corrects it or explicitly acknowledges it. (Run 1 reported the raw rules outcome instead.)
    const productOutcome = blocking(issues).length ? "NEEDS_REVIEW" : outcome;
    const pass = c.expect === "NOT_SILENT_CLEAR" ? (outcome !== "CHECKS_CLEAR_AWAITING_SIGNOFF" || blocking(issues).length > 0) : outcome === c.expect;
    const row = { id: c.id, expect: c.expect, outcome, productOutcome, pass, issues: issues.map((i) => i.msg), detail, correction: c.correction ?? null };
    results.push(row);
    $("rows").insertAdjacentHTML("beforeend", `<tr class="${pass ? "ok" : "bad"}"><td>${c.id}</td><td>${c.expect}</td><td>${outcome}</td><td>app: ${productOutcome}</td><td>${pass ? "PASS" : "FAIL"}</td><td>${issues.length} issue(s)</td></tr>`);
  }
  window.__acc = { started: t0, finished: new Date().toISOString(), ua: navigator.userAgent, readings, results };
  $("status").textContent = `Done. ${results.filter((r) => r.pass).length}/${results.length} as expected.`;
};
