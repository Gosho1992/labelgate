// Simple, standalone blind reviewer test (reviewer-test.html).
// v1 (27 Nov 09:40) used tick boxes: 2 testers, 0 of 6 planted errors caught (they ticked to move on).
// v2 (this file): big picture first, then neutral A/B questions ("Which does the picture say?") built from the
// differences between the computer's reading and the old approved label — same logic as the app (verify.js).
// 4 rounds per tester, random order: V1–V3 = real picture B6 (milk NOT declared) with a wrong reading;
// V4 = a different real picture (B3, milk really added) with a correct reading. Results only on ?results.
import { VARIANTS, imageFor, classify, saveRun, resultsHTML } from "./reviewer-test.js";
import { currentRecord } from "./library.js";
import { verificationQuestions, applyAnswers, orderOptions, UNSURE, anyUnsure } from "./verify.js";

const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const OLD = currentRecord("SKU-1003");
const ORDER = ["V1", "V2", "V3", "V4"];
const S = { name: "", order: [], round: 0, qs: [], answers: {}, shownAt: 0, seed: "" };

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const progress = () => `<div class="progress">${ORDER.map((_, i) => `<span class="dot ${i < S.round ? "done" : i === S.round ? "on" : ""}"></span>`).join("")}<span>Round ${S.round + 1} of ${ORDER.length}</span></div>`;

function welcome() {
  app.innerHTML = `<h1>Label check — 4 short rounds</h1>
    <p class="big">A computer read some food labels from pictures. It sometimes makes mistakes.</p>
    <p class="big">In each round you will see <b>a picture of a label</b> and <b>one or two short questions</b>. Answer by <b>looking at the picture</b>. No food knowledge needed.</p>
    <label class="f">Your name</label>
    <input type="text" id="name" placeholder="Type your name" autocomplete="off">
    <div class="row"><button class="go" id="start" disabled>Start</button></div>`;
  const n = document.getElementById("name"), b = document.getElementById("start");
  n.addEventListener("input", () => { b.disabled = !n.value.trim(); });
  n.addEventListener("keydown", (e) => { if (e.key === "Enter" && n.value.trim()) b.click(); });
  b.addEventListener("click", () => { S.name = n.value.trim(); S.order = shuffle([...ORDER]); S.round = 0; round(); });
  n.focus();
}
function round() {
  const v = S.order[S.round];
  S.qs = verificationQuestions(OLD, VARIANTS[v].reading); S.answers = {}; S.seed = `${S.name}|${S.round}|${Math.random()}`; S.shownAt = performance.now();
  draw();
}
function draw() {
  const v = S.order[S.round], all = S.qs.every((q) => S.answers[q.id]);
  app.innerHTML = `${progress()}
    <h2>Look at this label picture</h2>
    <div class="pic big"><img src="${imageFor(v)}" alt="Picture of a food label"></div>
    <h2 style="margin-top:22px">Answer by looking at the picture</h2>
    <p class="hint">The options show only the part where the two wordings differ.</p>
    ${S.qs.map((q, n) => `<div class="q"><div class="qp">${n + 1}. ${esc(q.prompt)}</div>
      ${[...orderOptions(q, S.seed), UNSURE].map((o) => `<label class="opt ${o.key === "unsure" ? "unsure" : ""} ${S.answers[q.id] === o.key ? "sel" : ""}"><input type="radio" name="${esc(q.id)}" value="${o.key}" ${S.answers[q.id] === o.key ? "checked" : ""}><span>${esc(o.text)}</span></label>`).join("")}</div>`).join("")}
    <div class="row"><button class="go" id="next" ${all ? "" : "disabled"}>Next</button>${all ? "" : `<span class="hint">Answer every question first.</span>`}</div>`;
  app.querySelectorAll("input[type=radio]").forEach((r) => r.addEventListener("change", () => { S.answers[r.name] = r.value; const y = scrollY; draw(); scrollTo(0, y); }));
  document.getElementById("next").addEventListener("click", finishRound);
}
function finishRound() {
  const v = S.order[S.round], reading = VARIANTS[v].reading;
  const c = applyAnswers({ ingredient_list_printed: reading.ingredient_list_printed, contains_printed: reading.contains_printed }, S.qs, S.answers);
  const confirmed = { ingredient_list_printed: c.ingredient_list_printed, contains_printed: c.contains_printed || null };
  saveRun({ at: new Date().toISOString(), ui: "v3 A/B, no highlight, can't-tell", tester: S.name, round: S.round + 1, variant: v, ...classify(v, confirmed, anyUnsure(S.qs, S.answers)),
    seconds: Math.round((performance.now() - S.shownAt) / 1000), answers: S.qs.map((q) => ({ question: q.prompt, chose: { new: "computer's reading", old: "old label wording", unsure: "can't tell" }[S.answers[q.id]] })), confirmed });
  S.round++;
  if (S.round < ORDER.length) { round(); scrollTo(0, 0); } else thanks();
}
function thanks() {
  app.innerHTML = `<h1>Thank you, ${esc(S.name)}!</h1><p class="big">All rounds are saved. You can hand the computer back now.</p>
    <div class="row"><button class="go" id="again">Start for the next person</button></div>`;
  document.getElementById("again").addEventListener("click", welcome);
}

if (new URLSearchParams(location.search).has("results")) app.innerHTML = resultsHTML(esc).replace(`href="/app/?reviewer-test=1"`, `href="/reviewer-test.html"`);
else welcome();
