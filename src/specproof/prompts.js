// Spec-to-Proof feasibility test (specproof-v1). FROZEN before any model run on the 20 evaluation images.
// Nano's ONLY job here: transcribe what is printed in an image. It never decides allergens or compliance.
export const SPECPROOF_PROMPT_VERSION = "specproof-prompt-1 (2026-11-26)";

export const SPEC_PROMPT = `This image is part of a food supplier's product specification sheet. It may be in English, Spanish or Japanese.
Transcribe it. Do not guess, do not add anything that is not printed.
- legible: false if you cannot read the ingredient section reliably.
- language: "en", "es" or "ja".
- ingredients: every ingredient exactly as printed (same language, same spelling), in order, each with a plain English translation.
- allergen_statement_printed: the allergen statement line exactly as printed, or null if there is none.
Return only the JSON.`;

export const LABEL_PROMPT = `This image is a US retail food label. Transcribe it exactly as printed. Do not guess, do not correct, do not add anything.
- legible: false if you cannot read the ingredient list reliably.
- ingredient_list_printed: the full ingredient list exactly as printed, starting with "INGREDIENTS:".
- contains_printed: the "Contains:" line exactly as printed, or null if the label has no Contains line.
Return only the JSON.`;

export const SPEC_SCHEMA = {
  type: "object",
  properties: {
    legible: { type: "boolean" },
    language: { type: "string", enum: ["en", "es", "ja"] },
    ingredients: {
      type: "array",
      items: { type: "object", properties: { printed: { type: "string" }, english: { type: "string" } }, required: ["printed", "english"] },
    },
    allergen_statement_printed: { type: ["string", "null"] },
  },
  required: ["legible", "language", "ingredients", "allergen_statement_printed"],
};

export const LABEL_SCHEMA = {
  type: "object",
  properties: {
    legible: { type: "boolean" },
    ingredient_list_printed: { type: "string" },
    contains_printed: { type: ["string", "null"] },
  },
  required: ["legible", "ingredient_list_printed", "contains_printed"],
};
