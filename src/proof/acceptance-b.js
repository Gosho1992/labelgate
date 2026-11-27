// Acceptance set B (frozen in bench/acceptance/FROZEN-B.txt before any run). Uses the app's real reading path
// (Firebase AI Logic, ONLY_ON_DEVICE, streaming, privacy guard) and the app's real rules and verified label library.
// Every distinct document is read once. Raw model output, inferenceSource, duration and every external network
// request during each read are recorded. Network requests are split into App Check / reCAPTCHA traffic and anything else.
import expected from "../../bench/acceptance/EXPECTED-B-2026-11-26.json";
import { readDocument } from "./read.js";
import { compare, blocking, specSources } from "./rules.js";
import { currentRecord, labelDiff } from "./library.js";
import { specs, formulas, currentSpecByItem } from "../data/sample.js";
import { dictionaryExtract } from "../allergens/dictionary.js";

const $ = (id) => document.getElementById(id);
const net = [];
new PerformanceObserver((l) => { for (const e of l.getEntries()) net.push({ url: e.name, at: performance.now(), type: e.initiatorType, bytes: e.encodedBodySize }); }).observe({ type: "resource", buffered: false });
const external = (u) => !u.startsWith(location.origin) && !u.startsWith("data:") && !u.startsWith("blob:");
const classify = (u) => /recaptcha|gstatic\.com|www\.google\.com\/recaptcha|firebaseappcheck|content-firebaseappcheck/.test(u) ? "app_check_recaptcha"
  : /firebasevertexai|aiplatform|generativelanguage|firebaseml/.test(u) ? "MODEL_ENDPOINT" : "other";

function otherAllergens(sku) {
  const out = new Set();
  for (const line of formulas.find((f) => f.sku === sku).lines) {
    if (line.itemId === "SEAS-01") continue;
    const sp = specs[currentSpecByItem[line.itemId]];
    for (const c of dictionaryExtract(sp.id, sp.text).claims) if (c.assertion !== "precautionary") out.add(c.allergen);
  }
  return [...out];
}
async function sha(blob) { const b = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); }

const readings = {};
async function readOnce(kind, url) {
  if (readings[url]) return readings[url];
  $("status").textContent = `Reading ${kind} ${url} on this device…`;
  const blob = await (await fetch(url)).blob();
  const t0 = performance.now();
  const r = await readDocument(kind, blob, "ACCEPT-B");
  await new Promise((res) => setTimeout(res, 300));
  const ext = net.filter((n) => n.at >= t0 && external(n.url)).map((n) => ({ url: n.url.slice(0, 160), class: classify(n.url) }));
  readings[url] = { kind, url, sha256: await sha(blob), ok: r.ok, ms: r.ms, retried: r.retried ?? false, error: r.error ?? null, raw: r.raw ?? null,
    inferenceSource: r.inferenceSource ?? null, draft: r.draft ?? null, externalRequests: ext };
  $("rows").insertAdjacentHTML("beforeend", `<tr><td colspan="6">read ${kind} ${url}: ${r.ok ? "ok" : "ERROR " + r.error} · ${(r.ms / 1000).toFixed(1)} s · source ${r.inferenceSource?.final ?? "-"} · issues ${r.draft?.issues.length ?? "-"} · external requests ${ext.length} (${ext.filter((e) => e.class !== "app_check_recaptcha").length} not App Check)</td></tr>`);
  return readings[url];
}
const specFor = (sp) => ({ ...sp.draft, allergen_statement_printed: sp.draft.allergen_statement_english || sp.draft.allergen_statement_printed, allergen_statement_original: sp.draft.allergen_statement_printed, confirmed: true });

function judge(c, r, sp, lbDraft) {
  const checks = [];
  if (c.expect) checks.push([`outcome ${c.expect}`, r.state === c.expect]);
  const src = specSources(specFor(sp));
  for (const a of c.mustRequire ?? []) checks.push([`spec requires ${a}`, src.allergens.includes(a)]);
  for (const a of c.mustNotRequire ?? []) checks.push([`spec does not require ${a}`, !src.allergens.includes(a)]);
  for (const a of c.mustBeMissing ?? []) checks.push([`${a} reported missing`, r.findings.some((f) => f.allergen === a && f.status === "missing")]);
  if (c.noIngredientMatching) checks.push([`no ingredient "${c.noIngredientMatching}"`, !sp.draft.ingredients.some((i) => `${i.printed} ${i.english}`.toLowerCase().includes(c.noIngredientMatching))]);
  return checks;
}

$("btn-run").onclick = async () => {
  $("btn-run").disabled = true;
  const started = new Date().toISOString(), results = [];
  for (const c of expected.cases) {
    const sp = await readOnce("spec", expected.spec_readings[c.spec]);
    const lb = await readOnce("label", c.label);
    let row = { id: c.id, topic: c.topic, expect: c.expect ?? c.expectRulesOnWrongReading };
    if (!sp.ok || !lb.ok) { row = { ...row, outcome: "READ_ERROR", pass: false }; }
    else if (c.inject) {
      // B6b: the reading is replaced by a deliberately wrong (injected) transcription.
      const wrong = { ...c.inject, confirmed: true };
      const onWrong = compare({ spec: specFor(sp), label: wrong, otherAllergens: otherAllergens(c.sku) });
      const diff = labelDiff(currentRecord(c.sku), wrong, lb.sha256);
      const diffText = `${diff.added.join(" | ")} || ${diff.containsAfter ?? ""}`;
      const shows = c.expectDiffShows.map((t) => [`diff shows "${t}"`, diffText.includes(t.replace(/\.$/, "")) ]);
      // reviewer correction = what the image actually shows (the frozen artwork text for B6)
      const corrected = { ingredient_list_printed: "INGREDIENTS: WHEAT FLOUR, SEASONING (SALT, MALTODEXTRIN, ONION POWDER, GARLIC POWDER, SPICES, YEAST EXTRACT, NATURAL FLAVOR, SILICON DIOXIDE).", contains_printed: null, precautionary_printed: null, confirmed: true };
      const afterFix = compare({ spec: specFor(sp), label: corrected, otherAllergens: otherAllergens(c.sku) });
      const checks = [[`rules on wrong reading = ${c.expectRulesOnWrongReading}`, onWrong.state === c.expectRulesOnWrongReading], ...shows, [`after correction = ${c.expectAfterReviewerCorrection}`, afterFix.state === c.expectAfterReviewerCorrection]];
      row = { ...row, injected: true, outcome: onWrong.state, diff, afterCorrection: afterFix.state, checks, pass: checks.every((x) => x[1]) };
    } else {
      const r = compare({ spec: specFor(sp), label: { ...lb.draft, confirmed: true }, otherAllergens: otherAllergens(c.sku) });
      const issues = [...sp.draft.issues, ...lb.draft.issues];
      const checks = judge(c, r, sp, lb.draft);
      row = { ...row, outcome: r.state, productOutcome: blocking(issues).length ? "NEEDS_REVIEW" : r.state, issues: issues.map((i) => i.msg),
        findings: r.findings.map((f) => `${f.allergen}:${f.status}`), specAllergens: specSources(specFor(sp)).allergens, reasons: r.reasons, checks, pass: checks.every((x) => x[1]) };
    }
    results.push(row);
    $("rows").insertAdjacentHTML("beforeend", `<tr class="${row.pass ? "ok" : "bad"}"><td>${c.id}</td><td>${c.topic}</td><td>${row.expect}</td><td>${row.outcome}${row.productOutcome ? ` · app: ${row.productOutcome}` : ""}${row.afterCorrection ? ` · after correction: ${row.afterCorrection}` : ""}</td><td>${row.pass ? "PASS" : "FAIL"}</td><td>${(row.checks || []).map(([k, v]) => `${v ? "✓" : "✗"} ${k}`).join("<br>")}</td></tr>`);
  }
  window.__accB = { started, finished: new Date().toISOString(), ua: navigator.userAgent, expectedFile: "bench/acceptance/EXPECTED-B-2026-11-26.json", readings, results };
  $("status").textContent = `Done. ${results.filter((r) => r.pass).length}/${results.length} as pre-registered.`;
};
