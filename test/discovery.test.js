// Nov 26 checkpoint: Nano = ingredient discovery, evidence + absence validation, look-alike exclusions.
import { describe, it, expect } from "vitest";
import { dictionaryExtract } from "../src/allergens/dictionary.js";
import { detectFromOutput, MODE } from "../src/detect/pipeline.js";
import { locateSpan, applyDeterminations } from "../src/engine/profile.js";
import { evaluate } from "../src/engine/gate.js";
import { STATE } from "../src/schemas.js";

const contains = (t) => dictionaryExtract("x", t).claims.filter((c) => c.assertion === "intentional").map((c) => c.allergen).sort();
const run = (text, raw, mode = MODE.HYBRID) => detectFromOutput({ id: "S@1", text }, { mode, nanoStatus: "ok", rawNano: raw });
const ing = (term, evidence = term, guess = "unknown", assertion = "intentional") => ({ term, evidence, assertion, allergen_guess: guess });

describe("look-alike exclusions (each with a positive and a negative test)", () => {
  it("coconut milk is not dairy milk", () => expect(contains("Water chestnuts, coconut milk, salt.")).toEqual([]));
  it("…but real milk elsewhere in the same spec still counts", () => expect(contains("Coconut milk, skimmed milk powder.")).toEqual(["milk"]));
  it("…and 'milk' after a different word still counts", () => expect(contains("Oat drink, whole milk.")).toEqual(["milk"]));
  it("cream of tartar is not dairy cream", () => expect(contains("Rice, cream of tartar, salt.")).toEqual([]));
  it("…but dairy cream elsewhere still counts", () => expect(contains("Cream of tartar, double cream.")).toEqual(["milk"]));
  it("seed butter is not dairy butter", () => expect(contains("Sunflower seed butter, cane sugar.")).toEqual([]));
  it("…but the seed's own allergen is kept (sesame seed butter -> sesame)", () => expect(contains("Sesame seed butter, salt.")).toEqual(["sesame"]));
  it("…and dairy butter elsewhere still counts", () => expect(contains("Sunflower seed butter, butter (milk).")).toEqual(["milk"]));
  it("exclusions survive spacing/case variants", () => expect(contains("COCONUT  Milk powder.")).toEqual([]));
});

describe("evidence normalisation", () => {
  it("matches across case, extra whitespace, curly quotes and dashes", () => {
    const text = "Dressing: pasteurised hen’s   yolk – 2%.";
    expect(locateSpan(text, "Pasteurised hen's yolk - 2%")).not.toBeNull();
  });
  it("trims surrounding punctuation in the quote", () => expect(locateSpan("Binder: ovomucoid (0.5%).", '"ovomucoid,"')).not.toBeNull());
  it("does not match a word that is not there", () => expect(locateSpan("Binder: potato starch.", "lecithin")).toBeNull());
});

describe("Nano is ingredient discovery, not an allergen classifier", () => {
  const text = "Thickener: flour from Glycine max, guar gum, water.";
  it("a Nano-only find is UNKNOWN; the (wrong) guess is stored separately and never confirmed", () => {
    const p = run(text, { ingredients: [ing("Glycine max", "flour from Glycine max", "wheat")], absences: [] });
    expect([...p.contains]).toEqual([]);
    expect(p.possible[0]).toMatchObject({ term: "Glycine max", allergen: "UNKNOWN", modelGuess: "wheat" });
  });
  it("when the dictionary maps the same span, the dictionary allergen wins and no UNKNOWN is created", () => {
    const p = run("Coating: whey powder, salt.", { ingredients: [ing("whey powder", "whey powder", "egg")], absences: [] });
    expect([...p.contains]).toEqual(["milk"]);
    expect(p.possible).toEqual([]);
  });
  it("dictionary/Nano disagreement is judged per allergen, not per mention", () => {
    const p = run("Enriched wheat flour (wheat flour, iron). Contains: wheat.", { ingredients: [ing("wheat flour", "wheat flour", "wheat")], absences: [] });
    expect(p.unresolved).toEqual([]);
  });
  it("Nano-only arm never confirms anything (only discovery + guesses)", () => {
    const p = run(text, { ingredients: [ing("Glycine max", "Glycine max", "soy")], absences: [] }, MODE.NANO);
    expect([...p.contains]).toEqual([]);
    expect(p.possible).toHaveLength(1);
  });
  it("an echoed prompt word that is not in the text is rejected, logged, and raises no flag (B2 failure mode)", () => {
    const p = run("Ingredients: potatoes, sunflower oil, sea salt.", { ingredients: [ing("lecithin")], absences: [{ ingredient: "emulsifier", missing: "source", ingredient_evidence: "emulsifier" }] });
    expect(p.rejected.map((r) => r.kind)).toEqual(["ingredient", "absence"]);
    expect(p.unresolved).toEqual([]);
  });
});

describe("structured absence claims", () => {
  const text = "Glaze: sugar, water, flavouring preparation (composition on request).";
  it("grounded absence -> review item naming the quoted ingredient", () => {
    const p = run(text, { ingredients: [], absences: [{ ingredient: "flavouring preparation", missing: "composition", ingredient_evidence: "flavouring preparation" }] });
    expect(p.absences[0]).toMatchObject({ ingredient: "flavouring preparation", missing: "composition" });
    expect(p.unresolved.join(" ")).toMatch(/"flavouring preparation": composition not stated/);
  });
  it("absence whose ingredient is not in the text is rejected", () => {
    const p = run("Batter: starch, salt.", { ingredients: [], absences: [{ ingredient: "protein isolate", missing: "source", ingredient_evidence: "protein isolate" }] });
    expect(p.absences).toEqual([]);
    expect(p.rejected[0].kind).toBe("absence");
  });
  it("absence whose ingredient name exists but whose ingredient_evidence quote does not is rejected (strict)", () => {
    const p = run("Coating: soy lecithin, sugar.", { ingredients: [], absences: [{ ingredient: "lecithin", missing: "source", ingredient_evidence: "lecithin (source unknown)" }] });
    expect(p.absences).toEqual([]);
    expect(p.rejected[0].kind).toBe("absence");
  });
  it("duplicate absences for the same ingredient collapse to one", () => {
    const a = { ingredient: "flavouring preparation", missing: "composition", ingredient_evidence: "flavouring preparation" };
    expect(run(text, { ingredients: [], absences: [a, a] }).absences).toHaveLength(1);
  });
});

describe("human determination (independent, never pre-filled from the model guess)", () => {
  const spec = { id: "THK@1", itemId: "THK", text: "Thickener: flour from Glycine max, guar gum." };
  const profile = detectFromOutput(spec, { mode: MODE.HYBRID, nanoStatus: "ok", rawNano: { ingredients: [ing("Glycine max", "flour from Glycine max", "wheat")], absences: [] } });
  const formulas = [{ sku: "SKU-9", lines: [{ itemId: "THK", pct: 5 }] }];
  const labels = [{ id: "L9", sku: "SKU-9", ingredientStatement: "Wheat flour, thickener.", containsStatement: "Contains: wheat.", approval: null }];
  const ctx = { formulas, labels, currentSpecByItem: { THK: "THK@1" }, profiles: { "THK@1": profile } };

  it("undetermined -> NEEDS REVIEW with the ingredient listed for identification", () => {
    const f = evaluate(ctx)[0];
    expect(f.state).toBe(STATE.REVIEW);
    expect(f.needsId[0]).toMatchObject({ term: "Glycine max", allergen: "UNKNOWN", modelGuess: "wheat" });
  });
  it("reviewer determines soy (not the model's 'wheat') -> label missing soy is PRINT BLOCKED", () => {
    const f = evaluate({ ...ctx, determinations: { "THK@1|Glycine max": "soy" } })[0];
    expect(f.state).toBe(STATE.BLOCKED);
    expect(f.paths.find((p) => p.allergen === "soy").source).toBe("reviewer");
  });
  it("reviewer determines 'not an allergen' -> the item is resolved", () => {
    const p = applyDeterminations(profile, { "THK@1|Glycine max": "none" });
    expect(p.possible).toEqual([]);
    expect(p.unresolved.join(" ")).not.toMatch(/Glycine max/);
  });
  it("a determination is bound to the spec revision: a new revision asks again", () => {
    const p2 = { ...profile, specId: "THK@2", possible: profile.possible.map((x) => ({ ...x, specId: "THK@2" })) };
    const f = evaluate({ ...ctx, currentSpecByItem: { THK: "THK@2" }, profiles: { "THK@2": p2 }, determinations: { "THK@1|Glycine max": "soy" } })[0];
    expect(f.needsId).toHaveLength(1);
  });
});
