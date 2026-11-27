// Privacy test E: run a PRIVATE synthetic spec full of unique canary strings through the real app path
// (Firebase AI Logic ONLY_ON_DEVICE -> detect() -> gate), while recording every network request the page makes
// (fetch / XHR / sendBeacon / WebSocket wrapped + PerformanceObserver for everything else, e.g. scripts/images).
// Then search every recorded URL and body for every canary. Also used for test C (DevTools offline).
import { extractSpec, audit } from "../ai/extract.js";
import { evaluate } from "../engine/gate.js";
import { checkAvailability, ensureReady, onNanoChange, nano, getTransport } from "../ai/nano.js";
import { appCheckStatus, firebaseConfigured } from "../ai/firebase.js";
import { PRIVACY } from "../engine/router.js";

const CANARY = {
  supplier: "ZQXCANARY-SUPPLIER-7731",
  sku: "SKU-CANARY-55219",
  formula: "FORMULA-CANARY-90417",
  ingredient: "canaryquillium flour 88412",
  evidence: "milk powder lot CANARYLOT-6634",
  label: "LABEL-CANARY-30158",
};
const spec = { id: "CANARY@1", itemId: "CANARY-ITEM", supplier: CANARY.supplier, revision: 1,
  text: `Supplier: ${CANARY.supplier}. Product code ${CANARY.formula}. Ingredients: rice flour, ${CANARY.ingredient}, ${CANARY.evidence}, salt. Packed for ${CANARY.sku}.` };
const formulas = [{ sku: CANARY.sku, name: `Canary bar ${CANARY.formula}`, revision: 1, lines: [{ itemId: "CANARY-ITEM", pct: 100 }] }];
const labels = [{ id: CANARY.label, sku: CANARY.sku, ingredientStatement: `Rice flour, ${CANARY.ingredient}, salt.`, containsStatement: null, approval: null }];

const log = [];
let recording = false;
const rec = (kind, url, body) => { if (recording) log.push({ kind, url: String(url), body: body == null ? "" : typeof body === "string" ? body : (() => { try { return JSON.stringify(body); } catch { return String(body); } })(), at: performance.now() }); };
const of = window.fetch;
window.fetch = function (input, init) { rec("fetch", input?.url ?? input, init?.body); return of.apply(this, arguments); };
const ox = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return ox.apply(this, arguments); };
XMLHttpRequest.prototype.send = function (b) { rec("xhr", this.__u, b); return os.apply(this, arguments); };
const ob = navigator.sendBeacon?.bind(navigator);
if (ob) navigator.sendBeacon = (u, d) => { rec("beacon", u, d); return ob(u, d); };
const OW = window.WebSocket;
window.WebSocket = function (u, p) { rec("websocket", u, ""); const w = new OW(u, p); const s = w.send.bind(w); w.send = (d) => { rec("ws-send", u, d); s(d); }; return w; };
new PerformanceObserver((l) => { for (const e of l.getEntries()) rec(`resource:${e.initiatorType}`, e.name, ""); }).observe({ type: "resource", buffered: false });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
onNanoChange((n) => ($("model").textContent = `Model: ${n.state}${n.error ? " (" + n.error + ")" : ""} · transport ${getTransport()}`));

$("btn-init").onclick = async () => { const t0 = performance.now(); const ok = await ensureReady(); $("init").textContent = `ensureReady=${ok} in ${Math.round(performance.now() - t0)} ms`; };
let runN = 0;
const BASE_TEXT = spec.text;
$("btn-run").onclick = async () => {
  // Each repeat gets a run number in the text so the content-hash cache misses and Nano really runs again
  // (needed for test C: offline after init must be a fresh on-device run, not a cache hit).
  runN++; spec.text = runN === 1 ? BASE_TEXT : `${BASE_TEXT} Test run ${runN}.`;
  log.length = 0; recording = true;
  $("out").textContent = `Running private analysis… navigator.onLine=${navigator.onLine}`;
  const t0 = performance.now();
  const r = await extractSpec(spec, { online: navigator.onLine, privacy: PRIVACY.PRIVATE, timeoutMs: 120000 });
  const findings = evaluate({ formulas, labels, currentSpecByItem: { "CANARY-ITEM": "CANARY@1" }, profiles: { "CANARY@1": r.profile } });
  await new Promise((res) => setTimeout(res, 3000)); // catch late requests
  recording = false;
  const hits = [];
  for (const e of log) for (const [k, v] of Object.entries(CANARY)) if (e.url.includes(v) || e.body.includes(v)) hits.push({ canary: k, kind: e.kind, url: e.url });
  const external = log.filter((e) => !e.url.startsWith(location.origin));
  const report = {
    when: new Date().toISOString(), run: runN, ua: navigator.userAgent, online: navigator.onLine, transport: getTransport(),
    nanoStatus: r.nanoStatus, ms: Math.round(performance.now() - t0), cached: r.cached,
    contains: [...r.profile.contains], possible: r.profile.possible.map((p) => ({ term: p.term, modelGuess: p.modelGuess })), state: findings[0].state,
    requestsDuringAnalysis: log.map((e) => ({ kind: e.kind, url: e.url.slice(0, 200), bodyChars: e.body.length })),
    externalRequests: external.length, canaryHits: hits, canaries: CANARY,
    auditLastEntry: audit.at(-1),
  };
  window.__privacyReport = report;
  $("out").innerHTML = `<b>${hits.length === 0 ? "PASS" : "FAIL"}</b>: ${hits.length} canary hits in ${log.length} requests recorded during analysis (${external.length} to other origins).<br>
    nanoStatus=${esc(r.nanoStatus)} · transport=${esc(getTransport())} · state=${esc(findings[0].state)} · ${report.ms} ms<pre>${esc(JSON.stringify(report, null, 1))}</pre>`;
};
$("btn-copy").onclick = () => navigator.clipboard.writeText(JSON.stringify(window.__privacyReport));
$("btn-appcheck").onclick = async () => { $("appcheck").textContent = JSON.stringify(await appCheckStatus()); };
$("spec").textContent = spec.text;
$("cfg").textContent = `Firebase configured: ${firebaseConfigured}`;
checkAvailability();
