// LabelGate main workflow (Spec-to-Proof, verified label library).
// Gate 1 — supplier change: ONE on-device read of the new supplier spec -> reviewer confirms -> what changed (wording)
//   and what changed for allergens (rules) -> instant rule check of every affected product against its VERIFIED label
//   record (no AI). Gate 2 — artwork: new label artwork is read on device -> reviewer confirms -> rules -> QA sign-off ->
//   becomes the new verified record. Rules never run on unconfirmed or partial readings.
import { specs, formulas, currentSpecByItem } from "../data/sample.js";
import { dictionaryExtract } from "../allergens/dictionary.js";
import { privateDocumentModel, firebaseConfigured, warmUpDeviceModel } from "../ai/firebase.js";
import { readDocument, SPEC_SCHEMA, LABEL_SCHEMA } from "./read.js";
import { checkSpecReading, checkLabelReading, compare, specSources, specChanges, splitIngredients, blocking, STATE, RULESET, DISCLOSURE_TERMS } from "./rules.js";
import { TEST_ART, VARIANTS, pickVariant, RECORDED_SPEC_RAW, classify, saveRun, resultsHTML } from "./reviewer-test.js";
import { chainEntry, verifyChain, toCSV } from "./audit.js";
import { verificationQuestions, applyAnswers, orderOptions, UNSURE, anyUnsure } from "./verify.js";
import { mark, requestsSince } from "./privacy.js";
import { currentRecord, recordProblem, addVerifiedRecord, resetLocalRecords, sha256Hex, reapprove, approvalFor, labelDiff } from "./library.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ALLERGEN_NAME = { milk: "Milk", egg: "Egg", fish: "Fish", shellfish: "Crustacean shellfish", treenut: "Tree nuts", peanut: "Peanuts", wheat: "Wheat", soy: "Soy", sesame: "Sesame" };
const names = (a) => a.map((x) => ALLERGEN_NAME[x]).join(", ");
const stateLabel = (st) => st === STATE.BLOCK ? "PRINT BLOCKED" : st === STATE.REVIEW ? "NEEDS REVIEW" : st === STATE.CLEAR ? "CHECKS CLEAR" : "WAITING";

// ---------- the supplier change being reviewed (synthetic demo data) ----------
const CHANGE = { itemId: "SEAS-01", from: "SEAS-01@1", to: "SEAS-01@2", supplier: "Northfield Flavor Co.", product: "Savory Seasoning Blend SB-200", received: "2026-11-20", demoImage: "/demo/SEAS-01-rev2-es.jpg" };
const AFFECTED = formulas.filter((f) => f.lines.some((l) => l.itemId === CHANGE.itemId)).map((f) => f.sku);
const productName = (sku) => formulas.find((f) => f.sku === sku)?.name ?? sku;
const DEMO_ARTWORK = { "SKU-1001": { file: "/demo/LBL-1001-v4-corrected.png", note: "corrected artwork from the design agency" }, "SKU-1002": { file: "/demo/LBL-1002-v2.png", note: "current artwork" }, "SKU-1003": { file: "/demo/LBL-1003-v1.png", note: "current artwork (not yet corrected)" } };

// ---------- blind reviewer test (?reviewer-test=1, results at ?reviewer-test=results) — see reviewer-test.js ----------
const TEST_MODE = typeof location !== "undefined" ? new URLSearchParams(location.search).get("reviewer-test") : null;
const TEST = TEST_MODE === "1";
const TEST_VARIANT = TEST ? pickVariant() : null;
if (TEST) DEMO_ARTWORK["SKU-1003"] = TEST_ART;

// ---------- state ----------
const newDoc = () => ({ blob: null, url: null, name: null, sha: null, draft: null, confirmed: false, acks: new Set(), answers: {}, aiDraft: null, status: "idle", ms: null, error: null, partial: "" });
const S = {
  caseId: "SC-" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 5).toUpperCase(),
  docs: { spec: newDoc(), label: newDoc() },
  artSku: TEST ? "SKU-1003" : AFFECTED[0], open: new Set(), artResult: null,
};
const HISTORY_KEY = "labelgate.history.v2";
const loadHistory = () => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; } };
const saveHistory = (h) => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch { /* in memory only */ } };
let history = loadHistory();
// Every decision goes into a hash-chained log (audit.js). Writes are serialised so each entry links to the one before.
let chainTail = Promise.resolve();
let chainState = null; // result of the last verification, shown in the history panel
const record = (e) => {
  const entry = { at: new Date().toISOString(), caseId: S.caseId, supplierRevision: CHANGE.to, ruleset: `${RULESET.id} v${RULESET.version}`, ...e };
  history.push(entry); saveHistory(history);
  const idx = history.length - 1;
  chainTail = chainTail.then(async () => {
    const prev = [...history.slice(0, idx)].reverse().find((h) => h.hash)?.hash;
    history[idx] = await chainEntry(entry, prev);
    saveHistory(history); chainState = await verifyChain(history); renderHistoryOnly();
  });
};
const evidenceOf = (r) => (r?.findings ?? []).map((f) => ({ allergen: f.allergen, status: f.status, supplierEvidence: f.fromOtherItems ? "another ingredient of this product" : f.specEvidence, labelEvidence: f.labelEvidence ?? null, why: f.why }));

// ---------- device capability ----------
let deviceModel = "checking";
async function checkDevice() {
  if (typeof LanguageModel === "undefined") deviceModel = "unsupported";
  else {
    try { deviceModel = await LanguageModel.availability({ expectedInputs: [{ type: "text", languages: ["en", "es", "ja"] }, { type: "image" }], expectedOutputs: [{ type: "text", languages: ["en"] }] }); }
    catch { deviceModel = "unavailable"; }
  }
  if (!firebaseConfigured) deviceModel = "unavailable";
  renderDeviceNote();
  if (deviceModel === "available" && !TEST) {
    warm = "warming"; renderDeviceNote();
    warmUpDeviceModel().then((ms) => { warm = ms; renderDeviceNote(); const b = document.getElementById("badge-nano"); if (b) { b.textContent = "On-device model: ready (warmed up)"; b.className = "badge ok"; } }).catch(() => { warm = null; renderDeviceNote(); });
  }
}
let warm = null;
function renderDeviceNote() {
  const map = {
    available: ["ok", "Gemini Nano is ready on this device. Private documents are read locally."],
    downloadable: ["warn", "Gemini Nano is supported but not downloaded yet. The first read downloads it once (about 4 GB)."],
    downloading: ["warn", "Gemini Nano is downloading…"],
    unavailable: ["bad", "This device cannot run Gemini Nano. You can still type readings yourself to use the rule checks (no AI)."],
    unsupported: ["bad", "This browser has no on-device AI. Use desktop Chrome 148+, or type readings yourself to use the rule checks (no AI)."],
    checking: ["", "Checking on-device AI…"],
  };
  const [cls, txt] = map[deviceModel] || map.unavailable;
  const w = warm === "warming" ? " Loading the model into memory now (one time per visit, about 30–40 s on this kind of laptop) so the first read is faster." : typeof warm === "number" ? ` Model loaded and ready (warm-up took ${Math.round(warm / 1000)} s, no document content used).` : "";
  $("pf-device").className = "pf-device " + cls; $("pf-device").textContent = txt + w;
}
const canRead = () => deviceModel === "available" || deviceModel === "downloadable" || deviceModel === "downloading";

// ---------- documents ----------
async function setDoc(kind, blob, name) {
  const d = S.docs[kind];
  if (d.url) URL.revokeObjectURL(d.url);
  Object.assign(d, newDoc(), { blob, url: URL.createObjectURL(blob), name, sha: await sha256Hex(blob) });
  if (kind === "label") S.artResult = null;
  render();
  if (canRead()) read(kind); // reading starts as soon as the document arrives
}
async function loadDemo(kind) {
  const file = kind === "spec" ? CHANGE.demoImage : DEMO_ARTWORK[S.artSku].file;
  await setDoc(kind, await (await fetch(file)).blob(), file.split("/").pop());
}

let ticker = null;
async function read(kind) {
  const d = S.docs[kind];
  if (!d.blob || d.status === "reading") return;
  if (Object.values(S.docs).some((x) => x.status === "reading")) { d.status = "queued"; render(); return; }
  Object.assign(d, { status: "reading", error: null, partial: "", t0: performance.now() });
  render();
  clearInterval(ticker); ticker = setInterval(() => renderStatus(kind), 1000);
  try {
    if (deviceModel === "downloadable" || deviceModel === "downloading") {
      await privateDocumentModel(kind, kind === "spec" ? SPEC_SCHEMA : LABEL_SCHEMA).initializeDeviceModel?.(() => { d.download = true; renderStatus(kind); });
      deviceModel = "available"; renderDeviceNote();
    }
    const tNet = mark();
    const r = TEST ? await new Promise((res) => setTimeout(() => res(testReading(kind)), 2500))
      : await readDocument(kind, d.blob, S.caseId, { onText: (t) => { d.partial = t; renderLive(kind); } });
    await new Promise((res) => setTimeout(res, 300)); // let Resource Timing entries arrive
    const privacy = { sources: r.inferenceSource ?? null, requests: requestsSince(tNet) };
    if (r.ok) {
      Object.assign(d, { draft: r.draft, status: "read", ms: r.ms, retried: r.retried, confirmed: false, acks: new Set(), answers: {}, privacy,
        aiDraft: { ingredient_list_printed: r.draft.ingredient_list_printed, contains_printed: r.draft.contains_printed }, qSeed: `${S.caseId}|${Math.random()}` });
      if (kind === "label") S.kbFocus = true;
    } else Object.assign(d, { status: "error", error: r.error, ms: r.ms });
  } finally { clearInterval(ticker); }
  render();
  const other = kind === "spec" ? "label" : "spec";
  if (S.docs[other].status === "queued") read(other);
}

function testReading(kind) {
  if (kind === "spec") return { ok: true, ms: 0, retried: false, draft: { ...checkSpecReading(RECORDED_SPEC_RAW), allergen_statement_english: RECORDED_SPEC_RAW.allergen_statement_english } };
  const x = VARIANTS[TEST_VARIANT].reading, d = checkLabelReading(x);
  if (x.may_contain_printed) d.precautionary_printed = x.may_contain_printed;
  S.testShownAt = performance.now();
  return { ok: true, ms: 0, retried: false, draft: d };
}
function manual(kind) {
  const d = S.docs[kind];
  d.draft = kind === "spec" ? { ...checkSpecReading({ ingredients: [] }), issues: [], allergen_statement_english: null, manual: true }
    : { ...checkLabelReading({ ingredient_list_printed: "INGREDIENTS: ", contains_printed: null }), issues: [], manual: true };
  d.status = "read"; d.confirmed = false; render();
}
function recheck(kind) {
  const d = S.docs[kind], x = d.draft;
  if (kind === "spec") d.draft = { ...checkSpecReading({ ingredients: x.ingredients, allergen_statement_printed: x.allergen_statement_printed }, { keepEmpty: true }), allergen_statement_english: x.allergen_statement_english, manual: x.manual };
  else { const r = checkLabelReading({ ingredient_list_printed: x.ingredient_list_printed, contains_printed: x.contains_printed }); d.draft = { ...r, precautionary_printed: x.precautionary_printed ?? r.precautionary_printed, manual: x.manual }; }
  d.confirmed = false; if (kind === "label") S.artResult = null;
}
function confirm(kind) {
  const d = S.docs[kind];
  if (blocking(d.draft.issues).some((_, i) => !d.acks.has(i))) return;
  if (kind === "label" && labelQuestions().qs.some((q) => !d.answers[q.id])) return;
  d.confirmed = true;
  const reading = kind === "spec" ? { ingredients: d.draft.ingredients.map((i) => ({ printed: i.printed, english: i.english })), allergen_statement_printed: d.draft.allergen_statement_printed, allergen_statement_english: d.draft.allergen_statement_english }
    : { ingredient_list_printed: d.draft.ingredient_list_printed, contains_printed: d.draft.contains_printed, precautionary_printed: d.draft.precautionary_printed };
  record({ action: `confirmed ${kind === "spec" ? "supplier spec" : "artwork"} reading`, by: reviewerName(), readOnDevice: !d.draft.manual, sha256: d.sha, document: d.name, readingConfirmed: reading, problemsAcknowledged: blocking(d.draft.issues).map((i) => i.msg),
    ...(kind === "label" ? { sku: S.artSku, differencesVerified: labelQuestions().qs.map((q) => ({ question: q.prompt, answer: { new: "AI reading confirmed on the image", old: "approved wording chosen (AI reading rejected)", unsure: "reviewer could not tell (needs review)" }[d.answers[q.id]] })) } : {}) });
  if (kind === "label") runArtwork();
  if (TEST && kind === "label") {
    const c = { ingredient_list_printed: d.draft.ingredient_list_printed, contains_printed: d.draft.contains_printed };
    saveRun({ at: new Date().toISOString(), tester: reviewerName(), variant: TEST_VARIANT, ...classify(TEST_VARIANT, c), seconds: S.testShownAt ? Math.round((performance.now() - S.testShownAt) / 1000) : null, confirmed: c });
    S.testDone = true;
  }
  render();
  requestAnimationFrame(() => $(kind === "spec" ? "pf-impact-sec" : "pf-art-result").scrollIntoView({ behavior: "smooth", block: "start" }));
}

// ---------- rules ----------
function confirmedSpec() {
  const x = S.docs.spec.draft;
  return { ...x, allergen_statement_printed: x.allergen_statement_english || x.allergen_statement_printed, allergen_statement_original: x.allergen_statement_printed, confirmed: true };
}
function otherAllergensFor(sku) {
  const out = new Set();
  for (const line of formulas.find((x) => x.sku === sku)?.lines ?? []) {
    if (line.itemId === CHANGE.itemId) continue;
    const sp = specs[currentSpecByItem[line.itemId]];
    for (const c of dictionaryExtract(sp.id, sp.text).claims) if (c.assertion !== "precautionary") out.add(c.allergen);
  }
  return [...out];
}
function impactFor(sku) {
  const rec = currentRecord(sku);
  const problem = recordProblem(rec);
  if (!S.docs.spec.confirmed) return { rec, state: null };
  if (problem) return { rec, state: STATE.REVIEW, reasons: [problem] };
  const r = compare({ spec: confirmedSpec(), label: { ...rec, confirmed: true }, otherAllergens: otherAllergensFor(sku) });
  return { rec, ...r };
}
function runArtwork() {
  if (!S.docs.spec.confirmed || !S.docs.label.confirmed) { S.artResult = null; return; }
  S.artResult = compare({ spec: confirmedSpec(), label: { ...S.docs.label.draft, confirmed: true }, otherAllergens: otherAllergensFor(S.artSku) });
  // "I can't tell from the artwork image" is never a guess: the artwork goes to NEEDS REVIEW (it can still be blocked).
  const { qs } = labelQuestions(), d = S.docs.label;
  if (anyUnsure(qs, d.answers) && S.artResult.state !== STATE.BLOCK)
    S.artResult = { ...S.artResult, state: STATE.REVIEW, reasons: [`The reviewer could not tell from the artwork image: ${qs.filter((q) => d.answers[q.id] === "unsure").map((q) => q.prompt.replace("the picture", "the artwork")).join(" / ")} Check the printed proof or ask the design agency before sign-off.`, ...S.artResult.reasons] };
}
function reviewerName() { return ($("pf-reviewer")?.value || "").trim() || null; }
function needName() { const el = $("pf-reviewer"); if (!reviewerName()) { el.focus(); el.classList.add("need"); return true; } el.classList.remove("need"); return false; }

function holdPrint(sku) {
  if (needName()) return;
  const i = impactFor(sku);
  record({ action: "Print held", by: reviewerName(), sku, product: productName(sku), label: i.rec.id, state: i.state, missing: i.findings.filter((f) => f.status === "missing").map((f) => f.allergen), evidence: evidenceOf(i), labelArtworkSha256: i.rec.artwork?.sha256 ?? null });
  render();
}
function reapproveLabel(sku) {
  if (needName()) return;
  const i = impactFor(sku);
  reapprove(i.rec, CHANGE.itemId, CHANGE.to, reviewerName(), i.state);
  record({ action: "QA re-approval: existing label still correct for revision 2", by: reviewerName(), sku, product: productName(sku), label: i.rec.id, state: i.state, evidence: evidenceOf(i), labelArtworkSha256: i.rec.artwork?.sha256 ?? null });
  render();
}
async function signOffArtwork() {
  if (needName()) return;
  if (TEST) return; // never written to the library in test mode
  const prev = currentRecord(S.artSku), x = S.docs.label.draft, d = S.docs.label;
  const base = prev.id.split("@")[0];
  const rec = addVerifiedRecord({
    id: `${base}@${prev.revision + 1}`, sku: S.artSku, product: productName(S.artSku), revision: prev.revision + 1, status: "approved",
    ingredient_list_printed: x.ingredient_list_printed, contains_printed: x.contains_printed, precautionary_printed: x.precautionary_printed,
    verified: { by: reviewerName(), at: new Date().toISOString(), method: d.draft.manual ? "Artwork gate (reading typed by reviewer)" : "Artwork gate (read on device by Gemini Nano, confirmed by reviewer)" },
    approvalBasedOn: { ...prev.approvalBasedOn, [CHANGE.itemId]: CHANGE.to }, artwork: { file: d.name, sha256: d.sha },
  });
  record({ action: "QA sign-off: artwork approved for print", by: reviewerName(), sku: S.artSku, product: productName(S.artSku), label: rec.id, state: S.artResult.state, sha256: d.sha, labelArtworkSha256: d.sha, approvalBasedOn: rec.approvalBasedOn, previousRecord: prev.id, evidence: evidenceOf(S.artResult) });
  render();
}

// ---------- rendering helpers ----------
function renderStatus(kind) {
  const d = S.docs[kind], el = $(`pf-${kind}-status`);
  if (!el) return;
  const what = kind === "spec" ? "supplier spec" : "label artwork";
  if (d.status === "reading") el.innerHTML = `<span class="spin"></span> <b>Gemini Nano is reading this ${what} on this device</b> · ${Math.round((performance.now() - d.t0) / 1000)} s${d.download ? " · downloading the model (one time)" : ""}<div class="muted small">Typically 30–90 s on a laptop without a dedicated GPU; text appears below as it is read. Nothing is uploaded.</div>`;
  else if (d.status === "queued") el.innerHTML = `<span class="muted">Waiting — the on-device model reads one document at a time.</span>`;
  else if (d.status === "read" && TEST) el.innerHTML = `Reading prepared for this reviewer test — check it against the image.`;
  else if (d.status === "read") el.innerHTML = d.draft.manual ? `Entered by hand (no AI).` : `Read on this device in ${(d.ms / 1000).toFixed(0)} s${d.retried ? " (first answer was empty — retried once automatically)" : ""} · Firebase AI Logic reported <code>${esc(d.privacy?.sources?.final ?? "on_device")}</code>${privacyHTML(d)}`;
  else if (d.status === "error") el.innerHTML = `<span class="bad">Could not read: ${esc(d.error)}</span>`;
  else el.textContent = d.blob ? (canRead() ? "Ready to read." : "On-device AI is not available here — type the reading instead.") : "No document yet.";
}
function privacyHTML(d) {
  const p = d.privacy; if (!p) return "";
  const other = p.requests.filter((x) => x.class !== "App Check (reCAPTCHA)");
  const summary = !p.requests.length ? "no outside requests during this read" : other.length ? `<span class="bad">${other.length} outside request(s) that are not App Check</span>` : `${p.requests.length} outside request(s), all App Check (reCAPTCHA)`;
  return ` · ${summary} <details class="priv"><summary>Privacy evidence</summary>
    <div>inferenceSource on every streamed chunk: <code>${esc((p.sources?.chunks ?? []).join(", ") || "—")}</code> · on the final response: <code>${esc(p.sources?.final ?? "—")}</code>. A cloud answer would be refused by the privacy guard.</div>
    <div>Requests to other servers while reading (measured in this page): ${p.requests.length ? p.requests.map((x) => `${esc(x.host)} <span class="muted">(${esc(x.class)})</span>`).join(", ") : "none"}. The page cannot see request contents — this shows which servers were contacted.</div></details>`;
}
function liveItems(kind, t) {
  if (kind === "spec") return [...t.matchAll(/"printed"\s*:\s*"((?:[^"\\]|\\.)*)"?/g)].map((m) => m[1]);
  const m = t.match(/"ingredient_list_printed"\s*:\s*"((?:[^"\\]|\\.)*)/);
  return m ? [m[1]] : [];
}
function renderLive(kind) {
  const el = $(`pf-${kind}-live`); if (!el) return;
  const items = S.docs[kind].status === "reading" ? liveItems(kind, S.docs[kind].partial || "") : [];
  el.innerHTML = items.length ? `<div class="live"><span class="muted small">Live reading — not checked yet, no decision is made from it:</span><div>${items.map((x) => `<span class="livechip">${esc(x.replace(/\\n/g, " "))}</span>`).join(" ")}</div></div>` : "";
}
/**
 * Differences between the AI's artwork reading and the approved label, as neutral questions ("Which does the artwork
 * say?"). Replaced tick boxes on 27 Nov: with ticks, 2 human testers caught 0 of 6 planted errors (bench/reviewer-test/).
 * Questions are built from the AI's original reading, so answering one never makes another disappear.
 */
function labelQuestions() {
  const d = S.docs.label, rec = currentRecord(S.artSku);
  if (!d.draft || !rec) return { qs: [], same: false, rec };
  if (d.sha && rec.artwork?.sha256 === d.sha) return { qs: [], same: true, rec };
  return { qs: verificationQuestions(rec, d.aiDraft ?? d.draft), same: false, rec };
}
function changesCheckHTML() {
  const d = S.docs.label, { qs, same, rec } = labelQuestions();
  if (!rec || !d.draft) return "";
  if (same) return `<div class="chk-box ok small">Same artwork file as the approved label ${esc(rec.id)} (identical fingerprint).</div>`;
  if (!qs.length) return `<div class="chk-box small">No wording differences from the approved label ${esc(rec.id)}.</div>`;
  return `<div class="chk-box vq"><div><b>Check ${qs.length === 1 ? "this difference" : `these ${qs.length} differences`} on the artwork image</b> — the AI reading and the approved label ${esc(rec.id)} disagree. Look at the image and pick what is actually printed. The options show only the part that differs; neither is pre-selected or highlighted.</div>
    ${qs.map((q, n) => `<div class="vqq"><div class="qp">${n + 1}. ${esc(q.prompt.replace("of the picture", "of the artwork image").replace("on the picture", "on the artwork image").replace("the picture", "the artwork image"))}</div>
      ${[...orderOptions(q, d.qSeed), { ...UNSURE, text: "I can't tell from the artwork image (→ needs review)" }].map((o) => `<label class="opt ${o.key === "unsure" ? "unsure" : ""} ${d.answers[q.id] === o.key ? "sel" : ""}"><input type="radio" name="vq-${n}" data-vq="${esc(q.id)}" value="${o.key}" ${d.answers[q.id] === o.key ? "checked" : ""}><span>${esc(o.text.replace("the picture", "the artwork"))}</span></label>`).join("")}</div>`).join("")}</div>`;
}
function issuesHTML(kind) {
  const d = S.docs[kind], iss = d.draft.issues;
  if (!iss.length) return `<p class="ok small">No reading problems found by the checks.</p>`;
  return `<ul class="issues">${iss.map((i, n) => `<li class="${i.kind}"><label><input type="checkbox" data-ack="${kind}:${n}" ${d.acks.has(n) ? "checked" : ""}> I checked this against the image</label><div>${esc(i.msg)}</div></li>`).join("")}</ul>`;
}
function specEditor() {
  const x = S.docs.spec.draft;
  const src = specSources({ ingredients: x.ingredients, allergen_statement_printed: x.allergen_statement_english || x.allergen_statement_printed, allergen_statement_original: x.allergen_statement_printed });
  return `<table class="ing"><thead><tr><th>As printed</th><th>English</th><th>Allergen source (rules)</th><th></th></tr></thead><tbody>
  ${x.ingredients.map((it, i) => { const a = src.rows[i]?.allergens ?? []; const amb = src.ambiguous.includes(src.rows[i]);
    return `<tr><td><textarea rows="1" data-sp="printed:${i}">${esc(it.printed)}</textarea></td><td><textarea rows="1" data-sp="english:${i}">${esc(it.english)}</textarea></td>
    <td>${a.length ? a.map((k) => `<span class="chip a">${ALLERGEN_NAME[k]}</span>`).join(" ") : amb ? `<span class="chip amb">source not stated</span>` : `<span class="muted">—</span>`}</td>
    <td><button class="x" data-sp-del="${i}" title="Remove">×</button></td></tr>`; }).join("")}
  </tbody></table><button class="link" id="pf-sp-add">+ Add ingredient</button>
  <div class="row2"><label>Allergen statement (as printed)<input data-sp="stmt" value="${esc(x.allergen_statement_printed ?? "")}"></label>
  <label>Allergen statement (English)<input data-sp="stmtEn" value="${esc(x.allergen_statement_english ?? "")}"></label></div>`;
}
function labelEditor() {
  const x = S.docs.label.draft;
  return `<label>Ingredient list<textarea data-lb="ing" rows="5">${esc(x.ingredient_list_printed)}</textarea></label>
  <label>"Contains" statement <span class="muted">(leave empty if the label has none)</span><input data-lb="contains" value="${esc(x.contains_printed ?? "")}"></label>
  <label>"May contain" / facility statement <span class="muted">(advisory — never counts as a declaration)</span><input data-lb="may" value="${esc(x.precautionary_printed ?? "")}"></label>`;
}
function docPanel(kind) {
  const d = S.docs[kind];
  const title = kind === "spec" ? "New supplier specification" : `New label artwork — ${esc(productName(S.artSku))}`;
  const sub = kind === "spec" ? `From ${esc(CHANGE.supplier)} · photo or scan · English, Spanish or Japanese` : `The artwork about to be printed · ${esc(DEMO_ARTWORK[S.artSku].note)} in the demo`;
  const vqs = kind === "label" ? labelQuestions().qs : [];
  const canConfirm = d.draft && blocking(d.draft.issues).every((_, i) => d.acks.has(i)) && vqs.every((q) => d.answers[q.id]);
  return `<div class="doc ${d.confirmed ? "confirmed" : ""}">
    <div class="doc-h"><div><h3>${title}</h3><div class="muted small">${sub}</div></div>
      ${d.confirmed ? `<span class="pill ok">Reading confirmed</span>` : d.draft ? `<span class="pill warn">Check the reading against the image</span>` : ""}</div>
    <div class="doc-b">
      <div class="img">${d.url ? `<img src="${d.url}" alt="${title}">` : `<div class="drop" data-drop="${kind}">Drop a JPEG/PNG here</div>`}
        <div class="img-actions"><label class="btn">Upload image<input type="file" accept="image/png,image/jpeg" data-file="${kind}" hidden></label>
        <button data-demo="${kind}">Use demo document <span class="tag">synthetic</span></button></div>
        ${d.sha ? `<div class="muted small fp">Fingerprint ${d.sha.slice(0, 12)}…</div>` : ""}</div>
      <div class="reading">
        <div class="status" id="pf-${kind}-status"></div>
        <div id="pf-${kind}-live"></div>
        ${d.blob && !["reading", "queued"].includes(d.status) && canRead() ? `<button class="${d.draft ? "" : "primary"}" data-read="${kind}">${d.draft && !d.draft.manual ? "Retry reading" : "Read on this device"}</button>` : ""}
        ${!d.draft && d.status !== "reading" ? `<button class="link" data-manual="${kind}">Type it myself (no AI)</button>` : ""}
        ${d.draft ? `<div class="editor">${kind === "spec" ? specEditor() : labelEditor()}</div>${issuesHTML(kind)}${kind === "label" ? changesCheckHTML() : ""}
          <button class="confirm" data-confirm="${kind}" ${canConfirm && !d.confirmed ? "" : "disabled"}>${d.confirmed ? "Confirmed" : "Confirm this reading"}</button>
          ${!canConfirm && !d.confirmed ? `<span class="muted small">${kind === "label" && vqs.some((q) => !d.answers[q.id]) ? "Answer each question by looking at the artwork image first." : "Tick each problem after checking it against the image, or correct the text."}</span>` : ""}` : ""}
      </div></div></div>`;
}

function changesPanel() {
  if (!S.docs.spec.confirmed) return "";
  const prevText = specs[CHANGE.from].text;
  const c = specChanges(prevText, S.docs.spec.draft);
  const row = (x) => x.kind === "reworded" ? `<li class="muted"><span class="pill">wording only</span> “${esc(x.before)}” → “${esc(x.after)}”${x.afterEnglish !== x.after ? ` (${esc(x.afterEnglish)})` : ""}</li>`
    : x.kind === "changed" ? `<li><span class="pill warn">changed</span> “${esc(x.before)}” → “${esc(x.after)}”${x.afterEnglish !== x.after ? ` <span class="muted">(${esc(x.afterEnglish)})</span>` : ""}</li>`
    : x.kind === "added" ? `<li><span class="pill warn">added</span> “${esc(x.after)}”${x.afterEnglish !== x.after ? ` <span class="muted">(${esc(x.afterEnglish)})</span>` : ""}</li>` : `<li><span class="pill">removed</span> “${esc(x.before)}”</li>`;
  return `<div class="changes">
    <div class="ch-col"><h4>What changed in the document <span class="muted small">(compared with approved revision 1, wording)</span></h4>
      ${c.changes.length ? `<ul>${c.changes.map(row).join("")}</ul>` : `<p>No ingredient wording changed.</p>`}<p class="muted small">${c.unchangedCount} ingredient(s) unchanged.</p></div>
    <div class="ch-col"><h4>What changed for allergens <span class="muted small">(fixed rules)</span></h4>
      ${c.allergensAdded.length ? `<p class="bad"><b>New allergen source: ${esc(names(c.allergensAdded))}</b></p>` : `<p class="ok">No new allergen source.</p>`}
      ${c.allergensRemoved.length ? `<p>No longer present: ${esc(names(c.allergensRemoved))}</p>` : ""}
      <p class="muted small">Revision 1: ${esc(names(c.allergensBefore)) || "none of the 9 major allergens"} · Revision 2: ${esc(names(c.allergensAfter)) || "none"}</p></div></div>`;
}

/**
 * Supplier Change Impact Card (27 Nov): one view of the change and its consequences. Pure presentation — every value
 * comes from existing results (specChanges, specSources, impactFor); no model call, no new rule.
 */
export function impactCardData() {
  const sp = S.docs.spec;
  if (!sp.confirmed) return null;
  const c = specChanges(specs[CHANGE.from].text, sp.draft);
  const src = specSources(confirmedSpec());
  // the ingredient lines that carry each NEW allergen source, with their position on the spec and the approved wording before
  const sources = c.allergensAdded.flatMap((a) => src.rows.map((r, i) => ({ r, i })).filter(({ r }) => r.allergens.includes(a)).map(({ r, i }) => {
    const ch = c.changes.find((x) => x.after === r.printed);
    return { allergen: a, line: i + 1, printed: r.printed, english: r.english, before: ch?.before ?? null, kind: ch?.kind ?? "unchanged" };
  }));
  const stmtNew = c.allergensAdded.filter((a) => !sources.some((x) => x.allergen === a));
  const confirmedBy = [...history].reverse().find((h) => h.action === "confirmed supplier spec reading")?.by ?? null;
  const rows = AFFECTED.map((sku) => ({ sku, name: productName(sku), ...impactFor(sku), approved: approvalFor(currentRecord(sku), CHANGE.itemId).revision === CHANGE.to }));
  return { c, sources, stmtNew, confirmedBy, rows };
}
function impactCardHTML() {
  const k = impactCardData(); if (!k) return "";
  const chip = (st) => `<span class="chip ${st === STATE.BLOCK ? "c-block" : st === STATE.REVIEW ? "c-rev" : "c-ok"}">${esc(stateLabel(st))}</span>`;
  const reason = (x) => x.approved ? "Approved for revision 2" : x.state === STATE.BLOCK ? `${names(x.findings.filter((f) => f.status === "missing").map((f) => f.allergen))} not declared on the approved label`
    : x.state === STATE.REVIEW ? (x.reasons?.[0] ?? "Needs a closer look") : "Current label already declares every allergen source. CHECKS CLEAR means the rules found no missing allergen; QA still signs off, and it is not regulatory approval.";
  const blocked = k.rows.filter((x) => x.state === STATE.BLOCK && !x.approved), review = k.rows.filter((x) => x.state === STATE.REVIEW), pending = k.rows.filter((x) => x.state === STATE.CLEAR && !x.approved);
  const next = blocked.length ? `Hold print for ${blocked.map((x) => x.name).join(" and ")}. Get corrected artwork, check it in Gate 2, and have QA sign off the exact artwork revision.`
    : review.length ? `Review ${review.map((x) => x.name).join(", ")} before printing.`
    : pending.length ? `Re-approve ${pending.map((x) => x.name).join(", ")} for revision 2 (label unchanged, declaration already covers the change).`
    : "Every affected label is approved for revision 2.";
  const ev = k.rows.map((x) => `<tr><td><b>${esc(x.name)}</b><div class="muted small">${esc(x.rec?.id ?? "")}</div></td><td>${chip(x.state)}</td><td>${(x.findings ?? []).map((f) => `${ALLERGEN_NAME[f.allergen]}: ${f.fromOtherItems ? "from another ingredient" : f.specEvidence.map((e) => `“${esc(e)}”`).join(", ")} → ${f.status === "missing" ? `<span class="bad">not on the label</span>` : `label “${esc(f.labelEvidence)}”`}`).join("<br>") || "—"}</td></tr>`).join("");
  const newAllergens = [...new Set([...k.sources.map((x) => x.allergen), ...k.stmtNew])];
  const nClear = k.rows.filter((x) => x.state === STATE.CLEAR || x.approved).length;
  const headline = `<div class="ic-headline">${newAllergens.length ? `Supplier added <b>${esc(names(newAllergens))}</b>` : "No new allergen from the supplier"} → `
    + [blocked.length ? `<span class="hl-block">${blocked.length} label${blocked.length > 1 ? "s" : ""} PRINT BLOCKED</span>` : "",
       review.length ? `<span class="hl-rev">${review.length} NEEDS REVIEW</span>` : "",
       nClear ? `<span class="hl-ok">${nClear} clear</span>` : ""].filter(Boolean).join(" · ") + `</div>`;
  return `<div class="icard">${headline}
    <div class="ic-sec"><div class="ic-h">Supplier change <span class="muted small">${esc(CHANGE.supplier)} · ${esc(CHANGE.itemId)} revision 1 → 2</span>
      <span class="pill ok">Reading confirmed${k.confirmedBy ? ` by ${esc(k.confirmedBy)}` : ""}</span></div>
      ${k.sources.length || k.stmtNew.length ? k.sources.map((x) => `<div class="ic-change"><div><span class="muted small">Approved revision 1</span><div class="ic-before">${x.before ? `“${esc(x.before)}”` : "<i>not in the approved spec</i>"}</div></div>
        <div class="ic-arrow">→</div><div><span class="muted small">New revision 2 · ingredient ${x.line} on the spec photo</span><div class="ic-after">“${esc(x.printed)}”</div>${x.english !== x.printed ? `<div class="muted small">English: “${esc(x.english)}”</div>` : ""}</div>
        <div class="ic-allergen">New allergen source<b>${esc(ALLERGEN_NAME[x.allergen])}</b></div></div>`).join("")
        + (k.stmtNew.length ? `<p class="small">New in the allergen statement only: <b>${esc(names(k.stmtNew))}</b></p>` : "")
        : `<p class="ok">No new allergen source in this revision.</p>`}</div>
    <div class="ic-sec"><div class="ic-h">Downstream impact <span class="muted small">every product that uses ${esc(CHANGE.itemId)} · checked by fixed rules, no AI</span></div>
      ${k.rows.map((x) => `<div class="ic-row"><div><b>${esc(x.name)}</b> <span class="muted small">${esc(x.sku)} · ${esc(x.rec?.id ?? "")}</span></div>${x.approved ? `<span class="chip c-ok">APPROVED FOR REV 2</span>` : chip(x.state)}<div class="small">${esc(reason(x))}</div></div>`).join("")}</div>
    <div class="ic-sec ic-next"><div class="ic-h">Next action</div><p>${esc(next)}</p><p class="muted small">Who decides what: Gemini Nano only <b>reads</b> the documents (on this device); a person confirms each reading; fixed rules make every block/clear decision; a named QA reviewer signs off each exact artwork revision. A clear check is not regulatory approval.</p></div>
    <details class="ic-ev"><summary>Evidence — why each product got its result</summary><table class="ev"><thead><tr><th>Product</th><th>Result</th><th>Supplier evidence → label evidence</th></tr></thead><tbody>${ev}</tbody></table></details>
  </div>`;
}
function evidenceHTML(r, labelObj) {
  if (!r?.findings?.length) return `<p class="muted small">No allergen sources required for this product.</p>`;
  const rows = r.findings.map((f) => `<tr class="${f.status}"><td><b>${ALLERGEN_NAME[f.allergen]}</b></td>
    <td>${f.fromOtherItems ? `<span class="muted">from another ingredient of this product (unchanged spec)</span>` : f.specEvidence.map((e) => `“${esc(e)}”`).join("<br>")}</td>
    <td>${f.status === "missing" ? `<span class="bad">not declared</span>` : `“${esc(f.labelEvidence)}”`}</td><td>${f.status === "missing" ? "✗ " : "✓ "}${esc(f.why)}</td></tr>`).join("");
  let scope = "";
  if (r.findings.some((f) => f.status === "missing")) {
    const terms = Object.values(DISCLOSURE_TERMS).map((re) => re.source).join("|");
    const hi = (t) => esc(t ?? "").replace(new RegExp(`(${terms})`, "gi"), "<mark>$1</mark>");
    const missing = r.findings.filter((f) => f.status === "missing").map((f) => f.allergen);
    const ignored = labelObj.precautionary_printed && missing.some((a) => DISCLOSURE_TERMS[a].test(labelObj.precautionary_printed));
    scope = `<div class="scope"><div class="scope-h">Verified label text — everything the rules searched for <b>${esc(names(missing))}</b> <span class="muted small">(recognised allergen words highlighted)</span></div>
      <div><span class="muted small">Ingredient list</span><p>${hi(labelObj.ingredient_list_printed)}</p></div>
      <div><span class="muted small">"Contains" statement</span><p>${labelObj.contains_printed ? hi(labelObj.contains_printed) : "<i>none printed</i>"}</p></div>
      <div><span class="muted small">"May contain" statement</span><p>${labelObj.precautionary_printed ? esc(labelObj.precautionary_printed) : "<i>none printed</i>"}${ignored ? ` <span class="pill warn">ignored: advisory, not a declaration</span>` : ""}</p></div></div>`;
  }
  return `<table class="ev"><thead><tr><th>Allergen source</th><th>Supplier evidence (confirmed)</th><th>Label evidence</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>${scope}`;
}
const pill = (state) => state === STATE.BLOCK ? `<span class="pill block">PRINT BLOCKED</span>` : state === STATE.REVIEW ? `<span class="pill warn">NEEDS REVIEW</span>` : state === STATE.CLEAR ? `<span class="pill ok">CHECKS CLEAR</span>` : `<span class="pill">waiting for the confirmed supplier reading</span>`;

function impactPanel() {
  const spec = S.docs.spec;
  const head = !spec.confirmed ? `<p class="muted">Every label approval below was based on supplier revision 1. They are checked instantly — without AI — against their verified label records as soon as the new supplier reading is confirmed.</p>` : "";
  const counts = { b: 0, c: 0, r: 0 };
  const t0 = performance.now();
  const results = Object.fromEntries(AFFECTED.map((sku) => [sku, impactFor(sku)]));
  const ms = performance.now() - t0;
  const rows = AFFECTED.map((sku) => {
    const i = results[sku], rec = i.rec;
    if (i.state === STATE.BLOCK) counts.b++; else if (i.state === STATE.CLEAR) counts.c++; else if (i.state) counts.r++;
    const appr = approvalFor(rec, CHANGE.itemId), signed = appr.revision === CHANGE.to;
    const held = history.filter((h) => h.sku === sku && h.label === rec?.id && h.action === "Print held").at(-1);
    const reason = i.state === STATE.BLOCK ? i.findings.filter((f) => f.status === "missing").map((f) => `${ALLERGEN_NAME[f.allergen]} not declared`).join("; ")
      : i.state === STATE.CLEAR ? (appr.reapproval ? "Label unchanged — re-approved for revision 2" : signed ? "New artwork verified and signed off for revision 2" : "Existing verified declaration covers every allergen source — awaiting QA re-approval") : (i.reasons || []).join(" ");
    const open = S.open.has(sku);
    return `<tr class="imp ${i.state === STATE.BLOCK ? "missing" : ""}"><td><b>${esc(productName(sku))}</b><div class="muted small">${esc(sku)}</div></td>
      <td>${esc(rec?.id ?? "—")}<div class="muted small">verified by ${esc(rec?.verified?.by ?? "—")}, ${rec?.verified?.at ? new Date(rec.verified.at).toLocaleDateString() : "—"}</div></td>
      <td>${signed ? `<span class="ok small">Approved for revision 2${appr.reapproval ? ` · re-approved by ${esc(appr.reapproval.by)}` : ""}</span>` : `<span class="bad small">Approval was based on revision 1 — must be re-checked</span>`}</td>
      <td>${pill(i.state)}${reason ? `<div class="small">${esc(reason)}</div>` : ""}${held ? `<div class="muted small">Print held by ${esc(held.by)}</div>` : ""}</td>
      <td class="acts">${i.state ? `<button class="link" data-toggle="${sku}">${open ? "Hide evidence" : "Evidence"}</button>` : ""}
        ${i.state === STATE.BLOCK && !held ? `<button class="danger sm" data-hold="${sku}">Hold print</button>` : ""}
        ${i.state === STATE.CLEAR && !signed ? `<button class="primary sm" data-reapprove="${sku}">Re-approve label</button>` : ""}
        ${i.state && i.state !== STATE.CLEAR && !signed ? `<button class="sm" data-art="${sku}">Check new artwork →</button>` : ""}</td></tr>
      ${open && i.state ? `<tr class="evrow"><td colspan="5">${evidenceHTML(i, rec)}</td></tr>` : ""}`;
  }).join("");
  const summary = spec.confirmed ? `<div class="impact-sum"><span class="pill block">${counts.b} blocked</span> <span class="pill ok">${counts.c} clear</span> ${counts.r ? `<span class="pill warn">${counts.r} need review</span>` : ""} <span class="muted small">— checked in ${ms < 1 ? "under 1" : Math.round(ms)} ms by fixed rules against verified label records (no AI, nothing uploaded)</span></div>` : "";
  return `${head}${summary}<table class="impact"><thead><tr><th>Product</th><th>Verified label record</th><th>Approval</th><th>Result</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function artworkPanel() {
  const rec = currentRecord(S.artSku);
  const r = S.artResult, d = S.docs.label;
  let res = "";
  if (!S.docs.spec.confirmed) res = `<p class="muted">Confirm the supplier reading first: the artwork is checked against the latest supplier revision.</p>`;
  else if (TEST && S.testDone) res = `<div class="testbanner"><b>Run recorded — thank you.</b> The result is not shown during the test. <a href="/?reviewer-test=1">Start the next run</a> (a new case each time).</div>`;
  else if (!r) res = `<p class="muted">Read and confirm the artwork to run the check.</p>`;
  else {
    const cls = r.state === STATE.BLOCK ? "block" : r.state === STATE.REVIEW ? "review" : "clear";
    const label = r.state === STATE.BLOCK ? "PRINT BLOCKED" : r.state === STATE.REVIEW ? "NEEDS REVIEW" : "CHECKS CLEAR — AWAITING QA SIGN-OFF";
    const diff = labelDiff(rec, d.draft, d.sha), added = diff.added, contChanged = diff.containsChanged, same = diff.sameFile;
    const signedRec = currentRecord(S.artSku); const done = signedRec?.artwork?.sha256 === d.sha && signedRec?.approvalBasedOn?.[CHANGE.itemId] === CHANGE.to;
    res = `<div class="result ${cls}"><div class="state">${label}</div>
      <div class="what">${esc(productName(S.artSku))} · new artwork vs supplier revision 2 · ${esc(RULESET.name)}</div>
      <ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="artdiff"><b>Compared with the verified record ${esc(rec.id)}:</b> ${same ? "this is the same artwork file (identical fingerprint)." : `${added.length ? `new or changed ingredient text: ${added.map((x) => `“${esc(x)}”`).join(", ")}` : "ingredient text unchanged"}${contChanged ? `; "Contains" changed from “${esc(rec.contains_printed || "none")}” to “${esc(d.draft.contains_printed || "none")}”` : ""}.`}</div>
      ${evidenceHTML(r, d.draft)}
      <div class="provenance muted small">Supplier reading and artwork reading: ${S.docs.spec.draft.manual ? "typed by reviewer" : "read on this device by Gemini Nano"} / ${d.draft.manual ? "typed by reviewer (no AI)" : "read on this device by Gemini Nano"}, both confirmed by the reviewer. Decision by fixed rules (${esc(RULESET.id)} v${esc(RULESET.version)}).</div>
      <div class="decide">${r.state === STATE.CLEAR && !done ? `<button class="primary" data-signoff="1">QA sign-off: approve this artwork for print</button><span class="muted small">Creates verified record ${esc(rec.id.split("@")[0])}@${rec.revision + 1}.</span>` : ""}
      ${done ? `<span class="ok">Signed off — now the verified record ${esc(signedRec.id)} (by ${esc(signedRec.verified.by)}).</span>` : ""}
      ${r.state === STATE.BLOCK ? `<span class="bad small">This artwork must not be printed. Send it back to the design agency.</span>` : ""}</div></div>`;
  }
  return `<div class="artsel"><label>Product <select id="pf-artsku">${AFFECTED.map((s) => `<option value="${s}" ${s === S.artSku ? "selected" : ""}>${esc(productName(s))} (${s})</option>`).join("")}</select></label>
    <span class="muted small">Current verified record: ${esc(rec?.id ?? "none")}</span></div>${docPanel("label")}<div id="pf-art-result">${res}</div>`;
}

function chainHTML() {
  if (!history.length) return "";
  const c = chainState;
  const st = !c ? `<span class="muted small">checking audit chain…</span>` : c.ok ? `<span class="pill ok">Audit chain intact</span> <span class="muted small">${c.checked} chained entr${c.checked === 1 ? "y" : "ies"}${c.legacy ? ` · ${c.legacy} older unchained` : ""} · head ${c.head.slice(0, 10)}…</span>`
    : `<span class="pill block">Audit chain broken at entry ${c.brokenAt + 1}</span> <span class="small">${esc(c.reason)}</span>`;
  return `<div class="chain">${st} <button class="sm" id="pf-export-json">Export audit pack (JSON)</button> <button class="sm" id="pf-export-csv">CSV</button> <button class="sm" id="pf-tamper">Test tamper detection</button><span id="pf-tamper-out" class="small"></span>
    <div class="muted small">Each decision stores the SHA-256 of its content and of the previous entry: any later edit, deletion or reordering is detected. Tamper-evident, not digitally signed.</div></div>`;
}
/** Edits one field in an in-memory COPY of the log (the real log is untouched) and re-checks the chain. */
async function tamperTest() {
  const out = $("pf-tamper-out"); if (!out || !history.length) return;
  await chainTail;
  const copy = JSON.parse(JSON.stringify(history));
  const i = Math.max(0, copy.findIndex((h) => h.hash));
  copy[i] = { ...copy[i], by: "Someone else" };
  const r = await verifyChain(copy);
  out.innerHTML = r.ok ? ` <span class="pill warn">edit not detected</span>` : ` <span class="pill ok">Detected</span> an edit to entry ${r.brokenAt + 1} in a test copy (reviewer name changed) — ${esc(r.reason)}. Your real log is unchanged.`;
}
function renderHistoryOnly() { const el = $("pf-history"); if (el) el.innerHTML = historyPanel(); }
function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
async function exportAudit(kind) {
  await chainTail; chainState = await verifyChain(history);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (kind === "csv") return download(`labelgate-audit-${stamp}.csv`, toCSV(history), "text/csv");
  const pack = { exportedAt: new Date().toISOString(), app: "LabelGate prototype (synthetic demo data)", ruleset: RULESET, supplierChange: CHANGE, chain: chainState,
    verifiedLabelRecords: AFFECTED.map((sku) => currentRecord(sku)), entries: history,
    note: "Tamper-evident hash chain (SHA-256 of canonical JSON of each entry incl. prevHash). Not a digital signature. Not a regulatory compliance record." };
  download(`labelgate-audit-${stamp}.json`, JSON.stringify(pack, null, 1), "application/json");
}
function historyPanel() {
  if (!history.length) return `<p class="muted">No decisions yet. Stored only in this browser.</p>`;
  return `${chainHTML()}<ol class="hist">${[...history].reverse().slice(0, 14).map((h) => `<li><b>${esc(h.action)}</b>${h.product ? ` · ${esc(h.product)}` : ""}${h.label ? ` (${esc(h.label)})` : ""}${h.by ? ` · ${esc(h.by)}` : ""} · ${new Date(h.at).toLocaleString()}
    ${h.missing?.length ? `<div class="muted small">missing: ${esc(names(h.missing))}</div>` : ""}${h.detail ? `<div class="small"><b>${esc(h.detail)}</b></div>` : ""}${h.readOnDevice === false ? `<div class="muted small">reading typed by reviewer (no AI)</div>` : ""}</li>`).join("")}</ol>`;
}

function summaryBar() {
  const spec = S.docs.spec;
  const rows = spec.confirmed ? AFFECTED.map((sku) => { const i = impactFor(sku); return { sku, state: i.state, approved: approvalFor(i.rec, CHANGE.itemId).revision === CHANGE.to, held: history.some((h) => h.sku === sku && h.label === i.rec?.id && h.action === "Print held") }; }) : [];
  const n = (f) => rows.filter(f).length;
  const blocked = rows.filter((r) => r.state === STATE.BLOCK), review = rows.filter((r) => r.state === STATE.REVIEW), clearPending = rows.filter((r) => r.state === STATE.CLEAR && !r.approved);
  const names = (list) => list.map((r) => productName(r.sku)).join(", ");
  const next = !spec.draft ? "Load the new supplier specification (Gate 1)."
    : !spec.confirmed ? "Check the supplier reading against the photo, then confirm it."
    : blocked.some((r) => !r.held) ? `Hold print for ${names(blocked.filter((r) => !r.held))}, then check corrected artwork (Gate 2).`
    : review.length ? `Review ${names(review)}.`
    : blocked.length ? `Check corrected artwork for ${names(blocked)} (Gate 2).`
    : clearPending.length ? `Re-approve ${names(clearPending)} for revision 2.`
    : `All ${AFFECTED.length} labels are approved for revision 2. Supplier change closed.`;
  return `<div class="sumbar"><div class="tiles">
      <div class="tile"><b>${AFFECTED.length}</b><span>products use this ingredient</span></div>
      <div class="tile ${blocked.length ? "t-block" : ""}"><b>${spec.confirmed ? blocked.length : "–"}</b><span>print blocked</span></div>
      <div class="tile ${review.length ? "t-warn" : ""}"><b>${spec.confirmed ? review.length : "–"}</b><span>need review</span></div>
      <div class="tile t-ok"><b>${spec.confirmed ? n((r) => r.state === STATE.CLEAR) : "–"}</b><span>checks clear</span></div>
      <div class="tile"><b>${spec.confirmed ? `${n((r) => r.approved)}/${AFFECTED.length}` : "–"}</b><span>approved for revision 2</span></div></div>
    <div class="next"><span class="muted small">Next action</span> ${esc(next)}</div></div>`;
}
function render() {
  $("pf-case").innerHTML = `<div><div class="muted small">Supplier change case ${esc(S.caseId)}</div>
    <h2>${esc(CHANGE.supplier)} sent a new specification for <em>${esc(CHANGE.product)}</em></h2>
    <div class="muted"><span class="tag">synthetic demo data</span> Item ${esc(CHANGE.itemId)} · revision 1 → <b>revision 2</b>, received ${esc(CHANGE.received)} · used in ${AFFECTED.length} products · ${esc(RULESET.name)}</div></div>
    <label class="who">QA reviewer<input id="pf-reviewer" placeholder="Your name" value="${esc(S.reviewer ?? "")}"></label>${summaryBar()}`;
  $("pf-spec").innerHTML = docPanel("spec");
  $("pf-changes").innerHTML = impactCardHTML() + (S.docs.spec.confirmed ? `<details class="ch-more"><summary>Full list of wording changes in the supplier document</summary>${changesPanel()}</details>` : "");
  $("pf-impact").innerHTML = impactPanel();
  $("pf-art").innerHTML = artworkPanel();
  $("pf-history").innerHTML = historyPanel();
  renderStatus("spec"); renderStatus("label"); renderLive("spec"); renderLive("label");
  if (S.kbFocus) keyboardFocus();
  if (TEST || S.tour) updateGuide();
}
// Step-by-step guide for the blind reviewer test: one instruction at a time, the button to use is highlighted.
// It says WHAT to do, never what the error is.
// Guided "Start the 2-minute demo" for first-time users and judges (27 Nov): after the first human tester said the page
// did not tell him where to start. One instruction at a time; the button to use pulses; "Show me" scrolls to it.
const TOUR_SKU = "SKU-1001";
function tourStep() {
  const sp = S.docs.spec, lb = S.docs.label, T = 6;
  const reading = (d) => d.status === "reading" || d.status === "queued";
  if (!sp.blob) return [1, '[data-demo="spec"]', "A supplier sent a new specification for an ingredient — a phone photo, in Spanish. Click <b>Use demo document</b>. Gemini Nano reads it <b>on this laptop</b>; nothing is uploaded.", null, T];
  if (reading(sp)) return [1, null, "Gemini Nano is reading the photo on this laptop (about 30–90 s on a laptop without a graphics card). The text appears as it is read.", "#pf-spec", T];
  if (!sp.confirmed) return [2, '[data-confirm="spec"]', "Compare the reading with the photo — note <b>leche</b> (milk) in the natural flavour. Then click <b>Confirm this reading</b>.", "#pf-spec", T];
  const imp = impactFor(TOUR_SKU), held = history.some((h) => h.sku === TOUR_SKU && h.action === "Print held");
  const signed = approvalFor(currentRecord(TOUR_SKU), CHANGE.itemId).revision === CHANGE.to;
  if (imp.state === STATE.BLOCK && !held) return [3, `[data-hold="${TOUR_SKU}"]`, "Every product that uses this ingredient was re-checked in milliseconds: <b>2 labels are now wrong — milk is not declared</b>. Click <b>Hold print</b> for Crispy Garden Crackers.", "#pf-impact-sec", T];
  if (!signed && S.artSku !== TOUR_SKU) return [4, `[data-art="${TOUR_SKU}"]`, "Now fix it: click <b>Check new artwork →</b> for Crispy Garden Crackers.", "#pf-impact-sec", T];
  if (!signed && !lb.blob) return [4, '[data-demo="label"]', "<b>Gate 2:</b> the design agency sent corrected artwork. Click <b>Use demo document</b> — Gemini Nano reads it on this laptop.", "#pf-art-sec", T];
  if (!signed && reading(lb)) return [4, null, "Gemini Nano is reading the new artwork on this laptop (about 30–60 s).", "#pf-art-sec", T];
  if (!signed && !lb.confirmed) return [5, '[data-confirm="label"]', "The AI reading differs from the approved label. Answer each question by <b>looking at the artwork image</b>, then click <b>Confirm this reading</b>.", "#pf-art-sec", T];
  if (!signed) return [6, '[data-signoff="1"]', "The checks pass. As the QA reviewer, click <b>QA sign-off</b> to approve this artwork for print.", "#pf-art-sec", T];
  return [7, null, "Done: the crackers label is approved for the new supplier revision, and every step is in the tamper-evident history below. Next, try the <b>Recall notices</b> tab: hybrid AI (on device, with cloud fallback).", null, T];
}
function guideStep() {
  if (S.tour) return tourStep();
  const sp = S.docs.spec, lb = S.docs.label;
  if (S.testDone) return [6, null, "Done — thank you. Click <b>Start the next run</b> (a new case each time)."];
  if (!(S.reviewer || "").trim()) return [1, "#pf-reviewer", "Type your name in the <b>QA reviewer</b> box (top right). Use the same name every run."];
  if (!sp.blob || sp.status === "reading" || sp.status === "queued") return [2, '[data-demo="spec"]', "<b>Gate 1:</b> click <b>Use demo document</b> to load the supplier specification."];
  if (!sp.confirmed) return [3, '[data-confirm="spec"]', "Compare the AI reading (right) with the photo (left). Correct anything that differs. Then click <b>Confirm this reading</b>.", "#pf-spec"];
  if (!lb.blob || lb.status === "reading" || lb.status === "queued") return [4, '[data-demo="label"]', "<b>Gate 2:</b> scroll down and click <b>Use demo document</b> to load the new label artwork for Seasoned Pretzel Bites."];
  return [5, '[data-confirm="label"]', "Compare the AI reading with the label image, word by word. Correct anything that differs from the image. Tick a yellow item only if you can see it on the image. Then click <b>Confirm this reading</b>.", "#pf-art-sec"];
}
function updateGuide() {
  let g = $("pf-guide");
  if (!g) { g = document.createElement("div"); g.id = "pf-guide"; g.className = "guidebar"; document.body.appendChild(g); g.addEventListener("click", (e) => { if (e.target.id === "pf-guide-show") showTarget(true); if (e.target.id === "pf-guide-close") { S.tour = false; g.remove(); document.querySelectorAll(".guide-pulse").forEach((el) => el.classList.remove("guide-pulse")); } }); }
  const [n, sel, txt, , total = 5] = guideStep();
  g.innerHTML = `<span class="gstep">${n > total ? "Done" : `Step ${n} of ${total}`}</span> <span>${txt}</span>${sel ? ` <button class="sm" id="pf-guide-show">Show me ↓</button>` : ""}${S.tour ? ` <button class="sm" id="pf-guide-close" title="Close the guide">✕</button>` : ""}`;
  document.querySelectorAll(".guide-pulse").forEach((el) => el.classList.remove("guide-pulse"));
  const t = sel && document.querySelector(sel); if (t) t.classList.add("guide-pulse");
  // Scroll to the next target when a step is completed — but not while the reviewer is typing their name.
  if (S.guideShown !== n) { const prev = S.guideShown; S.guideShown = n; if (prev !== undefined && (S.tour || prev !== 1)) showTarget(false); }
}
function showTarget(force) {
  const [, sel, , area] = guideStep();
  const a = area && document.querySelector(area); // for "compare" steps, show the image and the reading, not just the button
  if (a) return a.scrollIntoView({ block: "start", behavior: "smooth" });
  const t = sel && document.querySelector(sel);
  if (t && (force || !t.matches(":focus"))) t.scrollIntoView({ block: "center", behavior: "smooth" });
}
// Keyboard flow for the artwork check: focus goes to the first difference still to be checked, then to "Confirm".
// Space ticks a difference; Enter on a difference ticks it, and confirms once every difference is ticked.
function startTour() {
  S.tour = true; S.guideShown = undefined;
  if (!reviewerName()) { S.reviewer = "Judge (demo)"; }
  document.querySelectorAll("details.guide").forEach((el) => el.removeAttribute("open"));
  render(); showTarget(true);
}
function keyboardFocus() {
  const panel = $("pf-art"); if (!panel || S.docs.label.confirmed) { S.kbFocus = false; return; }
  const unanswered = [...panel.querySelectorAll(".vqq")].find((q) => !q.querySelector("input:checked"));
  const next = unanswered?.querySelector("input") || panel.querySelector('[data-confirm="label"]:not([disabled])');
  if (!next) return;
  next.focus({ preventScroll: true });
  if (!TEST) next.closest("li, .actions, div")?.scrollIntoView({ block: "center", behavior: "smooth" }); // the test guide scrolls to the image instead
}

// ---------- events ----------
function wire() {
  const root = $("view-review");
  root.addEventListener("keydown", (e) => {
    const t = e.target;
    if (e.key !== "Enter" || !t.dataset?.vq) return; // arrow keys pick an answer, Enter confirms once all are answered
    e.preventDefault();
    if (!t.checked) { t.checked = true; t.dispatchEvent(new Event("change", { bubbles: true })); return; }
    const btn = $("pf-art").querySelector('[data-confirm="label"]:not([disabled])'); if (btn) btn.click();
  });
  root.addEventListener("click", async (e) => {
    const t = e.target.closest("button, [data-drop]"); if (!t) return;
    if (t.dataset.demo) await loadDemo(t.dataset.demo);
    else if (t.dataset.read) await read(t.dataset.read);
    else if (t.dataset.manual) manual(t.dataset.manual);
    else if (t.dataset.confirm) confirm(t.dataset.confirm);
    else if (t.dataset.hold) holdPrint(t.dataset.hold);
    else if (t.dataset.reapprove) reapproveLabel(t.dataset.reapprove);
    else if (t.dataset.signoff) await signOffArtwork();
    else if (t.dataset.toggle) { S.open.has(t.dataset.toggle) ? S.open.delete(t.dataset.toggle) : S.open.add(t.dataset.toggle); render(); }
    else if (t.dataset.art) { selectArt(t.dataset.art); $("pf-art-sec").scrollIntoView({ behavior: "smooth" }); }
    else if (t.dataset.spDel != null) { S.docs.spec.draft.ingredients.splice(+t.dataset.spDel, 1); recheck("spec"); render(); }
    else if (t.id === "pf-sp-add") { S.docs.spec.draft.ingredients.push({ printed: "", english: "" }); recheck("spec"); render(); }
    else if (t.id === "pf-export-json") await exportAudit("json");
    else if (t.id === "pf-export-csv") await exportAudit("csv");
    else if (t.id === "pf-tour") startTour();
    else if (t.id === "pf-tamper") tamperTest();
    else if (t.id === "pf-reset") { resetLocalRecords(); history = []; saveHistory(history); location.reload(); }
  });
  root.addEventListener("input", (e) => { if (e.target.id === "pf-reviewer") { S.reviewer = e.target.value; if (TEST) updateGuide(); } });
  root.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.dataset.file && t.files[0]) await setDoc(t.dataset.file, t.files[0], t.files[0].name);
    else if (t.id === "pf-artsku") selectArt(t.value);
    else if (t.dataset.vq) {
      const d = S.docs.label, { qs } = labelQuestions();
      d.answers = { ...d.answers, [t.dataset.vq]: t.value };
      // the reviewer's answers — not the AI — decide the text that is checked
      const fixed = applyAnswers(d.aiDraft ?? d.draft, qs, d.answers);
      Object.assign(d.draft, { ingredient_list_printed: fixed.ingredient_list_printed, contains_printed: fixed.contains_printed });
      const keep = d.answers; recheck("label"); d.answers = keep; S.kbFocus = true; render();
    }
    else if (t.dataset.ack) { const [k, n] = t.dataset.ack.split(":"); const d = S.docs[k]; t.checked ? d.acks.add(+n) : d.acks.delete(+n); d.confirmed = false; if (k === "label") S.artResult = null; render(); }
    else if (t.dataset.sp) {
      const x = S.docs.spec.draft, [field, i] = t.dataset.sp.split(":");
      if (field === "stmt") x.allergen_statement_printed = t.value || null; else if (field === "stmtEn") x.allergen_statement_english = t.value || null; else x.ingredients[+i][field] = t.value;
      recheck("spec"); render();
    } else if (t.dataset.lb) {
      const x = S.docs.label.draft;
      if (t.dataset.lb === "ing") x.ingredient_list_printed = t.value; else if (t.dataset.lb === "contains") x.contains_printed = t.value.trim() || null; else x.precautionary_printed = t.value.trim() || null;
      recheck("label"); render();
    }
  });
  root.addEventListener("dragover", (e) => { if (e.target.closest("[data-drop]")) e.preventDefault(); });
  root.addEventListener("drop", async (e) => { const z = e.target.closest("[data-drop]"); if (!z) return; e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) await setDoc(z.dataset.drop, f, f.name); });
}
function selectArt(sku) {
  if (S.docs.label.status === "reading") return;
  S.artSku = sku; const d = S.docs.label; if (d.url) URL.revokeObjectURL(d.url);
  S.docs.label = newDoc(); S.artResult = null; render();
}

export function initProof() {
  if (TEST) { location.replace("/reviewer-test.html"); return; } // the simple standalone test page replaced the in-app test (27 Nov)
  if (TEST_MODE === "results") { $("view-review").innerHTML = `<section class="case">${resultsHTML(esc)}</section>`; return; }
  wire();
  if (TEST) { document.querySelectorAll("details.guide").forEach((el) => el.remove()); // the judges' guide describes the demo answer
    const b = document.createElement("div"); b.className = "testbanner"; b.innerHTML = "<b>Reviewer test.</b> You are the QA reviewer. Check every reading against its image before you confirm it — readings in this test may contain errors. 1) Type your name as QA reviewer. 2) Gate 1: click <i>Use demo document</i>, check the supplier reading against the photo, confirm. 3) Gate 2: click <i>Use demo document</i> for <b>Seasoned Pretzel Bites</b>, check the reading against the artwork, correct anything wrong, confirm. Nothing you do here changes the label library."; $("pf-case").before(b); }
  render(); checkDevice().then(render);
  verifyChain(history).then((c) => { chainState = c; renderHistoryOnly(); });
}
