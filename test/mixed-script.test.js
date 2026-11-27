import { describe, it, expect } from "vitest";
import { mixedScriptWords, checkLabelReading, checkSpecReading, ISSUE, blocking } from "../src/proof/rules.js";

describe("mixed-alphabet reading glitch (seen live on Gemini Nano, 27 Nov)", () => {
  it("finds a Latin word with Cyrillic letters inside", () => {
    expect(mixedScriptWords("SEASONING (SALT, MALTOДЕКТРИН, ONION POWDER)")).toEqual(["MALTOДЕКТРИН"]);
  });
  it("leaves clean English, Spanish and Japanese text alone", () => {
    expect(mixedScriptWords("SALT, MALTODEXTRIN, NATURAL FLAVOR (MILK)")).toEqual([]);
    expect(mixedScriptWords("Aroma natural (contiene un portador derivado de la leche), Dióxido de silicio")).toEqual([]);
    expect(mixedScriptWords("醤油粉末（大豆・小麦を含む）, Salt")).toEqual([]);
  });
  it("label reading with the glitch gets a blocking issue the reviewer must resolve", () => {
    const r = checkLabelReading({ ingredient_list_printed: "INGREDIENTS: WHEAT FLOUR, SEASONING (SALT, MALTOДЕКТРИН, NATURAL FLAVOR (MILK)).", contains_printed: "CONTAINS: WHEAT, MILK." });
    const mixed = r.issues.filter((i) => i.kind === ISSUE.MIXED_SCRIPT);
    expect(mixed).toHaveLength(1);
    expect(blocking(r.issues)).toContainEqual(mixed[0]);
  });
  it("spec reading with the glitch is flagged too", () => {
    const r = checkSpecReading({ ingredients: [{ printed: "Maltodextrina", english: "MaltoдекстрIn" }, { printed: "Sal", english: "Salt" }] });
    expect(r.issues.some((i) => i.kind === ISSUE.MIXED_SCRIPT)).toBe(true);
  });
});
