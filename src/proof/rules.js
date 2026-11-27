// Spec-to-Proof: deterministic checks and comparison (no AI in this file).
// Nano only READS documents. Everything here decides what the readings mean, and refuses to decide when unsure.
//
// Scope: simplified US FDA major-allergen disclosure check (FALCPA + FASTER Act, 9 allergens). PROTOTYPE, not a
// compliance engine. Rule used: an allergen source is disclosed if its allergen name appears in the ingredient list
// (common name, e.g. "buttermilk", or parenthetical, e.g. "whey (milk)") OR in a "Contains:" statement; if a "Contains:"
// statement is printed it must list ALL allergen sources. "May contain" / facility statements never count as disclosure.
import { dictionaryExtract } from "../allergens/dictionary.js";
import { ALLERGENS } from "../schemas.js";

export const RULESET = { id: "us-fda-9-prototype", name: "US major food allergen check — prototype", version: "2026.11.26-1" };
export const STATE = { BLOCK: "PRINT_BLOCKED", REVIEW: "NEEDS_REVIEW", CLEAR: "CHECKS_CLEAR_AWAITING_SIGNOFF" };

// ---------- text helpers ----------
export const norm = (s) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/[\s　]+/g, " ").trim();
const LIST_NUMBER = /^\s*(?:\(?\d{1,2}[.)]|[•·\-–*])\s+/; // "1. ", "2) ", "(3) ", "• " — only at the start, followed by a space
export const stripListNumber = (s) => String(s ?? "").replace(LIST_NUMBER, "").trim();
const PLACEHOLDERS = new Set(["none", "n/a", "na", "nil", "-", "—", "not applicable", "no", "ninguno", "ninguna", "no aplica", "n/d", "該当なし", "なし", "無し", "特になし"]);
const bare = (s) => norm(s).replace(/[.。:：]+$/, "");
// Also catches a placeholder behind a short field label, e.g. "その他：該当なし", "Other: none", "Notas: N/A".
export const isPlaceholder = (s) => {
  const v = bare(s);
  if (PLACEHOLDERS.has(v)) return true;
  const m = v.match(/^(.{1,14}?)\s*[:：]\s*(.+)$/);
  return !!m && PLACEHOLDERS.has(bare(m[2]));
};

// "Contains:" / "Contiene:" / "含む" lines, found anywhere in a text (also when split over two lines).
const CONTAINS_RE = /(?:^|[\n.;]|\s)(contains|contiene|含む|含有)\s*[:：]\s*([^\n]*(?:\n(?![A-Z ]{3,}:)[^\n:：]{0,60})?)/gi;
const PRECAUTION_RE = /(may contain|traces? of|produced in a facility|processed in a facility|made in a facility|facility that also|shared equipment|same equipment|line also runs|puede contener|trazas de)/i;
export function findContainsLines(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(CONTAINS_RE)) {
    const before = String(text).slice(Math.max(0, m.index - 20), m.index + m[0].length);
    if (/may\s*$/i.test(String(text).slice(Math.max(0, m.index - 6), m.index + 1)) || /may contain/i.test(before)) continue; // "May contain:" is precautionary
    out.push({ keyword: m[1], body: m[2].replace(/\s+/g, " ").trim(), index: m.index });
  }
  return out;
}

// ---------- allergen terms ----------
// Label side: the allergen's own name must appear (part of a word is fine: "buttermilk", "soybean").
export const DISCLOSURE_TERMS = {
  milk: /milk/i,
  egg: /\beggs?\b/i,
  fish: /\bfish\b|pollock|\bcod\b|salmon|tuna|anchov|tilapia|haddock|bonito/i,
  shellfish: /shellfish|shrimp|crab|lobster|crawfish|crayfish|prawn|crustacean/i,
  treenut: /tree\s*nut|almond|cashew|walnut|pecan|pistachio|hazelnut|filbert|macadamia|brazil\s*nut|pine\s*nut/i,
  peanut: /peanut/i,
  wheat: /wheat/i,
  soy: /\bsoy/i,
  sesame: /sesame/i,
};
const disclosedIn = (allergen, text) => DISCLOSURE_TERMS[allergen].test(String(text ?? ""));

// ---------- independent check of the ORIGINAL (untranslated) words ----------
// The allergen mapping normally runs on Nano's English translation. This second, deterministic path looks for allergen
// words in the ORIGINAL Spanish / Japanese text. If it finds an allergen the translation lost, the reading is flagged and
// the allergen is still counted (conservative). Narrow look-alike exclusions avoid known false alarms.
export const ORIGINAL_TERMS = {
  milk: /leche(?!\s+de\s+(coco|soja|almendra|avena|arroz))|l[áa]cteo|suero de leche|mantequilla(?!\s+de\s+(cacahuete|man[ií]|almendra|semillas?))|queso|nata\b|case[íi]na|乳(?!化|酸)|ミルク|バター|チーズ|ホエイ|カゼイン/i,
  egg: /huevo|卵|たまご|鶏卵|エッグ/i,
  wheat: /trigo|s[ée]mola|小麦/i,
  soy: /\bsoja\b|\bsoya\b|大豆|しょうゆ|醤油/i,
  sesame: /s[ée]samo|ajonjol[ií]|ごま|胡麻|ゴマ/i,
  peanut: /cacahuete|cacahuate|man[ií]\b|落花生|ピーナッツ/i,
  treenut: /almendra|nuez|nueces|avellana|anacardo|pistacho|アーモンド|くるみ|クルミ|カシューナッツ|ヘーゼルナッツ/i,
  fish: /pescado|anchoa|bacalao|at[úu]n|salm[óo]n|魚|鮭|まぐろ|かつお/i,
  shellfish: /camar[óo]n|gamba|langostino|cangrejo|langosta|crust[áa]ceo|えび|エビ|海老|かに|カニ/i,
};
export function originalAllergens(text) {
  return Object.keys(ORIGINAL_TERMS).filter((a) => ORIGINAL_TERMS[a].test(String(text ?? "")));
}

// ---------- checks on a reading (before the reviewer confirms) ----------
/** Issue kinds that must be resolved or explicitly acknowledged by the reviewer before the reading can be confirmed. */
export const ISSUE = {
  PLACEHOLDER: "placeholder",
  NOT_IN_TEXT: "not_in_full_text",
  CONTAINS_CONFLICT: "contains_conflict",
  EMPTY: "empty_reading",
  AMBIGUOUS: "ambiguous_source",
  TRANSLATION: "translation_mismatch",
  MIXED_SCRIPT: "mixed_script",
};

/** Words that mix alphabets (e.g. Latin + Cyrillic "MALTOДЕКТРИН"): a known on-device reading glitch that looks right at a glance. */
const LATIN = /[A-Za-zÀ-ÿ]/, OTHER = /[\u0370-\u03FF\u0400-\u04FF]/; // Greek, Cyrillic
export function mixedScriptWords(text) {
  return [...new Set(String(text ?? "").split(/[^\p{L}]+/u).filter((w) => w && LATIN.test(w) && OTHER.test(w)))];
}
const mixedIssue = (where, words) => ({ kind: ISSUE.MIXED_SCRIPT, text: words.join(", "), msg: `${where} has a word that mixes alphabets: "${words.join('", "')}". The AI may have misread it — compare it with the image and correct the spelling.` });

/** Clean a raw supplier-spec reading. Returns the cleaned draft and the issues found. Never silently drops content:
 * removed placeholders are reported as issues. */
export function checkSpecReading(raw, { keepEmpty = false } = {}) {
  const issues = [];
  const full = String(raw?.full_text ?? "");
  const items = [];
  for (const it of raw?.ingredients ?? []) {
    const printed = stripListNumber(it.printed);
    if (!printed) { if (keepEmpty) items.push({ printed: "", english: String(it.english ?? ""), inText: true }); continue; }
    if (isPlaceholder(printed) || isPlaceholder(it.english)) {
      issues.push({ kind: ISSUE.PLACEHOLDER, text: printed, msg: `"${printed}" is a placeholder, not an ingredient. It was not added.` });
      continue;
    }
    const inText = !full || norm(full).includes(norm(printed));
    if (!inText) issues.push({ kind: ISSUE.NOT_IN_TEXT, text: printed, msg: `"${printed}" is not in the full reading of the document. Check it against the image.` });
    items.push({ printed, english: String(it.english ?? "").trim(), inText });
  }
  for (const it of items) {
    if (!it.printed) continue;
    const orig = originalAllergens(it.printed);
    const tr = dictionaryExtract("proof", `${it.english}.`).claims.filter((c) => c.assertion !== "precautionary").map((c) => c.allergen);
    const lost = orig.filter((a) => !tr.includes(a));
    if (lost.length) issues.push({ kind: ISSUE.TRANSLATION, text: it.printed, msg: `"${it.printed}" names ${lost.join(", ")} in the original language, but the English translation "${it.english}" does not. Check the translation against the image.` });
  }
  for (const it of items) { const w = mixedScriptWords(`${it.printed} ${it.english}`); if (w.length) issues.push(mixedIssue(`Ingredient "${it.printed}"`, w)); }
  if (!items.some((i) => i.printed)) issues.push({ kind: ISSUE.EMPTY, msg: "No ingredients could be read. Check the image or enter them manually." });
  return { language: raw?.language ?? null, full_text: full, ingredients: items, allergen_statement_printed: raw?.allergen_statement_printed ?? null, issues };
}

/** Check a raw label reading. The "Contains:" line is located by rule in the FULL reading, not only in the model's field. */
export function checkLabelReading(raw) {
  const issues = [];
  const full = String(raw?.full_text ?? "");
  let ing = String(raw?.ingredient_list_printed ?? "").trim();
  let contains = raw?.contains_printed ? String(raw.contains_printed).trim() : null;
  // A "Contains:" line inside the ingredient field (the specproof-v1 L07 failure) is moved out and flagged.
  const inIng = findContainsLines(ing);
  if (inIng.length) {
    const cut = ing.slice(inIng[0].index).trim();
    ing = ing.slice(0, inIng[0].index).trim().replace(/[\n,;]+$/, "");
    if (!contains) contains = cut.replace(/^[\n.;\s]+/, "");
    issues.push({ kind: ISSUE.CONTAINS_CONFLICT, msg: `A "Contains" statement was found inside the ingredient list and moved to its own field: "${cut.trim()}". Check it against the image.` });
  }
  // A "May contain" / facility statement inside the ingredient field must not count as a declaration: move it out.
  const pm = ing.match(new RegExp(`[\\n.;,]?\\s*[^\\n.;]*${PRECAUTION_RE.source}[^\\n]*$`, "i"));
  let movedPrecaution = null;
  if (pm) {
    movedPrecaution = pm[0].replace(/^[\n.;,\s]+/, "").trim();
    ing = ing.slice(0, pm.index).trim().replace(/[\n,;]+$/, "");
    issues.push({ kind: ISSUE.CONTAINS_CONFLICT, msg: `A precautionary statement was found inside the ingredient list and moved out: "${movedPrecaution}". It does not count as declaring an allergen. Check it against the image.` });
  }
  const inFull = findContainsLines(full);
  if (inFull.length && !contains) {
    contains = `Contains: ${inFull[0].body}`;
    issues.push({ kind: ISSUE.CONTAINS_CONFLICT, msg: `The full reading has a "Contains" statement ("${inFull[0].body}") that was missing from the structured field. Check it against the image.` });
  } else if (inFull.length && contains && !inFull.some((l) => norm(contains).includes(norm(l.body)))) {
    issues.push({ kind: ISSUE.CONTAINS_CONFLICT, msg: `The "Contains" field ("${contains}") differs from the full reading ("${inFull[0].body}"). Check it against the image.` });
  } else if (!inFull.length && contains && full) {
    issues.push({ kind: ISSUE.CONTAINS_CONFLICT, msg: `A "Contains" statement was returned but is not in the full reading. Check it against the image.` });
  }
  const precautionary = (full.match(new RegExp(`[^\\n.]*${PRECAUTION_RE.source}[^\\n.]*`, "i")) || [null])[0];
  const mixed = mixedScriptWords(`${ing} ${contains ?? ""}`);
  if (mixed.length) issues.push(mixedIssue("The label reading", mixed));
  if (ing.replace(/ingredients?\s*:?/i, "").trim().length < 5) issues.push({ kind: ISSUE.EMPTY, msg: "No ingredient list could be read. Check the image or enter it manually." });
  return { full_text: full, ingredient_list_printed: ing, contains_printed: contains, precautionary_printed: movedPrecaution ?? precautionary?.trim() ?? null, issues };
}

/** Issues that block confirmation until the reviewer edits the reading or ticks "checked against the image". */
export const blocking = (issues) => issues.filter((i) => i.kind !== ISSUE.AMBIGUOUS);

// ---------- comparison (only on reviewer-confirmed readings) ----------
/** Allergen sources in the supplier spec, via the frozen dictionary over the confirmed English meanings + statement. */
// Facility / cross-contact wording in a supplier allergen statement. Such sentences are advisory and never make an
// allergen an INGREDIENT of the spec (found in the Nov 26 acceptance run: "Manufactured in a plant that also processes sesame").
const SPEC_ADVISORY = /(may contain|traces?\b|facility|plant|factory|premises|production line|same line|shared|equipment|also (processes|handles|produces|uses|packs|manufactures)|cross[- ]contact|puede contener|trazas|planta|instalaci|工場|製造ライン|同一ライン|コンタミ)/i;
export const advisorySentences = (t) => String(t ?? "").split(/(?<=[.。;；!?])\s*/).filter((x) => SPEC_ADVISORY.test(x));
const withoutAdvisory = (t) => String(t ?? "").split(/(?<=[.。;；!?])\s*/).filter((x) => x && !SPEC_ADVISORY.test(x)).join(" ");

export function specSources(spec) {
  const rows = spec.ingredients.map((it) => {
    const text = `${it.english}`;
    const found = dictionaryExtract("proof", text + ".").claims.filter((c) => c.assertion !== "precautionary").map((c) => c.allergen);
    return { ...it, allergens: [...new Set(found)] };
  });
  const stmtText = withoutAdvisory(spec.allergen_statement_english || spec.allergen_statement_printed);
  const stmt = stmtText ? dictionaryExtract("proof", stmtText + ".").claims.filter((c) => c.assertion !== "precautionary").map((c) => c.allergen) : [];
  // Independent path on the original words (ingredients + non-advisory part of the original statement).
  const lost = [];
  for (const r of rows) {
    const orig = originalAllergens(r.printed).filter((a) => !r.allergens.includes(a));
    if (orig.length) { lost.push({ printed: r.printed, english: r.english, allergens: orig }); r.allergens = [...new Set([...r.allergens, ...orig])]; }
  }
  const stmtOrig = originalAllergens(withoutAdvisory(spec.allergen_statement_original ?? ""));
  const all = new Set([...rows.flatMap((r) => r.allergens), ...stmt, ...stmtOrig]);
  const ambiguous = rows.filter((r) => !r.allergens.length && dictionaryExtract("proof", r.english + ".").unresolved.some((u) => /unspecified source/.test(u)));
  return { rows, statementAllergens: [...new Set([...stmt, ...stmtOrig])], allergens: ALLERGENS.filter((a) => all.has(a)), ambiguous, translationLost: lost };
}

/**
 * @param {object} p
 * @param {{ingredients:{printed:string,english:string}[], allergen_statement_printed?:string|null, confirmed:boolean}} p.spec
 * @param {{ingredient_list_printed:string, contains_printed:string|null, precautionary_printed?:string|null, confirmed:boolean}} p.label
 * @param {string[]} [p.otherAllergens]  allergen sources the product gets from its OTHER (unchanged) supplier items
 */
export function compare({ spec, label, otherAllergens = [] }) {
  if (!spec?.confirmed || !label?.confirmed) {
    return { state: STATE.REVIEW, findings: [], reasons: ["Both readings must be confirmed by the reviewer before the comparison runs."] };
  }
  const src = specSources(spec);
  const required = [...new Set([...src.allergens, ...otherAllergens])];
  const ing = label.ingredient_list_printed;
  const cont = label.contains_printed;
  const findings = [];
  for (const a of ALLERGENS.filter((x) => required.includes(x))) {
    const fromSpec = src.rows.filter((r) => r.allergens.includes(a));
    const inIng = disclosedIn(a, ing), inCont = cont ? disclosedIn(a, cont) : false;
    const onlyPrecaution = !inIng && !inCont && label.precautionary_printed && disclosedIn(a, label.precautionary_printed);
    let status = "disclosed", why;
    if (cont && !inCont) { status = "missing"; why = `The label has a "Contains" statement, but it does not name ${a}. If a "Contains" statement is used it must list every allergen source.`; }
    else if (!inIng && !inCont) { status = "missing"; why = onlyPrecaution ? `${a} appears only in a precautionary ("may contain") statement, which does not declare an ingredient.` : `${a} is not named in the ingredient list or in a "Contains" statement.`; }
    else why = inCont ? `Declared in the "Contains" statement.` : `Named in the ingredient list.`;
    findings.push({ allergen: a, status, why, specEvidence: fromSpec.map((r) => r.printed), fromOtherItems: !fromSpec.length, labelEvidence: inCont ? cont : (ing.match(new RegExp(`[^,(]*${DISCLOSURE_TERMS[a].source}[^,)]*`, "i")) || [""])[0].trim() });
  }
  const missing = findings.filter((f) => f.status === "missing");
  const reasons = [];
  if (missing.length) return { state: STATE.BLOCK, findings, sources: src, reasons: missing.map((m) => m.why) };
  if (src.ambiguous.length && !src.statementAllergens.length && !spec.allergen_statement_printed) {
    reasons.push(`Unspecified source in the supplier spec: ${src.ambiguous.map((r) => `"${r.printed}"`).join(", ")}. Ask the supplier which allergens it may contain.`);
    return { state: STATE.REVIEW, findings, sources: src, reasons };
  }
  return { state: STATE.CLEAR, findings, sources: src, reasons: ["No discrepancy found. A qualified QA reviewer must still sign off before printing."] };
}

// ---------- what changed since the last approved supplier revision ----------
// Translation variants of the same ingredient word (seen in real on-device readings: "Aroma natural" → "Natural aroma"
// one run, "Natural flavor" another). Used only to pair old and new wording in the change list — never for allergen decisions.
const SAME_WORD = [[/\bflavou?rings?\b/g, "flavor"], [/\bflavour\b/g, "flavor"], [/\baromas?\b/g, "flavor"], [/\bpowdered (\w+)/g, "$1 powder"]];
const unify = (t) => SAME_WORD.reduce((x, [re, to]) => x.replace(re, to), t);
const baseName = (t) => unify(norm(t)).replace(/\(.*$/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const fullName = (t) => unify(norm(t)).replace(/[^a-z0-9 ()]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["of", "de", "the", "a", "and", "en", "y"]);
const stem = (w) => w.replace(/(ed|es|s)$/, "");
const wordSet = (t) => new Set(fullName(t).replace(/[()]/g, " ").split(" ").filter((w) => w && !STOP.has(w)).map(stem));
const sameWords = (a, b) => { const x = wordSet(a), y = wordSet(b); return x.size > 0 && x.size === y.size && [...x].every((w) => y.has(w)); };
// One name's words all appear in the other ("yeast extract" vs "brewer's yeast extract"): a wording difference
// (often just the on-device translation), reported as "reworded", never as removed + added.
const subsetWords = (a, b) => { const x = wordSet(a), y = wordSet(b); const [s, l] = x.size <= y.size ? [x, y] : [y, x]; return s.size >= 2 && [...s].every((w) => l.has(w)); };
/** Split "a, b (c, d), e" at top-level commas. */
export function splitIngredients(text) {
  const out = []; let depth = 0, cur = "";
  for (const ch of String(text ?? "")) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim().replace(/[.]$/, ""));
  return out;
}
/** Ingredients from an approved text spec ("... Ingredients: a, b, c. Next sentence"). */
export function ingredientsFromSpecText(text) {
  const m = String(text ?? "").match(/ingredients?\s*:\s*([\s\S]*?)(?:\.\s+[A-Z]|\.$|$)/i);
  return m ? splitIngredients(m[1]) : [];
}
/**
 * Document comparison (wording) and allergen implications (rules), reported separately.
 * @param {string} previousText approved previous revision (text)
 * @param {{ingredients:{printed:string,english:string}[], allergen_statement_printed?:string|null, allergen_statement_english?:string|null}} next confirmed new reading
 */
export function specChanges(previousText, next) {
  const prev = ingredientsFromSpecText(previousText);
  const used = new Set();
  const changes = [];
  for (const it of next.ingredients) {
    const en = it.english || it.printed;
    let j = prev.findIndex((p, k) => !used.has(k) && (fullName(p) === fullName(en) || sameWords(p, en)));
    if (j >= 0) { used.add(j); continue; } // unchanged (same words, any order: "powdered onion" = "onion powder")
    j = prev.findIndex((p, k) => !used.has(k) && baseName(p) && baseName(p) === baseName(en));
    if (j >= 0) { used.add(j); changes.push({ kind: "changed", before: prev[j], after: it.printed, afterEnglish: en }); continue; }
    changes.push({ kind: "added", after: it.printed, afterEnglish: en });
  }
  // second pass: pair leftover added/removed items whose words overlap completely
  for (const c of changes) {
    if (c.kind !== "added") continue;
    const j = prev.findIndex((p, k) => !used.has(k) && subsetWords(p, c.afterEnglish));
    if (j >= 0) { used.add(j); Object.assign(c, { kind: "reworded", before: prev[j] }); }
  }
  prev.forEach((p, k) => { if (!used.has(k)) changes.push({ kind: "removed", before: p }); });
  const before = new Set(dictionaryExtract("prev", previousText).claims.filter((c) => c.assertion !== "precautionary").map((c) => c.allergen));
  const after = new Set(specSources({ ...next, allergen_statement_printed: next.allergen_statement_english || next.allergen_statement_printed, allergen_statement_original: next.allergen_statement_printed }).allergens);
  return {
    changes, unchangedCount: next.ingredients.length - changes.filter((c) => c.kind !== "removed").length,
    allergensAdded: ALLERGENS.filter((a) => after.has(a) && !before.has(a)),
    allergensRemoved: ALLERGENS.filter((a) => before.has(a) && !after.has(a)),
    allergensBefore: ALLERGENS.filter((a) => before.has(a)), allergensAfter: ALLERGENS.filter((a) => after.has(a)),
  };
}
