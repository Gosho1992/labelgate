// Deterministic layer for the Spec-to-Proof feasibility test. FROZEN before any model run.
// Scope: a SIMPLIFIED US FDA (FALCPA/FASTER) disclosure check for the 9 major allergens. Not a compliance engine.
import { dictionaryExtract } from "../allergens/dictionary.js";
import { ALLERGENS } from "../schemas.js";

/** Spec side: which allergen SOURCES are present, mapped by the frozen dictionary over the English translations
 * plus the allergen statement. The model's translation is the weak link; that is exactly what the test measures. */
export function specAllergens(extraction) {
  // The model's self-reported "legible" flag is NOT used for the decision: on both DEV images it said false
  // while transcribing perfectly (found on dev data before any evaluation run). Empty extraction -> NEEDS_REVIEW.
  if (!extraction) return { status: "NEEDS_REVIEW", allergens: [] };
  const text = [...(extraction.ingredients || []).map((i) => i.english), extraction.allergen_statement_printed || ""].join("; ") + ".";
  const found = new Set(dictionaryExtract("specproof", text).claims.filter((c) => c.assertion !== "precautionary").map((c) => c.allergen));
  return { status: (extraction.ingredients || []).length ? "OK" : "NEEDS_REVIEW", allergens: ALLERGENS.filter((a) => found.has(a)) };
}

/** Label side: an allergen counts as DISCLOSED only if the allergen's own name appears (word or part of a word,
 * e.g. "buttermilk" -> milk, "soybean" -> soy). A source name alone ("whey", "casein", "semolina", "tahini") does not. */
export const DISCLOSURE_TERMS = {
  milk: /milk/i,
  egg: /\beggs?\b|\begg\s/i,
  fish: /\bfish\b|pollock|\bcod\b|salmon|tuna|anchov|tilapia|haddock/i,
  shellfish: /shellfish|shrimp|crab|lobster|crawfish|prawn/i,
  treenut: /tree\s*nut|almond|cashew|walnut|pecan|pistachio|hazelnut|macadamia|brazil\s*nut|pine\s*nut|coconut/i,
  peanut: /peanut/i,
  wheat: /wheat/i,
  soy: /\bsoy/i,
  sesame: /sesame/i,
};

/**
 * @param {string[]} formulaAllergens  truth from the supplier side (what the product contains)
 * @param {{legible:boolean, ingredient_list_printed:string, contains_printed:string|null}} label  transcription
 * @returns {{decision:"BLOCK"|"NEEDS_REVIEW"|"CLEAR_AWAITING_SIGNOFF", reasons:string[]}}
 */
export function decideLabel(formulaAllergens, label) {
  if (!label) return { decision: "NEEDS_REVIEW", reasons: ["no transcription"] }; // self-reported legible flag not used (see specAllergens)
  const ing = String(label.ingredient_list_printed || "");
  if (ing.replace(/ingredients:?/i, "").trim().length < 5) return { decision: "NEEDS_REVIEW", reasons: ["no ingredient list read"] };
  const cont = label.contains_printed ? String(label.contains_printed) : null;
  const reasons = [];
  for (const a of formulaAllergens) {
    const inIng = DISCLOSURE_TERMS[a].test(ing);
    const inCont = cont ? DISCLOSURE_TERMS[a].test(cont) : false;
    if (cont && !inCont) reasons.push(`${a}: "Contains" statement printed but does not list it`);
    else if (!inIng && !inCont) reasons.push(`${a}: not disclosed in ingredient list or Contains statement`);
  }
  return reasons.length ? { decision: "BLOCK", reasons } : { decision: "CLEAR_AWAITING_SIGNOFF", reasons: [] };
}
