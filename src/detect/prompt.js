// Frozen extraction prompt shared by EVERY Nano transport (Prompt API now, Firebase AI Logic in Phase E)
// and by the benchmark. Moved verbatim from src/ai/firebase.js on Nov 25, 2026.
// FROZEN: do not edit to improve held-out scores. Any change needs a new PROMPT_VERSION and a fresh held-out set.
// test/frozen.test.js pins the hash of both versions.
export const PROMPT_VERSION = "discovery-v2-2026.11.26";
export const PROMPT_VERSION_V1 = "extract-v1-2026.11.25";

/** v1 prompt: used for go/no-go v1 and B2 (v2 held-out). Frozen for history; not used by the pipeline any more. */
export const EXTRACT_SYSTEM_V1 = `You extract food-allergen evidence from ONE supplier specification for a manufacturer's QA team.
Use only these allergen keys: milk, egg, fish, shellfish (crustaceans), treenut, peanut, wheat (incl. spelt, durum, semolina, Triticum), soy, sesame.
For every allergen source mentioned, output a claim with assertion:
 - "intentional": present as an ingredient or sub-ingredient, including derivatives (whey, casein, lactalbumin, albumen, lysozyme, anchovy, bonito, marzipan, filberts...);
 - "precautionary": only in may-contain / shared equipment / same facility statements;
 - "explicit_negative": the text says it is absent ("dairy-free", "does not handle peanuts").
"evidence" MUST be copied word-for-word from the text. Never invent allergens.
Put in "unresolved" any ingredient whose source is not stated (lecithin, emulsifier, natural flavour), missing information, or contradictions.`;

// v2 prompt (Nov 26). Written BEFORE held-out v3 existed. Deliberately contains NO example ingredient words, because
// in B2 the model copied the v1 prompt's examples ("lecithin, emulsifier, natural flavour") into its output.
export const EXTRACT_SYSTEM = `You read ONE food supplier specification and list ingredients that are, or may be made from, a major food allergen: milk, egg, fish, crustacean shellfish, tree nuts, peanut, wheat, soy, sesame.
For each such ingredient give:
- "term": the ingredient name copied exactly from the text;
- "evidence": the shortest exact quote from the text that contains it;
- "assertion": "intentional" if it is in the product, "precautionary" if it is only mentioned in a may-contain, shared-equipment or shared-facility statement, "explicit_negative" if the text says it is absent;
- "allergen_guess": which allergen you think it is, or "unknown" if you are not sure.
Separately, in "absences", list ingredients written in the text whose source or composition is not stated and could hide one of these allergens: "ingredient" and "ingredient_evidence" must be copied exactly from the text; "missing" is "source", "composition" or "allergen_statement".
Only use words that appear in this specification. Copy quotes exactly. If nothing applies, return empty lists.`;

/** User turn sent for one spec. Same string for every transport. */
export const userPrompt = (specText) => `Supplier specification:\n${specText}`;
