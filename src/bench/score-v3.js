// v3 scoring: ingredient IDENTIFICATION scored separately from allergen CLASSIFICATION.
// Gold ingredient span = every occurrence of the gold term in the text, extended over an immediately following
// "( ... )" or "[ ... ]" (e.g. "Surimi (Alaska pollock, ...)"). A finding identifies a gold ingredient if their spans overlap.
// Findings per arm: rules = dictionary spans; nano = Nano ingredients (+ absences); hybrid = dictionary spans + Nano
// UNKNOWN ingredients + absences. Per identified gold ingredient the classification outcome is:
//   correct        an asserted allergen equals gold (rules/hybrid: dictionary or reviewer; nano arm: the model GUESS)
//   wrong_category an asserted allergen exists but none equals gold
//   unknown        identified, allergen left UNKNOWN for a human (hybrid's intended behaviour for Nano-only finds)
const overlap = (a, b) => a.start < b.end && b.start < a.end;

function goldSpans(text, term) {
  const out = [];
  const low = text.toLowerCase(), t = term.toLowerCase();
  for (let i = low.indexOf(t); i >= 0; i = low.indexOf(t, i + 1)) {
    let end = i + t.length;
    const m = text.slice(end).match(/^\s*[([][^)\]]*[)\]]/);
    if (m) end += m[0].length;
    out.push({ start: i, end });
  }
  return out;
}

function findings(p, arm) {
  const dict = (p.dictSpans || []).map((d) => ({ ...d, kind: "dict", asserted: d.allergen }));
  const nano = (p.possible || []).map((x) => ({ ...x, kind: "nano", asserted: arm === "nano" ? (x.modelGuess !== "unknown" ? x.modelGuess : null) : null }));
  const abs = (p.absences || []).filter((a) => a.start != null).map((a) => ({ ...a, kind: "absence", asserted: null }));
  if (arm === "rules") return dict;
  if (arm === "nano") return [...nano, ...abs];
  return [...dict, ...nano, ...abs];
}

export function scoreV3(rows, arm) {
  const m = { runs: rows.length, idTP: 0, idGold: 0, findTotal: 0, findMatched: 0, correct: 0, wrong: 0, unknown: 0, notIdentified: 0,
    ambiguousFlagged: 0, ambiguousOverclaimed: 0, ambiguousTotal: 0, confirmedTotal: 0, confirmedCorrect: 0, fpAllergens: 0,
    silentMisses: 0, reviewFlags: 0, unsupportedEvidence: 0, unsupportedAbsence: 0, wrongDetails: [], silentIds: [], fpIds: [] };
  for (const r of rows) {
    const p = r[arm], c = r.case, text = c.text;
    const F = findings(p, arm);
    m.findTotal += F.length;
    const golds = c.ingredients.map((g) => ({ ...g, spans: goldSpans(text, g.term) }));
    for (const f of F) if (golds.some((g) => g.spans.some((s) => overlap(s, f)))) m.findMatched++;
    // identification + classification per gold ingredient
    for (const g of golds) {
      const hit = F.filter((f) => g.spans.some((s) => overlap(s, f)));
      if (g.allergen === "ambiguous") {
        m.ambiguousTotal++;
        const asserted = hit.filter((f) => f.asserted);
        if (asserted.length) m.ambiguousOverclaimed++;
        else if (hit.length || p.review) m.ambiguousFlagged++;
        continue;
      }
      m.idGold++;
      if (!hit.length) { m.notIdentified++; continue; }
      m.idTP++;
      const asserted = [...new Set(hit.map((f) => f.asserted).filter(Boolean))];
      if (asserted.includes(g.allergen)) m.correct++;
      else if (asserted.length) { m.wrong++; m.wrongDetails.push(`${c.id}${r.rep ? "#" + (r.rep + 1) : ""}: "${g.term}" gold ${g.allergen}, said ${asserted.join("/")}`); }
      else m.unknown++;
    }
    // allergen-level (case) metrics on CONFIRMED allergens (nano arm: guesses)
    const goldAllergens = new Set(c.ingredients.filter((i) => i.allergen !== "ambiguous").map((i) => i.allergen));
    const confirmed = arm === "nano" ? new Set(F.filter((f) => f.asserted && f.assertion !== "precautionary").map((f) => f.asserted)) : new Set(p.contains);
    m.confirmedTotal += confirmed.size;
    for (const a of confirmed) { if (goldAllergens.has(a)) m.confirmedCorrect++; else { m.fpAllergens++; m.fpIds.push(`${c.id}:${a}`); } }
    const missed = [...goldAllergens].filter((a) => !confirmed.has(a));
    if (p.review) m.reviewFlags++;
    if (missed.length && !p.review) { m.silentMisses++; m.silentIds.push(c.id); }
    m.unsupportedEvidence += (p.unsupported || []).length;
    m.unsupportedAbsence += (p.unsupportedAbsences || []).length;
  }
  const r3 = (x) => (Number.isFinite(x) ? +x.toFixed(3) : null);
  return {
    runs: m.runs,
    identification: { precision: r3(m.findMatched / m.findTotal), recall: r3(m.idTP / m.idGold), found: `${m.idTP}/${m.idGold}`, findings: m.findTotal },
    classification: { accuracy: r3(m.correct / m.idGold), correct: m.correct, wrongCategory: m.wrong, leftUnknownForHuman: m.unknown, notIdentified: m.notIdentified, precisionOfConfirmed: r3(m.confirmedCorrect / m.confirmedTotal), wrongDetails: m.wrongDetails },
    ambiguous: { total: m.ambiguousTotal, flaggedForHuman: m.ambiguousFlagged, overclaimed: m.ambiguousOverclaimed },
    falsePositiveAllergens: m.fpAllergens, fpIds: m.fpIds, silentMisses: m.silentMisses, silentIds: m.silentIds,
    reviewRate: r3(m.reviewFlags / m.runs), unsupportedEvidence: m.unsupportedEvidence, unsupportedAbsence: m.unsupportedAbsence,
  };
}

/** Stability across repeats: share of unique cases whose prediction is identical in every repeat. */
export function stability(rows, arm) {
  const by = {};
  for (const r of rows) (by[r.case.id] ||= []).push(JSON.stringify([r[arm].contains, r[arm].possible.map((p) => [p.term, p.modelGuess]), r[arm].review]));
  const ids = Object.keys(by);
  return `${ids.filter((k) => new Set(by[k]).size === 1).length}/${ids.length} cases identical across repeats`;
}
