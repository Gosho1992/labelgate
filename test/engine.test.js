import { describe, it, expect } from "vitest";
import { dictionaryExtract } from "../src/allergens/dictionary.js";
import { checkLabel } from "../src/allergens/rulepack.js";
import { buildProfile } from "../src/engine/profile.js";
import { evaluate, affectedLabels, signOff } from "../src/engine/gate.js";
import { textDiff, profileDelta } from "../src/engine/diff.js";
import { route, ROUTE, PRIVACY } from "../src/engine/router.js";
import { matchRecall } from "../src/engine/recall.js";
import { STATE } from "../src/schemas.js";
import * as S from "../src/data/sample.js";

// Nano stub that agrees with the dictionary (stands in for a successful on-device call in unit tests).
const nanoAgree = (spec) => {
  const d = dictionaryExtract(spec.id, spec.text);
  return { ingredients: d.claims.map(({ allergen, assertion, evidence }) => ({ term: evidence, evidence, assertion, allergen_guess: allergen })), absences: [] };
};
const profileOf = (spec, nano = nanoAgree(spec), status = "ok") => buildProfile(spec, dictionaryExtract(spec.id, spec.text), nano, { nanoStatus: status });
const allProfiles = () => Object.fromEntries(Object.values(S.specs).map((s) => [s.id, profileOf(s)]));

describe("FALCPA rule pack (corrected Contains logic)", () => {
  it("allergen declared only in ingredient list, no Contains line -> compliant", () => {
    const r = checkLabel({ ingredientStatement: "Flour, butter (milk), sugar.", containsStatement: null }, new Set(["milk"]));
    expect(r.violations).toHaveLength(0);
  });
  it("Contains used but omits an allergen present in ingredients -> R2 violation", () => {
    const r = checkLabel({ ingredientStatement: "Wheat flour, whey (milk).", containsStatement: "Contains: wheat." }, new Set(["wheat", "milk"]));
    expect(r.violations.map((v) => v.rule)).toEqual(["R2"]);
  });
  it("allergen present, not in ingredients, no Contains -> R1 violation", () => {
    const r = checkLabel({ ingredientStatement: "Flour, natural flavour.", containsStatement: null }, new Set(["milk"]));
    expect(r.violations[0].rule).toBe("R1");
  });
  it("gluten in Contains is flagged as not a US major allergen", () => {
    const r = checkLabel({ ingredientStatement: "Barley malt.", containsStatement: "Contains: gluten." }, new Set());
    expect(r.warnings.some((w) => w.rule === "R3")).toBe(true);
  });
});

describe("dictionary baseline", () => {
  it("handles negation and precaution", () => {
    const d = dictionaryExtract("x", "Coating: rice flour, egg white powder. This product is dairy-free and nut-free. May contain traces of soy.");
    const c = d.claims.filter((x) => x.assertion === "intentional").map((x) => x.allergen);
    expect(c).toEqual(["egg"]);
    expect(d.claims.find((x) => x.allergen === "soy").assertion).toBe("precautionary");
  });
  it("cocoa butter is not milk", () => {
    expect(dictionaryExtract("x", "Cocoa butter, sugar.").claims).toHaveLength(0);
  });
});

describe("profile invariants", () => {
  it("Nano ingredient without verbatim span is rejected and logged, and creates no review flag (changed Nov 26)", () => {
    const spec = S.specs["OIL-03@2"];
    const p = profileOf(spec, { ingredients: [{ term: "soybean oil", allergen_guess: "soy", assertion: "intentional", evidence: "soybean oil" }], absences: [] });
    expect(p.contains.has("soy")).toBe(false);
    expect(p.rejected[0].reason).toMatch(/not found/);
    expect(p.unresolved).toEqual([]);
  });
  it("Nano can never remove a dictionary hit", () => {
    const spec = S.specs["FLOUR-02@4"];
    const p = profileOf(spec, { ingredients: [], absences: [] });
    expect(p.contains.has("wheat")).toBe(true);
    expect(p.unresolved.join(" ")).toMatch(/Dictionary found wheat/);
  });
  it("Nano not available -> unresolved (never silently clean)", () => {
    const spec = S.specs["OIL-03@2"];
    const p = buildProfile(spec, dictionaryExtract(spec.id, spec.text), null, { nanoStatus: "unavailable" });
    expect(p.unresolved.length).toBeGreaterThan(0);
  });
});

describe("spec drift -> impact -> gate (demo scenario)", () => {
  const profiles = allProfiles();
  const findings = evaluate({ formulas: S.formulas, labels: S.labels, currentSpecByItem: S.currentSpecByItem, profiles });
  const by = Object.fromEntries(findings.map((f) => [f.labelId, f]));

  it("revision 2 newly contains milk", () => {
    const delta = profileDelta(profiles["SEAS-01@1"], profiles["SEAS-01@2"]);
    expect(delta.newlyContains).toEqual(["milk"]);
    expect(textDiff(S.specs["SEAS-01@1"].text, S.specs["SEAS-01@2"].text).added.join(" ")).toMatch(/milk-derived carrier/);
  });
  it("three labels depend on the changed seasoning", () => {
    expect(affectedLabels("SEAS-01", S.formulas, S.labels).map((l) => l.sku)).toEqual(["SKU-1001", "SKU-1002", "SKU-1003"]);
  });
  it("Contains statement missing milk -> PRINT BLOCKED", () => {
    expect(by["LBL-1001@3"].state).toBe(STATE.BLOCKED);
    expect(by["LBL-1001@3"].approvalInvalidated).toBe(true);
  });
  it("milk declared in ingredient list (no Contains) -> not blocked, but old sign-off invalid -> NEEDS REVIEW", () => {
    expect(by["LBL-1002@2"].state).toBe(STATE.REVIEW);
    expect(by["LBL-1002@2"].reasons.join(" ")).toMatch(/older supplier spec/);
  });
  it("milk not declared anywhere -> PRINT BLOCKED", () => {
    expect(by["LBL-1003@1"].state).toBe(STATE.BLOCKED);
  });
  it("unaffected label stays reviewable but not blocked", () => {
    expect(by["LBL-1004@5"].state).not.toBe(STATE.BLOCKED);
  });
  it("PASS is impossible while anything is unresolved", () => {
    const p2 = { ...profiles, "OIL-03@2": { ...profiles["OIL-03@2"], unresolved: ["x"] } };
    const f = evaluate({ formulas: S.formulas, labels: S.labels, currentSpecByItem: S.currentSpecByItem, profiles: p2 });
    for (const x of f.filter((y) => S.formulas.find((ff) => ff.sku === y.sku).lines.some((l) => l.itemId === "OIL-03"))) {
      expect(x.state).not.toBe(STATE.PASS);
    }
  });
  it("sign-off refused on a blocked label", () => {
    const f = by["LBL-1001@3"];
    expect(() => signOff(S.labels[0], f, S.formulas[0], S.currentSpecByItem, "qa")).toThrow();
  });
});

describe("router hard constraints", () => {
  it("private content never goes to cloud", () => {
    expect(route({ task: "extract_spec", privacy: PRIVACY.PRIVATE }, { nanoAvailable: true, online: true }).route).toBe(ROUTE.ON_DEVICE);
    const r = route({ task: "extract_spec", privacy: PRIVACY.PRIVATE }, { nanoAvailable: false, online: true });
    expect(r.route).toBe(ROUTE.LOCAL_RULES);
    expect(r.degraded).toBe(true);
  });
  it("public recall parsing may use cloud; offline removes it", () => {
    expect(route({ task: "parse_recall", privacy: PRIVACY.PUBLIC }, { nanoAvailable: true, online: true }).candidates.map((c) => c.route)).toContain(ROUTE.CLOUD);
    expect(route({ task: "parse_recall", privacy: PRIVACY.PUBLIC }, { nanoAvailable: true, online: false }).route).toBe(ROUTE.ON_DEVICE);
  });
});

describe("public -> private recall matching", () => {
  it("matches parsed public recall terms against private specs locally", () => {
    const terms = { product: "Savory Seasoning Blend SB-200", firm: "Northfield Flavor Co.", ingredientTerms: ["Savory Seasoning Blend SB-200"], allergens: ["milk"], lots: ["2611A"] };
    const current = Object.values(S.specs).filter((s) => S.currentSpecByItem[s.itemId] === s.id);
    const m = matchRecall(terms, current, S.formulas);
    expect(m.hits[0].confidence).toBe("strong");
    expect(m.skus).toEqual(["SKU-1001", "SKU-1002", "SKU-1003"]);
  });
});
