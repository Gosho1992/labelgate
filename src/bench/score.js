// Scoring for the app-pipeline benchmark. Pure functions; used in the browser runner and in Node.
// Definitions (same as go/no-go v1 so the numbers are comparable):
//  precision/recall  over "contains" allergens (micro-averaged)
//  missed            gold "contains" allergens not predicted
//  silentMisses      cases with >=1 missed allergen AND no review flag (the dangerous outcome)
//  falsePositives    predicted "contains" allergens not in gold
//  reviewRate        cases flagged for human review / cases
//  reviewRecall      gold-review cases that were flagged
//  unsupported       model claims rejected by the evidence-span check
export function toPrediction(profile) {
  return {
    contains: [...profile.contains].sort(),
    may: [...profile.mayContain].sort(),
    review: profile.unresolved.length > 0,
    unresolved: profile.unresolved,
    unsupported: (profile.rejected || []).filter((r) => r.kind === "ingredient").map((r) => `"${r.evidence}"`),
    unsupportedAbsences: (profile.rejected || []).filter((r) => r.kind === "absence").map((r) => `"${r.evidence}"`),
    possible: (profile.possible || []).map((p) => ({ term: p.term, evidence: p.evidence, assertion: p.assertion, modelGuess: p.modelGuess, start: p.start, end: p.end })),
    absences: (profile.absences || []).map((a) => ({ ingredient: a.ingredient, missing: a.missing, start: a.start, end: a.end })),
    dictSpans: profile.claims.filter((c) => c.source === "dictionary").map((c) => ({ allergen: c.allergen, assertion: c.assertion, evidence: c.evidence, start: c.start, end: c.start + c.evidence.length })),
    evidence: profile.claims.filter((c) => c.status === "verified").map((c) => `${c.source}:${c.allergen}:${c.assertion}:"${c.evidence}"`),
  };
}

export function score(rows, arm) {
  let tp = 0, fp = 0, fn = 0, silent = 0, flagged = 0, goldReview = 0, goldReviewHit = 0, unsupported = 0, mayOk = 0, exact = 0;
  const silentIds = [], fpIds = [];
  for (const r of rows) {
    const p = r[arm]; if (!p) continue;
    const G = new Set(r.case.gold.contains), P = new Set(p.contains);
    const ctp = [...P].filter((a) => G.has(a)).length, cfp = P.size - ctp, cfn = [...G].filter((a) => !P.has(a)).length;
    tp += ctp; fp += cfp; fn += cfn;
    if (cfp) fpIds.push(r.case.id);
    if (cfn && !p.review) { silent++; silentIds.push(r.case.id); }
    if (p.review) flagged++;
    if (r.case.gold.review) { goldReview++; if (p.review) goldReviewHit++; }
    unsupported += p.unsupported.length;
    if (JSON.stringify(p.may) === JSON.stringify([...r.case.gold.may].sort())) mayOk++;
    if (!cfp && !cfn) exact++;
  }
  const n = rows.length;
  return {
    n, precision: tp + fp ? +(tp / (tp + fp)).toFixed(3) : null, recall: tp + fn ? +(tp / (tp + fn)).toFixed(3) : null,
    missed: fn, silentMisses: silent, silentIds, falsePositives: fp, fpIds, reviewRate: +(flagged / n).toFixed(2), reviewFlags: flagged,
    reviewRecall: `${goldReviewHit}/${goldReview}`, unsupportedClaims: unsupported, precautionaryCorrect: `${mayOk}/${n}`, containsExact: `${exact}/${n}`,
  };
}

export function latency(rows) {
  const v = rows.map((r) => r.ms).filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  const q = (p) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
  return { n: v.length, p50: q(0.5), p90: q(0.9), max: v[v.length - 1], mean: Math.round(v.reduce((a, b) => a + b, 0) / v.length) };
}
