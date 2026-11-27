// Deterministic release gate: dependency paths + label rules + approval validity -> one Finding per label.
// Central invariant: PASS is only possible when every formula line resolves to a current, fully resolved
// spec profile, every present allergen is declared, and a human signed THIS proof against THESE spec revisions.
import { STATE } from "../schemas.js";
import { checkLabel } from "../allergens/rulepack.js";
import { applyDeterminations } from "./profile.js";

/**
 * @param {Object} ctx
 * @param {import("../schemas.js").Formula[]} ctx.formulas
 * @param {import("../schemas.js").LabelProof[]} ctx.labels
 * @param {Object<string,string>} ctx.currentSpecByItem       itemId -> current spec revision id
 * @param {Object<string,import("../schemas.js").SpecProfile>} ctx.profiles   specId -> profile
 * @returns {import("../schemas.js").Finding[]}
 */
export function evaluate({ formulas, labels, currentSpecByItem, profiles, determinations = {} }) {
  const findings = [];
  for (const label of labels) {
    const formula = formulas.find((f) => f.sku === label.sku);
    const reasons = [];
    const unknowns = [];
    const paths = [];
    const needsId = []; // Nano-found ingredients whose allergen a human must determine
    const present = new Set();
    if (!formula) {
      findings.push({ labelId: label.id, sku: label.sku, state: STATE.REVIEW, reasons: ["No formula linked to this label"], paths, unknowns: ["formula"], needsId, approvalInvalidated: false });
      continue;
    }
    for (const line of formula.lines) {
      const specId = currentSpecByItem[line.itemId];
      const profile = specId && profiles[specId] ? applyDeterminations(profiles[specId], determinations) : undefined;
      if (!profile) { unknowns.push(`No processed spec for ${line.itemId}`); continue; }
      for (const a of profile.contains) {
        present.add(a);
        const ev = profile.claims.find((c) => c.allergen === a && c.status === "verified" && c.assertion === "intentional");
        paths.push({ allergen: a, itemId: line.itemId, specId, evidence: ev?.evidence, source: ev?.source });
      }
      for (const u of profile.unresolved) unknowns.push(`${line.itemId}: ${u}`);
      for (const p of profile.possible || []) needsId.push({ itemId: line.itemId, ...p });
    }
    const { violations, warnings } = checkLabel(label, present);
    for (const v of violations) reasons.push(`${v.rule}: ${v.detail}`);
    for (const w of warnings) unknowns.push(`${w.rule}: ${w.detail}`);

    // Approval is valid only if it was signed against the CURRENT spec revision of every line.
    let approvalInvalidated = false;
    if (label.approval) {
      for (const line of formula.lines) {
        if (label.approval.basedOn[line.itemId] !== currentSpecByItem[line.itemId]) approvalInvalidated = true;
      }
      if (approvalInvalidated) reasons.push("Earlier sign-off was based on an older supplier spec revision");
    }

    let state;
    if (violations.length) state = STATE.BLOCKED;
    else if (unknowns.length || approvalInvalidated) state = STATE.REVIEW;
    else if (label.approval) state = STATE.PASS;
    else state = STATE.CLEAR;
    findings.push({ labelId: label.id, sku: label.sku, state, reasons, paths, unknowns, needsId, approvalInvalidated });
  }
  return findings;
}

/** Labels affected by a change to one supplier item (dependency lookup). */
export function affectedLabels(itemId, formulas, labels) {
  const skus = new Set(formulas.filter((f) => f.lines.some((l) => l.itemId === itemId)).map((f) => f.sku));
  return labels.filter((l) => skus.has(l.sku));
}

/** Human sign-off: only allowed from CHECKS_CLEAR. Binds the approval to current spec revisions. */
export function signOff(label, finding, formula, currentSpecByItem, by, at = new Date().toISOString()) {
  if (finding.state !== STATE.CLEAR && !(finding.state === STATE.REVIEW && finding.unknowns.length === 0 && finding.approvalInvalidated)) {
    throw new Error(`Sign-off not allowed in state ${finding.state}`);
  }
  const basedOn = Object.fromEntries(formula.lines.map((l) => [l.itemId, currentSpecByItem[l.itemId]]));
  return { ...label, approval: { by, at, basedOn } };
}
