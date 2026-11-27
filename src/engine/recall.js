// Public -> private recall matching. The cloud model parses a PUBLIC recall notice into terms
// (see ai/cloud.js). Matching against PRIVATE formulas/specs happens here, locally.

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * @param {import("../schemas.js").RecallTerms} terms
 * @param {import("../schemas.js").SupplierSpecRevision[]} specs   current revisions
 * @param {import("../schemas.js").Formula[]} formulas
 */
export function matchRecall(terms, specs, formulas) {
  const hits = [];
  for (const spec of specs) {
    const hay = norm(`${spec.supplier} ${spec.text}`);
    const matched = terms.ingredientTerms.filter((t) => t && hay.includes(norm(t)));
    const firmMatch = terms.firm && hay.includes(norm(terms.firm));
    if (matched.length && firmMatch) hits.push({ itemId: spec.itemId, specId: spec.id, matched, confidence: "strong" });
    else if (matched.length) hits.push({ itemId: spec.itemId, specId: spec.id, matched, confidence: "weak" });
  }
  const skus = formulas.filter((f) => f.lines.some((l) => hits.some((h) => h.itemId === l.itemId))).map((f) => f.sku);
  return { hits, skus };
}
