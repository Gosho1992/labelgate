// Spec-to-Proof feasibility harness. Real Firebase AI Logic path, InferenceMode.ONLY_ON_DEVICE, image input.
// Every request made during inference is recorded; any request to another origin is reported (target: 0).
import { getGenerativeModel, InferenceMode, InferenceSource } from "firebase/ai";
import { initFirebase, firebaseConfigured, SDK } from "../ai/firebase.js";
import { SPEC_PROMPT, LABEL_PROMPT, SPEC_SCHEMA, LABEL_SCHEMA, SPECPROOF_PROMPT_VERSION } from "./prompts.js";
import { decideLabel, specAllergens } from "./decide.js";
import cases from "../../bench/specproof/specproof-v1.json";
import manifest from "../../bench/specproof/manifest.json";
import dev from "../../bench/specproof/dev-cases.json";
const DEV_MANIFEST = [{ id: "D01", file: "D01.png", condition: "dev", kind: "spec" }, { id: "D02", file: "D02.png", condition: "dev", kind: "label" }];

const $ = (id) => document.getElementById(id);
const log = [];
let recording = false;
const rec = (kind, url) => { if (recording) log.push({ kind, url: String(url).slice(0, 120), at: performance.now() }); };
const of = window.fetch;
window.fetch = function (input, init) { rec("fetch", input?.url ?? input); return of.apply(this, arguments); };
const ox = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (m, u) { rec("xhr", u); return ox.apply(this, arguments); };
const ob = navigator.sendBeacon?.bind(navigator);
if (ob) navigator.sendBeacon = (u, d) => { rec("beacon", u); return ob(u, d); };
new PerformanceObserver((l) => { for (const e of l.getEntries()) rec(`resource:${e.initiatorType}`, e.name); }).observe({ type: "resource", buffered: false });
const external = (e) => !e.url.startsWith(location.origin) && !e.url.startsWith("data:") && !e.url.startsWith("blob:");

const CREATE = { expectedInputs: [{ type: "text", languages: ["en", "es", "ja"] }, { type: "image" }], expectedOutputs: [{ type: "text", languages: ["en"] }] };
const models = {};
function model(kind) {
  return (models[kind] ||= getGenerativeModel(initFirebase(), {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: CREATE, promptOptions: { responseConstraint: kind === "spec" ? SPEC_SCHEMA : LABEL_SCHEMA } },
  }));
}

async function imagePart(file) {
  const b = await (await of(`/specproof/${file}`)).blob(); // loaded BEFORE recording starts
  const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1]); fr.readAsDataURL(b); });
  return { inlineData: { mimeType: b.type || (file.endsWith(".jpg") ? "image/jpeg" : "image/png"), data } };
}

const caseById = Object.fromEntries([...cases.specs, ...cases.labels, ...dev.specs, ...dev.labels].map((c) => [c.id, c]));
const results = [];
window.__specproof = { meta: null, results };

async function runOne(m, rep) {
  const c = caseById[m.copy_of || m.id];
  const kind = m.kind;
  const img = await imagePart(m.file);
  log.length = 0; recording = true;
  const t0 = performance.now();
  let raw = null, parsed = null, source = null, error = null;
  try {
    const r = await model(kind).generateContent([kind === "spec" ? SPEC_PROMPT : LABEL_PROMPT, img]);
    source = r.response.inferenceSource;
    if (source !== InferenceSource.ON_DEVICE) throw new Error(`privacy guard: inferenceSource=${source}`);
    raw = r.response.text();
    try { parsed = JSON.parse(raw); } catch { error = "malformed JSON"; }
  } catch (e) { error = e.message; }
  const ms = Math.round(performance.now() - t0);
  await new Promise((r) => setTimeout(r, 300));
  recording = false;
  const ext = log.filter(external);
  const decision = kind === "spec" ? specAllergens(parsed) : decideLabel(c.formula_allergens, parsed);
  const row = { id: m.id, rep, kind, condition: m.condition, ms, inferenceSource: source, error, raw: raw?.slice(0, 4000) ?? null, parsed, decision, requests: log.length, externalRequests: ext.map((e) => e.url) };
  results.push(row);
  return row;
}

$("btn-init").onclick = async () => {
  const t0 = performance.now();
  $("status").textContent = "Initialising on-device model (both configs)…";
  try {
    await model("spec").initializeDeviceModel?.((p) => ($("status").textContent = `Downloading ${Math.round((p.loaded ?? p) * 100)}%`));
    await model("label").initializeDeviceModel?.();
    $("status").textContent = `Ready in ${Math.round(performance.now() - t0)} ms`;
  } catch (e) { $("status").textContent = "Init failed: " + e.message; }
};

$("btn-run").onclick = async () => {
  const reps = Number($("reps").value) || 1;
  const only = $("only").value.trim();
  const plan = [];
  for (let rep = 1; rep <= reps; rep++) for (const m of [...manifest, ...DEV_MANIFEST]) if ((only || !m.id.startsWith("D")) && (!only || only.split(",").includes(m.id))) plan.push([m, rep]);
  window.__specproof.meta = { started: new Date().toISOString(), ua: navigator.userAgent, cores: navigator.hardwareConcurrency, sdk: SDK, prompt: SPECPROOF_PROMPT_VERSION, cases: cases.version, reps, only: only || null };
  let i = 0;
  for (const [m, rep] of plan) {
    i++;
    $("status").textContent = `Run ${i}/${plan.length} · ${m.id} (rep ${rep}) · ${m.condition}`;
    const r = await runOne(m, rep);
    $("rows").insertAdjacentHTML("beforeend", `<tr><td>${r.id}#${r.rep}</td><td>${r.condition}</td><td>${r.inferenceSource ?? "-"}</td><td>${r.ms}</td><td>${r.error ?? ""}</td><td>${r.kind === "spec" ? (r.decision.allergens || []).join(",") || r.decision.status : r.decision.decision}</td><td>${r.externalRequests.length}</td></tr>`);
  }
  window.__specproof.meta.finished = new Date().toISOString();
  $("status").textContent = `Done: ${results.length} runs. External requests during inference: ${results.reduce((a, r) => a + r.externalRequests.length, 0)}`;
};

$("cfg").textContent = `Firebase configured: ${firebaseConfigured} · ${SDK.package}@${SDK.version} · ONLY_ON_DEVICE · ${SPECPROOF_PROMPT_VERSION} · ${manifest.length} images`;
initFirebase();
