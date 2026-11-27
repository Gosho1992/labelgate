// GPT check (Nov 26): allergen detection must not depend only on Gemini Nano's English translation.
// Dev examples written for this test (not from any acceptance or evaluation set).
import { describe, it, expect } from "vitest";
import { specSources } from "../src/proof/rules.js";

const src = (rows, stmt = null) => specSources({ ingredients: rows.map(([printed, english]) => ({ printed, english })), allergen_statement_printed: stmt, allergen_statement_original: stmt });

describe("original-language allergen words work even when the translation is wrong or missing", () => {
  it("Spanish: milk and soy found from 'leche' / 'soja' with a wrong English translation", () => {
    const s = src([["Aroma natural (contiene un portador derivado de la leche)", "Natural flavoring"], ["Lecitina de soja", "Lecithin"]]);
    expect(s.allergens).toEqual(expect.arrayContaining(["milk", "soy"]));
  });
  it("Spanish: found with NO English translation at all", () => {
    const s = src([["Suero de leche en polvo", ""], ["Lecitina de soja", null]]);
    expect(s.allergens).toEqual(expect.arrayContaining(["milk", "soy"]));
  });
  it("Japanese: soy and wheat found from 大豆 / 小麦 with a wrong English translation", () => {
    const s = src([["醤油粉末（大豆・小麦を含む）", "Seasoning powder"]]);
    expect(s.allergens).toEqual(expect.arrayContaining(["soy", "wheat"]));
  });
  it("Japanese: milk found from 乳 in an allergen statement with no translation", () => {
    const s = src([["香料", "Flavor"]], "アレルゲン: 乳成分");
    expect(s.allergens).toContain("milk");
  });
  it("look-alike words are not allergens: leche de coco, 乳化剤", () => {
    expect(src([["Leche de coco", ""]]).allergens).not.toContain("milk");
    expect(src([["乳化剤", ""]]).allergens).not.toContain("milk");
  });
});
