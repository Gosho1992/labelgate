// Versioned allergen synonym dictionary (deterministic baseline).
// It is intentionally incomplete: real supplier vocabulary is long-tailed. Nano covers
// unfamiliar wording; the dictionary covers known terms and can never be overruled by Nano.
import { ALLERGENS, ASSERTION } from "../schemas.js";

// FROZEN BASELINE (Nov 25, 2026). Do not add terms from any held-out set. test/frozen.test.js checks its hash.
export const DICTIONARY_VERSION = "2026.11.26-1"; // 2026.11.25-1 + three look-alike exclusions (approved Nov 26)

export const DICT = {
  milk: ["milk", "butter", "buttermilk", "whey", "casein", "caseinate", "cheese", "cream", "lactose", "ghee", "yogurt", "yoghurt", "dairy", "curd", "lactalbumin", "lactoglobulin"],
  egg: ["egg", "eggs", "albumen", "albumin", "ovalbumin", "lysozyme", "mayonnaise", "yolk"],
  fish: ["fish", "cod", "salmon", "tuna", "anchovy", "anchovies", "haddock", "pollock", "surimi", "bonito"],
  shellfish: ["shrimp", "prawn", "prawns", "crab", "lobster", "crayfish", "shellfish", "crustacean"],
  treenut: ["almond", "almonds", "cashew", "cashews", "walnut", "walnuts", "hazelnut", "hazelnuts", "filbert", "filberts", "pecan", "pecans", "pistachio", "pistachios", "macadamia", "pine nut", "pine nuts", "brazil nut", "tree nut", "tree nuts", "marzipan"],
  peanut: ["peanut", "peanuts", "groundnut", "groundnuts", "arachis"],
  wheat: ["wheat", "spelt", "semolina", "durum", "farina", "bulgur", "seitan", "kamut", "triticum"],
  soy: ["soy", "soya", "soybean", "soybeans", "tofu", "edamame", "tamari", "miso"],
  sesame: ["sesame", "tahini", "benne"],
};

// Words that contain an allergen word but are not that allergen.
const EXCLUDE = /(cocoa butter|shea butter|nutmeg|butternut|coconut|peanut-free|buckwheat)/gi;
// Narrow look-alike exclusions (approved Nov 26, from v2 false positives). Each blanks ONLY the trigger word inside
// the phrase, so other words in the phrase (e.g. "sesame" in "sesame seed butter") and the same allergen named
// elsewhere in the spec still match.
export const LOOKALIKES = [
  { id: "coconut-milk", re: /(?<=\bcoconut\s+)milk\b/gi, note: "coconut milk is not dairy milk" },
  { id: "cream-of-tartar", re: /\bcream(?=\s+of\s+tartar\b)/gi, note: "cream of tartar (potassium bitartrate) is not dairy cream" },
  { id: "seed-butter", re: /(?<=\bseed\s+)butter\b/gi, note: "a seed butter (e.g. sunflower seed butter) is not dairy butter" },
];
// "-free", "free from X", "does not contain/handle X", "no X" remove the term from that sentence.
const NEGATION = /(\b[\w-]+-free\b|\bfree (from|of) [\w ,]+|\bdoes not (handle|contain) [\w ,]+|\bno [\w]+)/gi;
const PRECAUTION = /(may contain|traces? of|shared equipment|same equipment|facility that also|produced in a facility|processed in a facility|line also runs|equipment that also)/i;
// Terms whose allergen source is commonly unspecified; resolved only if a source is named nearby.
const AMBIGUOUS = /(?<!(soy|soya|sunflower)\s)\b(lecithin|natural (and artificial )?flavou?rs?|emulsifier|flavou?ring)\b(?!\s*\((milk|soy|source|contains))/i;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");

/**
 * Deterministic extraction.
 * @param {string} specId
 * @param {string} text
 * @returns {{claims: import("../schemas.js").Claim[], unresolved: string[]}}
 */
export function dictionaryExtract(specId, text) {
  const claims = [];
  const unresolved = [];
  let offset = 0;
  for (const sentence of text.split(/(?<=[.!?;])\s+/)) {
    const start = text.indexOf(sentence, offset);
    offset = start + sentence.length;
    const precautionary = PRECAUTION.test(sentence);
    let cleaned = sentence;
    for (const l of LOOKALIKES) cleaned = cleaned.replace(l.re, (m) => " ".repeat(m.length)); // before EXCLUDE blanks "coconut"
    cleaned = cleaned.replace(EXCLUDE, (m) => " ".repeat(m.length)).replace(NEGATION, (m) => " ".repeat(m.length));
    for (const allergen of ALLERGENS) {
      for (const word of DICT[allergen]) {
        const m = cleaned.match(new RegExp(`\\b${esc(word)}\\b`, "i"));
        if (m) {
          claims.push({
            specId, allergen,
            assertion: precautionary ? ASSERTION.PRECAUTIONARY : ASSERTION.INTENTIONAL,
            evidence: sentence.slice(m.index, m.index + m[0].length),
            start: start + m.index,
            source: "dictionary", status: "verified",
          });
          break;
        }
      }
    }
  }
  if (AMBIGUOUS.test(text)) unresolved.push("Ingredient with unspecified source (e.g. lecithin / natural flavour / emulsifier)");
  if (/allergen (statement|information)\s*:\s*(none|see page)/i.test(text)) unresolved.push("Spec has an allergen statement that must be cross-checked against the ingredient list");
  return { claims, unresolved };
}
