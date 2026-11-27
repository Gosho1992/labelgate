import * as S from "./data/sample.js";
import { extractSpec, parseRecall, audit } from "./ai/extract.js";
import { evaluate, affectedLabels, signOff } from "./engine/gate.js";
import { textDiff } from "./engine/diff.js";
import { matchRecall } from "./engine/recall.js";
import { PRIVACY } from "./engine/router.js";
import { STATE } from "./schemas.js";
import { checkAvailability, ensureReady, onNanoChange, nano, getTransport } from "./ai/nano.js";
import { appCheckStatus, firebaseConfigured } from "./ai/firebase.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const env = { online: navigator.onLine };
let labels = structuredClone(S.labels);
let lastFindings = [];
let lastProfiles = null;
const determinations = {}; // `${specId}|${term}` -> allergen key | "none"; set ONLY by the reviewer, never from the model guess
const ALLERGEN_LABEL = { milk: "Milk", egg: "Egg", fish: "Fish", shellfish: "Crustacean shellfish", treenut: "Tree nuts", peanut: "Peanut", wheat: "Wheat", soy: "Soy", sesame: "Sesame" };

function renderNanoBadge(n = nano) {
  const b = $("badge-nano");
  const label = {
    ready: "On-device model: ready", available: "On-device model: available (warming up in the background)", initializing: "On-device model: initializing…",
    downloadable: "On-device model: not downloaded — click to download", downloading: `On-device model: downloading ${Math.round((n.progress || 0) * 100)}%`,
    unavailable: "On-device model: unavailable on this device", unsupported: "On-device model: not supported in this browser",
    error: `On-device model error: ${n.error}`, unknown: "On-device model: checking…",
  }[n.state] || `On-device model: ${n.state}`;
  b.textContent = label;
  b.className = `badge ${n.state === "ready" ? "ok" : "warn"}${n.state === "downloadable" ? " clickable" : ""}`;
}
onNanoChange(renderNanoBadge);
$("badge-nano").addEventListener("click", () => { if (nano.state === "downloadable") ensureReady(); }); // user gesture starts the download

function netBadge() {
  env.online = navigator.onLine;
  $("badge-net").textContent = env.online ? "Network: online" : "Network: OFFLINE";
  $("badge-net").className = `badge ${env.online ? "" : "ok"}`;
}
window.addEventListener("online", netBadge); window.addEventListener("offline", netBadge);

const items = [...new Set(Object.values(S.specs).map((s) => s.itemId))];
function previousSpec(itemId) {
  const revs = Object.values(S.specs).filter((s) => s.itemId === itemId).sort((a, b) => a.revision - b.revision);
  return revs.length > 1 ? revs[revs.length - 2] : null;
}
function renderDiff() {
  const itemId = $("item-select").value;
  const cur = S.specs[S.currentSpecByItem[itemId]];
  const prev = previousSpec(itemId);
  const head = `<p><b>${esc(cur.supplier)}</b> · ${esc(itemId)} · revision ${cur.revision} (${esc(cur.effectiveDate)})${prev ? ` · was revision ${prev.revision}` : ""}</p>`;
  if (!prev) { $("diff").innerHTML = head + `<pre>${esc(cur.text)}</pre>`; return; }
  const d = textDiff(prev.text, cur.text);
  $("diff").innerHTML = head + `<div class="diff">${d.removed.map((l) => `<div class="del">${esc(l)}</div>`).join("")}${d.added.map((l) => `<div class="add">NEW: ${esc(l)}</div>`).join("")}</div>`;
}

function renderLog() {
  $("log").innerHTML = audit.slice().reverse().map((e) => {
    const src = e.inferenceSource || e.route;
    return `<li><span class="src-${esc(src)}">${esc(src || e.type)}</span> · ${esc(e.type)} ${esc(e.specId || e.noticeId || "")} · ${e.cached ? "cached (same text + versions)" : (e.ms ?? "–") + " ms"}${e.nanoStatus && e.nanoStatus !== "ok" ? " · model: " + esc(e.nanoStatus) : ""} · cloud bytes: ${e.cloudBytes ?? 0}<br><small>${esc(e.reason || e.message || "")}</small></li>`;
  }).join("");
}

function highlight(text, quote) {
  if (!quote) return esc(text);
  const i = text.toLowerCase().indexOf(quote.toLowerCase());
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + `<span class="evidence">${esc(text.slice(i, i + quote.length))}</span>` + esc(text.slice(i + quote.length));
}

function renderFindings(findings, focusItem) {
  lastFindings = findings;
  const affected = focusItem ? new Set(affectedLabels(focusItem, S.formulas, labels).map((l) => l.id)) : null;
  const shown = affected ? findings.filter((f) => affected.has(f.labelId)) : findings;
  const n = (st) => shown.filter((f) => f.state === st).length;
  $("summary").innerHTML = `${shown.length} label${shown.length === 1 ? "" : "s"} depend on this change → <span class="state PRINT_BLOCKED">${n(STATE.BLOCKED)} PRINT BLOCKED</span> <span class="state NEEDS_REVIEW">${n(STATE.REVIEW)} NEEDS REVIEW</span> <span class="state CHECKS_CLEAR_AWAITING_SIGNOFF">${n(STATE.CLEAR)} clear</span>`;
  $("findings").innerHTML = shown.map((f) => {
    const label = labels.find((l) => l.id === f.labelId);
    const formula = S.formulas.find((x) => x.sku === f.sku);
    const paths = f.paths.map((p) => {
      const spec = S.specs[p.specId];
      return `<li><b>${esc(p.allergen)}</b> ← ${esc(p.itemId)} (${esc(p.specId)}, found by ${esc(p.source)}): “${highlight(spec.text, p.evidence).slice(0, 400)}”</li>`;
    }).join("");
    const canSign = f.state === STATE.CLEAR;
    return `<div class="card">
      <span class="state ${f.state}">${f.state.replaceAll("_", " ")}</span>
      <h3>${esc(formula?.name)} · ${esc(f.labelId)}</h3>
      <div><b>Label:</b> ${esc(label.ingredientStatement)} ${label.containsStatement ? `<b>${esc(label.containsStatement)}</b>` : "<i>(no Contains statement)</i>"}</div>
      ${f.reasons.length ? `<b>Why</b><ul>${f.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      ${paths ? `<b>Evidence path</b><ul>${paths}</ul>` : ""}
      ${f.needsId.length ? `<b>Needs allergen identification</b><ul class="needsid">${f.needsId.map((n) => {
        const spec = S.specs[n.specId];
        return `<li><div><b>Ingredient:</b> ${esc(n.term)} <span class="muted">(${esc(n.itemId)}, ${esc(n.assertion)})</span></div>
          <div><b>Allergen:</b> <span class="unknown">UNKNOWN — verify</span></div>
          <div><b>Evidence:</b> “${highlight(spec.text, n.evidence).slice(0, 400)}”</div>
          <div class="guess" aria-disabled="true">Model guess (unreliable): ${esc(n.modelGuess)} — not used for any decision</div>
          <label>Your determination: <select data-det="${esc(n.specId + "|" + n.term)}"><option value="">— choose —</option>${Object.entries(ALLERGEN_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}<option value="none">Not a major allergen</option></select></label></li>`;
      }).join("")}</ul>` : ""}
      ${f.unknowns.filter((u) => !/: Possible allergen in "/.test(u)).length ? `<b>Still unknown</b><ul>${f.unknowns.filter((u) => !/: Possible allergen in "/.test(u)).map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}
      ${label.approval ? `<div class="${f.approvalInvalidated ? "struck" : ""}">Signed by ${esc(label.approval.by)} on ${esc(label.approval.at.slice(0, 10))}</div>` : ""}
      ${canSign ? `<button data-sign="${esc(f.labelId)}">Sign off this proof</button>` : ""}
    </div>`;
  }).join("");
  document.querySelectorAll("[data-det]").forEach((sel) => {
    sel.value = determinations[sel.dataset.det] ?? "";
    sel.addEventListener("change", () => {
      if (!sel.value) delete determinations[sel.dataset.det]; else determinations[sel.dataset.det] = sel.value;
      audit.push({ at: new Date().toISOString(), type: "reviewer_determination", specId: sel.dataset.det.split("|")[0], reason: `${sel.dataset.det.split("|")[1]} -> ${sel.value || "cleared"} (reviewer's own choice)` });
      renderFindings(evaluate({ formulas: S.formulas, labels, currentSpecByItem: S.currentSpecByItem, profiles: lastProfiles, determinations }), $("item-select").value);
      renderLog();
    });
  });
  document.querySelectorAll("[data-sign]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.sign;
    const i = labels.findIndex((l) => l.id === id);
    const f = lastFindings.find((x) => x.labelId === id);
    labels[i] = signOff(labels[i], f, S.formulas.find((x) => x.sku === labels[i].sku), S.currentSpecByItem, "QA reviewer");
    audit.push({ at: new Date().toISOString(), type: "sign_off", specId: id, reason: "human sign-off bound to current spec revisions" });
    runCheck(true);
  }));
}

async function runCheck(skipExtract = false) {
  const btn = $("btn-check"); btn.disabled = true;
  const privacy = PRIVACY.PRIVATE; // supplier specs are always private: on-device or rules-only, never cloud
  const status = (cls, html) => { $("ai-status").className = `ai-status ${cls}`; $("ai-status").innerHTML = html; };
  const profiles = {};
  const current = Object.values(S.specs).filter((s) => S.currentSpecByItem[s.itemId] === s.id);
  let i = 0;
  if (["available", "downloadable", "downloading"].includes(nano.state)) {
    status("run", nano.state === "available" ? "On-device model: initializing…" : "On-device model: downloading (first time only)…");
    await ensureReady(); // this click is the user gesture Chrome needs for a download
  }
  const results = [];
  for (const spec of current) {
    i++;
    const t0 = performance.now();
    const tick = setInterval(() => status("run", `On-device analysis running · spec ${i} of ${current.length} (${esc(spec.itemId)}) · ${Math.round((performance.now() - t0) / 1000)} s · ${esc(getTransport())} · ONLY_ON_DEVICE<br><small>CPU-only machines can take 20–80 s per spec; GPU machines are faster.</small>`), 500);
    if (nano.state !== "ready") status("warn", `On-device model ${esc(nano.state)} · rules-only check of spec ${i} of ${current.length}`);
    let r;
    try { r = await extractSpec(spec, { ...env, privacy, timeoutMs: 120000 }); } finally { clearInterval(tick); }
    results.push({ spec, r });
    profiles[spec.id] = r.profile;
    renderLog();
  }
  const ok = results.filter((x) => x.r.nanoStatus === "ok");
  const failed = results.filter((x) => x.r.nanoStatus !== "ok");
  if (failed.length === 0) status("ok", `On-device analysis completed: ${ok.length}/${results.length} specs ran on this device (Firebase AI Logic reported inferenceSource = on_device)${ok.some((x) => x.r.cached) ? " · some results reused from cache (same text + versions)" : ""}.`);
  else status("bad", `On-device analysis did NOT run for ${failed.length}/${results.length} specs (${failed.map((x) => esc(x.spec.itemId) + ": " + esc(x.r.nanoStatus)).join(", ")}). Those specs show a <b>rules-only result</b> and need review.`);
  lastProfiles = profiles;
  const findings = evaluate({ formulas: S.formulas, labels, currentSpecByItem: S.currentSpecByItem, profiles, determinations });
  renderFindings(findings, $("item-select").value);
  btn.disabled = false;
}

async function runRecall() {
  const notice = S.recallNotices.find((n) => n.id === $("recall-select").value);
  $("recall-result").textContent = "Reading the public notice — on this device if Gemini Nano is available, otherwise in the cloud…";
  try {
    const { terms, inferenceSource, ms, model } = await parseRecall(notice, env);
    const where = inferenceSource === "on_device" ? `<span class="badge ok">ran on this device</span> Gemini Nano · inferenceSource <code>on_device</code>`
      : inferenceSource === "in_cloud" ? `<span class="badge warn">ran in the cloud</span> ${esc(model)} · inferenceSource <code>in_cloud</code> (no on-device model here — hybrid fallback)`
      : `inferenceSource not reported`;
    const current = Object.values(S.specs).filter((s) => S.currentSpecByItem[s.itemId] === s.id);
    const m = matchRecall(terms, current, S.formulas);
    $("recall-result").innerHTML = `<p class="small">${where} · ${(ms / 1000).toFixed(1)} s · Firebase AI Logic <code>PREFER_ON_DEVICE</code> (public data only)</p>
      <p><b>Read (public):</b> ${esc(terms.product)} · ${esc(terms.firm)} · allergens: ${esc(terms.allergens.join(", "))} · lots: ${esc(terms.lots.join(", "))}</p>
      <p><b>Matched locally (private, 0 bytes uploaded):</b> ${m.hits.length ? m.hits.map((h) => `${esc(h.itemId)} (${h.confidence})`).join(", ") : "no supplier item matches"} → products: ${esc(m.skus.join(", ") || "none")}</p>`;
  } catch (e) {
    $("recall-result").textContent = `Reading the notice failed: ${e.message}`;
  }
  renderLog();
}

function init() {
  $("item-select").innerHTML = items.map((i) => `<option ${i === "SEAS-01" ? "selected" : ""}>${i}</option>`).join("");
  $("recall-select").innerHTML = S.recallNotices.map((n) => `<option value="${n.id}">${n.id}</option>`).join("");
  const showNotice = () => { $("recall-text").textContent = S.recallNotices.find((n) => n.id === $("recall-select").value).text; };
  $("recall-select").addEventListener("change", showNotice); showNotice();
  $("item-select").addEventListener("change", renderDiff); renderDiff();
  $("btn-check").addEventListener("click", () => runCheck());
  $("btn-recall").addEventListener("click", runRecall);
  netBadge(); renderNanoBadge(); checkAvailability();
  if (firebaseConfigured) appCheckStatus().then((a) => { $("badge-appcheck").textContent = a.ok ? `App Check: token OK${a.debug ? " (debug provider)" : " (reCAPTCHA Enterprise)"}` : `App Check: FAILED (${a.error})`; $("badge-appcheck").className = `badge ${a.ok ? "ok" : "warn"}`; });
  else { $("badge-appcheck").textContent = "App Check: Firebase not configured"; $("badge-appcheck").className = "badge warn"; }
}
init();

// Spec-to-Proof is the main view; the text-spec + recall tools live in the second tab.
import { initProof } from "./proof/ui.js";
initProof();
const showView = (id) => {
  for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.view === id);
  for (const v of document.querySelectorAll(".view")) v.hidden = v.id !== id;
};
for (const b of document.querySelectorAll(".tab")) b.addEventListener("click", () => showView(b.dataset.view));
document.addEventListener("click", (e) => { const a = e.target.closest("[data-goto]"); if (a) { e.preventDefault(); showView(a.dataset.goto); window.scrollTo(0, 0); } });
