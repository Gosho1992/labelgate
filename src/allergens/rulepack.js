// US FALCPA / FASTER Act label rule pack (deterministic).
// Sources: FDA "Food Allergies" page; FDA FALCPA Q&A; FDA Food Allergen Q&A Guidance (5th ed.).
// Rule summary:
//  R1. Each major allergen present must be declared EITHER in the ingredient statement
//      (common name, or parenthetical like "whey (milk)") OR in a "Contains" statement.
//  R2. If a "Contains" statement is used, it must name ALL major allergen sources present.
//  R3. "Contains" may name only major allergens (e.g. not gluten, not coconut).
//  R4. Tree nuts must be named by type; fish/crustacean shellfish by species (flagged for review, not auto-checked here).
import { ALLERGENS } from "../schemas.js";

export const RULEPACK_VERSION = "US-FALCPA-2026.11.25-1";

// Words on a label that declare the allergen source (common or usual name of the source).
const LABEL_SOURCE_WORDS = {
  milk: ["milk"], egg: ["egg", "eggs"], fish: ["fish", "cod", "salmon", "tuna", "anchovy", "anchovies", "pollock", "haddock", "bonito"],
  shellfish: ["shrimp", "prawn", "crab", "lobster", "crayfish", "shellfish"],
  treenut: ["almond", "almonds", "cashew", "walnut", "hazelnut", "hazelnuts", "pecan", "pistachio", "macadamia", "pine nut", "brazil nut"],
  peanut: ["peanut", "peanuts"], wheat: ["wheat"], soy: ["soy", "soybean", "soybeans", "soya"], sesame: ["sesame"],
};
const NOT_MAJOR_IN_CONTAINS = ["gluten", "coconut", "celery", "mustard", "lupin", "sulphite", "sulfite", "mollusc"];

const has = (text, words) => !!text && words.some((w) => new RegExp(`\\b${w}\\b`, "i").test(text));

/**
 * Check one label proof against the set of allergens present in its formula.
 * @param {{ingredientStatement:string, containsStatement:string|null}} label
 * @param {Set<string>} present
 * @returns {{violations:{rule:string,allergen?:string,detail:string}[], warnings:{rule:string,detail:string}[]}}
 */
export function checkLabel(label, present) {
  const violations = [];
  const warnings = [];
  const ing = label.ingredientStatement || "";
  const contains = label.containsStatement;
  for (const a of ALLERGENS) {
    if (!present.has(a)) continue;
    const inIngredients = has(ing, LABEL_SOURCE_WORDS[a]);
    const inContains = contains ? has(contains, LABEL_SOURCE_WORDS[a]) : false;
    if (contains) {
      if (!inContains) violations.push({ rule: "R2", allergen: a, detail: `"Contains" statement is used but does not name ${a}` });
    } else if (!inIngredients) {
      violations.push({ rule: "R1", allergen: a, detail: `${a} is present but not declared in the ingredient statement and there is no "Contains" statement` });
    }
  }
  if (contains) {
    for (const w of NOT_MAJOR_IN_CONTAINS) {
      if (new RegExp(`\\b${w}`, "i").test(contains)) warnings.push({ rule: "R3", detail: `"Contains" names "${w}", which is not a US major allergen` });
    }
  }
  if (present.has("treenut") || present.has("fish") || present.has("shellfish")) {
    warnings.push({ rule: "R4", detail: "Tree nut type / fish or crustacean species must be named; confirm wording" });
  }
  return { violations, warnings };
}
