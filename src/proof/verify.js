// Verification questions for an artwork reading (27 Nov, after the human blind test).
// With tick boxes ("tick if you can see it on the picture"), 2 of 2 testers ticked every highlighted part and missed
// all 6 planted errors (automation bias: the computer's text was treated as the default). Here every difference between
// the computer's reading and the previously approved label becomes a neutral question: "Which does the picture say?"
// with the approved wording and the computer's wording as equal options, in random order, nothing pre-selected.
// The answer — not the computer — decides the confirmed text.
import { labelDiff } from "./library.js";

const NO_LINE = "No — the picture has no “Contains” line";

/** @returns {{id:string, prompt:string, options:{key:"old"|"new", text:string, vs:string}[]}[]} */
export function verificationQuestions(oldRec, reading) {
  if (!oldRec || !reading) return [];
  const d = labelDiff(oldRec, reading, null);
  const head = (x) => x.split("(")[0].trim().toLowerCase();
  const removed = [...d.removed], qs = [];
  for (const a of d.added) {
    const j = removed.findIndex((x) => head(x) && head(x) === head(a));
    if (j >= 0) {
      const b = removed.splice(j, 1)[0];
      const [tb, ta] = trimCommon(b, a);
      qs.push({ id: `pair:${a}`, kind: "pair", a, b, prompt: "Which wording is actually printed in the ingredient list of the picture?",
        options: [{ key: "old", text: tb, vs: "" }, { key: "new", text: ta, vs: "" }] });
    } else {
      qs.push({ id: `add:${a}`, kind: "add", a, prompt: `Is this in the ingredient list in the picture?`,
        options: [{ key: "new", text: `Yes — the picture says “${a}”`, vs: "" }, { key: "old", text: "No — this is not in the picture", vs: "" }] });
    }
  }
  for (const b of removed) qs.push({ id: `rem:${b}`, kind: "rem", b, prompt: `Is this in the ingredient list in the picture?`,
    options: [{ key: "old", text: `Yes — the picture says “${b}”`, vs: "" }, { key: "new", text: "No — this is not in the picture", vs: "" }] });
  if (d.containsChanged) qs.push({ id: "contains", kind: "contains", before: d.containsBefore, after: d.containsAfter, prompt: "Is a “Contains” line actually printed on the picture? If yes, which one?",
    options: [{ key: "old", text: d.containsBefore ? `Yes — “${d.containsBefore}”` : NO_LINE, vs: "" }, { key: "new", text: d.containsAfter ? `Yes — “${d.containsAfter}”` : NO_LINE, vs: "" }] });
  return qs;
}

/** Show only the part where two wordings differ, with the same amount of shared context on both (no highlight on either). */
export function trimCommon(b, a, ctx = 2) {
  const x = String(b).split(" "), y = String(a).split(" ");
  let p = 0; while (p < x.length && p < y.length && x[p] === y[p]) p++;
  let s = 0; while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++;
  const from = Math.max(0, p - ctx), cut = (w) => `${from > 0 ? "… " : ""}${w.slice(from, Math.min(w.length, w.length - s + ctx)).join(" ")}${s > ctx ? " …" : ""}`;
  return [cut(x), cut(y)];
}
/** Every question also offers "I can't tell from the picture" → the result becomes NEEDS REVIEW, never a guess. */
export const UNSURE = { key: "unsure", text: "I can't tell from the picture", vs: "" };
export const anyUnsure = (qs, answers) => qs.some((q) => answers[q.id] === "unsure");

/** Apply the reviewer's answers to the computer's reading. "new" keeps the computer's text; "old" restores the approved wording. */
export function applyAnswers(reading, qs, answers) {
  let ing = String(reading.ingredient_list_printed ?? ""), cont = reading.contains_printed ?? null;
  for (const q of qs) {
    if (answers[q.id] !== "old") continue;
    if (q.kind === "pair") ing = ing.replace(q.a, q.b);
    else if (q.kind === "add") ing = ing.replace(new RegExp(`,?\\s*${q.a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "");
    else if (q.kind === "rem") ing = ing.replace(/\.?\s*$/, `, ${q.b}.`);
    else if (q.kind === "contains") cont = q.before;
  }
  return { ...reading, ingredient_list_printed: ing, contains_printed: cont };
}

/** Deterministic shuffle of the two options per question (so re-renders keep the same order). */
export function orderOptions(q, seed) {
  let h = 2166136261; for (const c of `${seed}|${q.id}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 2 ? [...q.options].reverse() : q.options;
}
