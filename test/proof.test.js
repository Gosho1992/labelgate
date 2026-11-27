// Spec-to-Proof safety gates. All examples here are DEV examples written for these tests,
// NOT taken from the locked specproof-v1 evaluation set.
import { describe, it, expect } from "vitest";
import { checkSpecReading, checkLabelReading, compare, findContainsLines, stripListNumber, isPlaceholder, STATE, ISSUE, blocking } from "../src/proof/rules.js";

const spec = (ingredients, extra = {}) => ({ ingredients, allergen_statement_printed: null, confirmed: true, ...extra });
const label = (ing, contains = null, extra = {}) => ({ ingredient_list_printed: ing, contains_printed: contains, precautionary_printed: null, confirmed: true, ...extra });

describe("transcription hygiene", () => {
  it("strips printed list numbers but keeps ingredient names that start with digits", () => {
    expect(stripListNumber("1. Harina de arroz")).toBe("Harina de arroz");
    expect(stripListNumber("(2) Butter")).toBe("Butter");
    expect(stripListNumber("3) Leche en polvo")).toBe("Leche en polvo");
    expect(stripListNumber("2% milk")).toBe("2% milk");
    expect(stripListNumber("100% cocoa")).toBe("100% cocoa");
  });
  it("rejects placeholders (none / N/A / 該当なし / ninguno) and reports them", () => {
    for (const p of ["該当なし", "N/A", "none", "Ninguno", "なし"]) expect(isPlaceholder(p)).toBe(true);
    const r = checkSpecReading({ full_text: "原材料 米, 大豆", ingredients: [{ printed: "米", english: "rice" }, { printed: "大豆", english: "soybeans" }, { printed: "該当なし", english: "none" }] });
    expect(r.ingredients.map((i) => i.printed)).toEqual(["米", "大豆"]);
    expect(r.issues.some((i) => i.kind === ISSUE.PLACEHOLDER)).toBe(true);
  });
  it("flags an extracted ingredient that is not in the full reading", () => {
    const r = checkSpecReading({ full_text: "Ingredientes: harina de avena, sal", ingredients: [{ printed: "harina de avena", english: "oat flour" }, { printed: "leche", english: "milk" }] });
    expect(r.issues.find((i) => i.kind === ISSUE.NOT_IN_TEXT).text).toBe("leche");
    expect(blocking(r.issues).length).toBe(1);
  });
  it("empty reading -> issue", () => {
    expect(checkSpecReading({ full_text: "", ingredients: [] }).issues[0].kind).toBe(ISSUE.EMPTY);
  });
});

describe("Contains statement located by rule, not trusted from the model field", () => {
  it("moves a Contains line that the model put inside the ingredient field (L07-type) and flags it", () => {
    const r = checkLabelReading({ full_text: "INGREDIENTS: RICE, CHEESE (MILK), SOY OIL\nContains: Milk", ingredient_list_printed: "INGREDIENTS: RICE, CHEESE (MILK), SOY OIL\nContains: Milk", contains_printed: null });
    expect(r.contains_printed).toMatch(/Contains: Milk/);
    expect(r.ingredient_list_printed).not.toMatch(/Contains/);
    expect(r.issues.some((i) => i.kind === ISSUE.CONTAINS_CONFLICT)).toBe(true);
  });
  it("finds a Contains line present in the full reading but missing from the field", () => {
    const r = checkLabelReading({ full_text: "INGREDIENTS: OATS, SUGAR, WHEY (MILK).\nCONTAINS: MILK, WHEAT", ingredient_list_printed: "INGREDIENTS: OATS, SUGAR, WHEY (MILK)", contains_printed: null });
    expect(r.contains_printed).toMatch(/MILK, WHEAT/i);
    expect(r.issues[0].kind).toBe(ISSUE.CONTAINS_CONFLICT);
  });
  it("handles a Contains line split over two lines", () => {
    expect(findContainsLines("Ingredients: x.\nContains: Milk, Soy,\nWheat")[0].body).toMatch(/Milk, Soy, Wheat/);
  });
  it("does not treat 'May contain:' as a Contains statement", () => {
    expect(findContainsLines("INGREDIENTS: OATS.\nMay contain: peanuts")).toEqual([]);
  });
  it("moves a 'May contain' line out of the ingredient field so it cannot count as a declaration", () => {
    const r = checkLabelReading({ ingredient_list_printed: "INGREDIENTS: CHICKPEAS, OIL, SALT.\nMAY CONTAIN SESAME.", contains_printed: null });
    expect(r.ingredient_list_printed).not.toMatch(/SESAME/);
    expect(r.precautionary_printed).toMatch(/MAY CONTAIN SESAME/);
    const c = compare({ spec: spec([{ printed: "tahini", english: "sesame paste" }]), label: { ...r, confirmed: true } });
    expect(c.state).toBe(STATE.BLOCK);
  });
  it("flags a Contains field that disagrees with the full reading", () => {
    const r = checkLabelReading({ full_text: "INGREDIENTS: A, B. Contains: Milk, Soy", ingredient_list_printed: "INGREDIENTS: A, B", contains_printed: "Contains: Milk" });
    expect(r.issues.some((i) => i.kind === ISSUE.CONTAINS_CONFLICT)).toBe(true);
  });
});

describe("comparison (simplified US FDA prototype rule)", () => {
  it("blocks when the supplier spec has milk and the label never names milk", () => {
    const r = compare({ spec: spec([{ printed: "aroma natural (contiene un portador derivado de la leche)", english: "natural flavour (contains a milk-derived carrier)" }]), label: label("INGREDIENTS: SALT, SPICES, NATURAL FLAVOR") });
    expect(r.state).toBe(STATE.BLOCK);
    expect(r.findings[0]).toMatchObject({ allergen: "milk", status: "missing" });
  });
  it("a Contains line is not mandatory: parenthetical / common-name disclosure clears (awaiting sign-off)", () => {
    const r = compare({ spec: spec([{ printed: "suero de leche", english: "whey" }, { printed: "lecitina de soja", english: "soy lecithin" }]), label: label("INGREDIENTS: SUGAR, WHEY (MILK), LECITHIN (SOY)") });
    expect(r.state).toBe(STATE.CLEAR);
  });
  it("buttermilk names milk -> disclosed", () => {
    expect(compare({ spec: spec([{ printed: "buttermilk powder", english: "buttermilk powder" }]), label: label("INGREDIENTS: CORN, BUTTERMILK, SALT") }).state).toBe(STATE.CLEAR);
  });
  it("a source name alone (whey, no 'milk') is NOT disclosure", () => {
    expect(compare({ spec: spec([{ printed: "whey", english: "whey" }]), label: label("INGREDIENTS: CORN, WHEY, SALT") }).state).toBe(STATE.BLOCK);
  });
  it("an incomplete Contains statement blocks even if the ingredient list names the allergen", () => {
    const r = compare({ spec: spec([{ printed: "wheat flour", english: "wheat flour" }, { printed: "soybean oil", english: "soybean oil" }]), label: label("INGREDIENTS: WHEAT FLOUR, SOYBEAN OIL", "Contains: Wheat") });
    expect(r.state).toBe(STATE.BLOCK);
    expect(r.findings.find((f) => f.allergen === "soy").why).toMatch(/must list every/);
  });
  it("'May contain' only does not declare an ingredient -> blocks", () => {
    const r = compare({ spec: spec([{ printed: "sesame paste", english: "sesame paste" }]), label: label("INGREDIENTS: CHICKPEAS, OIL", null, { precautionary_printed: "May contain sesame." }) });
    expect(r.state).toBe(STATE.BLOCK);
    expect(r.findings[0].why).toMatch(/precautionary/);
  });
  it("never compares unconfirmed readings", () => {
    expect(compare({ spec: { ...spec([{ printed: "milk", english: "milk" }]), confirmed: false }, label: label("INGREDIENTS: MILK") }).state).toBe(STATE.REVIEW);
  });
  it("unspecified source (natural flavour) with no allergen statement -> needs review, not clear", () => {
    expect(compare({ spec: spec([{ printed: "natural flavour", english: "natural flavour" }, { printed: "salt", english: "salt" }]), label: label("INGREDIENTS: SALT, NATURAL FLAVOR") }).state).toBe(STATE.REVIEW);
  });
  it("includes allergens the product gets from its other supplier items", () => {
    const r = compare({ spec: spec([{ printed: "salt", english: "salt" }], { allergen_statement_printed: "No major allergens" }), label: label("INGREDIENTS: SALT, SUGAR"), otherAllergens: ["wheat"] });
    expect(r.state).toBe(STATE.BLOCK);
    expect(r.findings[0]).toMatchObject({ allergen: "wheat", fromOtherItems: true });
  });
  it("coconut milk is not dairy (frozen look-alike exclusion) -> no milk required", () => {
    expect(compare({ spec: spec([{ printed: "leche de coco", english: "coconut milk" }], { allergen_statement_printed: "Sin alérgenos" }), label: label("INGREDIENTS: COCONUT MILK, WATER") }).findings.length).toBe(0);
  });
});

describe("fixes from the Nov 26 acceptance run (tested with DIFFERENT wording than the acceptance documents)", () => {
  it("facility / shared-line wording in the supplier statement never makes an allergen an ingredient", () => {
    const r = compare({ spec: spec([{ printed: "rice flour", english: "rice flour" }], { allergen_statement_printed: "Contains: egg. Produced on a line that also handles peanuts." }), label: label("INGREDIENTS: RICE FLOUR, DRIED EGG") });
    expect(r.findings.map((f) => f.allergen)).toEqual(["egg"]);
    expect(r.state).toBe(STATE.CLEAR);
    const r2 = compare({ spec: spec([{ printed: "oats", english: "oats" }], { allergen_statement_printed: "Allergens: none. Packed in a factory that also packs tree nuts." }), label: label("INGREDIENTS: OATS") });
    expect(r2.findings).toEqual([]);
  });
  it("a placeholder behind a field label is rejected ('Notes: N/A', '備考：なし')", () => {
    expect(isPlaceholder("Notes: N/A")).toBe(true);
    expect(isPlaceholder("備考：なし")).toBe(true);
    expect(isPlaceholder("Otros: ninguno")).toBe(true);
    expect(isPlaceholder("Lecithin: soy")).toBe(false);
    const r = checkSpecReading({ ingredients: [{ printed: "harina", english: "flour" }, { printed: "Notas: N/A", english: "Notes: N/A" }] });
    expect(r.ingredients.map((i) => i.printed)).toEqual(["harina"]);
  });
});

describe("verified-library era: original-language cross-check and change report", async () => {
  const { specChanges, originalAllergens, checkSpecReading: csr, ISSUE: I, compare: cmp, STATE: ST } = await import("../src/proof/rules.js");
  it("finds allergens in original Spanish/Japanese words, with look-alike exclusions", () => {
    expect(originalAllergens("Aroma natural (contiene un portador derivado de la leche)")).toEqual(["milk"]);
    expect(originalAllergens("香料（乳由来）")).toEqual(["milk"]);
    expect(originalAllergens("乳化剤")).toEqual([]);           // emulsifier, not milk
    expect(originalAllergens("leche de coco")).toEqual([]);     // coconut milk
    expect(originalAllergens("ごま油")).toEqual(["sesame"]);
  });
  it("flags a translation that lost an allergen, and still counts the allergen", () => {
    const r = csr({ ingredients: [{ printed: "suero de leche en polvo", english: "powdered serum" }] });
    expect(r.issues.some((i) => i.kind === I.TRANSLATION)).toBe(true);
    const c = cmp({ spec: { ingredients: r.ingredients, allergen_statement_printed: "x", confirmed: true }, label: { ingredient_list_printed: "INGREDIENTS: POWDERED SERUM", contains_printed: null, confirmed: true } });
    expect(c.state).toBe(ST.BLOCK);
  });
  it("reports the document change and the allergen implication separately", () => {
    const prev = "Product: Test Blend. Ingredients: salt, sugar, natural flavour (plant-derived), rice starch. Allergen statement: none.";
    const next = { ingredients: [{ printed: "sal", english: "salt" }, { printed: "azúcar", english: "sugar" }, { printed: "aroma natural (con suero de leche)", english: "natural flavor (with milk whey)" }, { printed: "almidón de arroz", english: "rice starch" }], allergen_statement_printed: null };
    const d = specChanges(prev, next);
    expect(d.changes).toEqual([{ kind: "changed", before: "natural flavour (plant-derived)", after: "aroma natural (con suero de leche)", afterEnglish: "natural flavor (with milk whey)" }]);
    expect(d.unchangedCount).toBe(3);
    expect(d.allergensAdded).toEqual(["milk"]);
  });
  it("a translation with the same words in another order is not a change ('Powdered onion' vs 'onion powder')", () => {
    const d = specChanges("Ingredients: salt, onion powder, garlic powder.", { ingredients: [{ printed: "Sal", english: "Salt" }, { printed: "Cebolla en polvo", english: "Powdered onion" }, { printed: "Ajo en polvo", english: "Powdered garlic" }] });
    expect(d.changes).toEqual([]);
  });
  it("a different translation of the same ingredient ('Natural aroma' vs 'natural flavour') is paired as a change, not added + removed", () => {
    const d = specChanges("Ingredients: salt, natural flavour (plant-derived).", { ingredients: [{ printed: "Sal", english: "Salt" }, { printed: "Aroma natural (contiene un portador derivado de la leche)", english: "Natural aroma (contains a carrier derived from milk)" }] });
    expect(d.changes.map((c) => c.kind)).toEqual(["changed"]);
    expect(d.changes[0].before).toMatch(/natural flavour/);
    expect(d.allergensAdded).toEqual(["milk"]);
  });
  it("a translation that adds a word is reported as reworded, not removed + added", () => {
    const d = specChanges("Ingredients: salt, yeast extract.", { ingredients: [{ printed: "Sal", english: "Salt" }, { printed: "Extracto de levadura", english: "Brewer's yeast extract" }] });
    expect(d.changes.map((c) => c.kind)).toEqual(["reworded"]);
    expect(d.changes[0].before).toBe("yeast extract");
  });
  it("a wording-only change does not change the allergen implications", () => {
    const d = specChanges("Ingredients: salt, garlic powder.", { ingredients: [{ printed: "salt", english: "salt" }, { printed: "dehydrated garlic", english: "dehydrated garlic" }] });
    expect(d.changes.length).toBeGreaterThan(0);
    expect(d.allergensAdded).toEqual([]);
  });
});

describe("verified label library", async () => {
  const L = await import("../src/proof/library.js");
  it("only verified, approved records with a declaration can be used for an instant check", () => {
    expect(L.recordProblem(L.currentRecord("SKU-1001"))).toBeNull();
    expect(L.recordProblem({ ...L.SEED_RECORDS[0], verified: null })).toMatch(/not been verified/);
    expect(L.recordProblem({ ...L.SEED_RECORDS[0], status: "draft" })).toMatch(/not approved/);
    expect(L.recordProblem(null)).toMatch(/No label record/);
  });
  it("re-approval of an unchanged label needs a named reviewer and clear checks, and is tied to the artwork fingerprint", () => {
    const rec = L.currentRecord("SKU-1002");
    expect(L.approvalFor(rec, "SEAS-01").revision).toBe("SEAS-01@1");
    expect(() => L.reapprove(rec, "SEAS-01", "SEAS-01@2", null, STATE.CLEAR)).toThrow(/named reviewer/);
    expect(() => L.reapprove(rec, "SEAS-01", "SEAS-01@2", "QA", STATE.BLOCK)).toThrow(/checks are clear/);
    expect(() => L.reapprove({ ...rec, verified: null }, "SEAS-01", "SEAS-01@2", "QA", STATE.CLEAR)).toThrow(/not been verified/);
    L.reapprove(rec, "SEAS-01", "SEAS-01@2", "QA", STATE.CLEAR);
    expect(L.approvalFor(rec, "SEAS-01").revision).toBe("SEAS-01@2");
    // a different artwork file under the same record id does not inherit the re-approval
    expect(L.approvalFor({ ...rec, artwork: { sha256: "other" } }, "SEAS-01").revision).toBe("SEAS-01@1");
  });
  it("labelDiff surfaces invented text in a new artwork reading (for the reviewer to check against the image)", () => {
    const rec = L.currentRecord("SKU-1003");
    const d = L.labelDiff(rec, { ingredient_list_printed: rec.ingredient_list_printed.replace("NATURAL FLAVOR,", "NATURAL FLAVOR (MILK),"), contains_printed: "CONTAINS: WHEAT, MILK." }, "new-sha");
    expect(d.sameFile).toBe(false);
    expect(d.added.join(" ")).toMatch(/NATURAL FLAVOR \(MILK\)/);
    expect(d.containsChanged).toBe(true);
    expect(L.labelDiff(rec, rec, rec.artwork.sha256)).toMatchObject({ sameFile: true, added: [], containsChanged: false });
  });
});

describe("blind reviewer test classification", async () => {
  const T = await import("../src/proof/reviewer-test.js");
  const ok = T.VARIANTS.V0.reading;
  it("an error variant confirmed unchanged is MISSED; corrected to the image is CAUGHT", () => {
    for (const v of ["V1", "V2", "V3"]) {
      expect(T.classify(v, T.VARIANTS[v].reading).outcome).toBe("MISSED");
      expect(T.classify(v, ok)).toEqual({ outcome: "CAUGHT", edited: true });
    }
  });
  it("the control accepted unchanged is correct; adding milk is a false alarm", () => {
    expect(T.classify("V0", ok)).toEqual({ outcome: "CORRECTLY_ACCEPTED", edited: false });
    expect(T.classify("V0", { ...ok, contains_printed: "CONTAINS: WHEAT, MILK." }).outcome).toBe("FALSE_ALARM_ADDED_MILK");
  });
  it("every variant is reachable", () => {
    expect(new Set([0, 0.25, 0.45, 0.65, 0.85].map((r) => T.pickVariant(() => r)))).toEqual(new Set(["V0", "V1", "V2", "V3", "V4"]));
  });
});

describe("tamper-evident audit chain", async () => {
  const A = await import("../src/proof/audit.js");
  const build = async () => {
    const out = []; let prev;
    for (const e of [{ action: "confirmed supplier spec reading", by: "QA" }, { action: "Print held", sku: "SKU-1001", by: "QA" }, { action: "QA sign-off", sku: "SKU-1001", by: "QA" }]) {
      const c = await A.chainEntry({ at: "2026-11-26T00:00:00Z", ...e }, prev); out.push(c); prev = c.hash;
    }
    return out;
  };
  it("an untouched chain verifies", async () => {
    const c = await build();
    expect(await A.verifyChain(c)).toMatchObject({ ok: true, checked: 3 });
  });
  it("editing, deleting or reordering an entry is detected", async () => {
    const c = await build();
    expect((await A.verifyChain([c[0], { ...c[1], by: "someone else" }, c[2]])).ok).toBe(false);
    expect((await A.verifyChain([c[0], c[2]])).ok).toBe(false);
    expect((await A.verifyChain([c[1], c[0], c[2]])).ok).toBe(false);
  });
  it("canonical JSON ignores key order; CSV escapes commas and quotes", () => {
    expect(A.canonical({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(A.canonical({ a: [1, { c: 3, d: 2 }], b: 1 }));
    const csv = A.toCSV([{ at: "t", action: 'say "hi", ok', extra: 1 }]);
    expect(csv.split("\n")[1]).toContain('"say ""hi"", ok"');
    expect(csv).toContain('"{""extra"":1}"');
  });
});
