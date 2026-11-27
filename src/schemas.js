// LabelGate data model.
// Everything in this file describes PRIVATE data unless marked PUBLIC.
// Private data never leaves the device (see engine/router.js hard constraints).

export const ALLERGENS = /** @type {const} */ ([
  "milk", "egg", "fish", "shellfish", "treenut", "peanut", "wheat", "soy", "sesame",
]); // US FALCPA + FASTER Act "major food allergens" (9). Keys used everywhere.

export const ALLERGEN_LABEL_NAME = {
  milk: "milk", egg: "egg", fish: "fish", shellfish: "shellfish", treenut: "tree nuts",
  peanut: "peanuts", wheat: "wheat", soy: "soy", sesame: "sesame",
};

/** Assertion types a claim can carry (from Astra review: keep polarity explicit). */
export const ASSERTION = { INTENTIONAL: "intentional", PRECAUTIONARY: "precautionary", NEGATIVE: "explicit_negative", UNKNOWN: "unknown" };

/** Release states (deterministic; see engine/gate.js). */
export const STATE = {
  BLOCKED: "PRINT_BLOCKED",
  REVIEW: "NEEDS_REVIEW",
  CLEAR: "CHECKS_CLEAR_AWAITING_SIGNOFF",
  PASS: "PASS_SIGNED_FOR_THIS_PROOF",
};

/**
 * @typedef {Object} SupplierSpecRevision   PRIVATE
 * @property {string} id            e.g. "SPEC-SEAS-01@2"
 * @property {string} itemId        supplier item, e.g. "SEAS-01"
 * @property {string} supplier
 * @property {number} revision
 * @property {string} effectiveDate ISO date
 * @property {string} text          full spec text (local only)
 * @property {string} sha256        content hash (cache key, audit)
 *
 * @typedef {Object} FormulaLine           PRIVATE
 * @property {string} itemId        supplier item used
 * @property {number} pct           % of formula (never sent anywhere)
 *
 * @typedef {Object} Formula               PRIVATE
 * @property {string} sku
 * @property {string} name
 * @property {number} revision
 * @property {FormulaLine[]} lines
 *
 * @typedef {Object} LabelProof            PRIVATE until printed (text becomes public after print)
 * @property {string} id            e.g. "LBL-1001@3"
 * @property {string} sku
 * @property {string} ingredientStatement
 * @property {string|null} containsStatement   null = no Contains line
 * @property {string|null} precautionaryStatement
 * @property {Approval|null} approval
 *
 * @typedef {Object} Approval
 * @property {string} by
 * @property {string} at
 * @property {Object<string,string>} basedOn   itemId -> spec revision id used when signed
 *
 * @typedef {Object} Claim                 output of extraction (dictionary or Nano)
 * @property {string} specId
 * @property {string} allergen      one of ALLERGENS
 * @property {string} assertion     one of ASSERTION
 * @property {string} evidence      exact quote from spec text
 * @property {number} start         offset of evidence in spec text (-1 if not found)
 * @property {"dictionary"|"nano"|"cloud"} source
 * @property {"verified"|"rejected"} status    rejected = span not found -> becomes unresolved
 *
 * @typedef {Object} SpecProfile           resolved allergen profile of one spec revision
 * @property {string} specId
 * @property {Set<string>} contains
 * @property {Set<string>} mayContain
 * @property {string[]} unresolved  human-readable reasons; non-empty => NEEDS_REVIEW downstream
 * @property {Claim[]} claims
 *
 * @typedef {Object} Finding               one result per label proof
 * @property {string} labelId
 * @property {string} sku
 * @property {string} state         one of STATE
 * @property {string[]} reasons
 * @property {Object[]} paths       dependency path: spec -> item -> formula -> label, with evidence
 * @property {string[]} unknowns
 * @property {boolean} approvalInvalidated
 *
 * @typedef {Object} RecallNotice          PUBLIC (parsed in cloud)
 * @property {string} id
 * @property {string} text          public notice text
 *
 * @typedef {Object} RecallTerms           PUBLIC, structured by cloud model
 * @property {string} product
 * @property {string} firm
 * @property {string[]} ingredientTerms
 * @property {string[]} allergens
 * @property {string[]} lots
 */

// JSON schema for the on-device (Nano) extraction. Kept small: enums + short strings.
export const SCHEMA_VERSION = "discovery-v2";

/** v1 (used for go/no-go v1 and B2). Kept for history; not used by the pipeline any more. */
export const NANO_EXTRACTION_SCHEMA_V1 = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          allergen: { type: "string", enum: [...ALLERGENS] },
          assertion: { type: "string", enum: ["intentional", "precautionary", "explicit_negative"] },
          evidence: { type: "string" },
        },
        required: ["allergen", "assertion", "evidence"],
      },
    },
    unresolved: { type: "array", items: { type: "string" } },
  },
  required: ["claims", "unresolved"],
};

// JSON schema for the cloud recall-notice parser (PUBLIC input only).
export const RECALL_SCHEMA = {
  type: "object",
  properties: {
    product: { type: "string" },
    firm: { type: "string" },
    ingredientTerms: { type: "array", items: { type: "string" } },
    allergens: { type: "array", items: { type: "string", enum: [...ALLERGENS] } },
    lots: { type: "array", items: { type: "string" } },
  },
  required: ["product", "firm", "ingredientTerms", "allergens", "lots"],
};

/**
 * v2 (Nov 26): Nano is an INGREDIENT-DISCOVERY assistant, not an allergen classifier.
 * ingredients[]: an ingredient that is, or may be derived from, a major allergen; allergen_guess is stored only as an
 *   unreliable model guess and is never treated as confirmed.
 * absences[]: missing information about an ingredient that is itself quoted from the text (structured, never free text).
 */
export const NANO_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          evidence: { type: "string" },
          assertion: { type: "string", enum: ["intentional", "precautionary", "explicit_negative"] },
          allergen_guess: { type: "string", enum: [...ALLERGENS, "unknown"] },
        },
        required: ["term", "evidence", "assertion", "allergen_guess"],
      },
    },
    absences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ingredient: { type: "string" },
          missing: { type: "string", enum: ["source", "composition", "allergen_statement"] },
          ingredient_evidence: { type: "string" },
        },
        required: ["ingredient", "missing", "ingredient_evidence"],
      },
    },
  },
  required: ["ingredients", "absences"],
};
