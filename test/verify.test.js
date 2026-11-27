// Verification questions (A/B "which does the picture say?") and the updated blind-test classification.
import { describe, it, expect } from "vitest";
import { verificationQuestions, applyAnswers, orderOptions, trimCommon, anyUnsure } from "../src/proof/verify.js";
import { currentRecord } from "../src/proof/library.js";
import { VARIANTS, classify } from "../src/proof/reviewer-test.js";

const OLD = currentRecord("SKU-1003");
describe("verification questions", () => {
  it("V1 (milk invented in ingredients + Contains) gives two questions; choosing the old wording removes the invented milk", () => {
    const r = VARIANTS.V1.reading, qs = verificationQuestions(OLD, r);
    expect(qs.map((q) => q.kind)).toEqual(["pair", "contains"]);
    const fixed = applyAnswers(r, qs, Object.fromEntries(qs.map((q) => [q.id, "old"])));
    expect(classify("V1", fixed).outcome).toBe("CAUGHT");
    const kept = applyAnswers(r, qs, Object.fromEntries(qs.map((q) => [q.id, "new"])));
    expect(classify("V1", kept).outcome).toBe("MISSED");
  });
  it("V2 and V3 give one question each, and the old wording fixes them", () => {
    for (const v of ["V2", "V3"]) {
      const qs = verificationQuestions(OLD, VARIANTS[v].reading);
      expect(qs).toHaveLength(1);
      expect(classify(v, applyAnswers(VARIANTS[v].reading, qs, { [qs[0].id]: "old" })).outcome).toBe("CAUGHT");
    }
  });
  it("V4 control (milk really added): keeping the computer's reading is correct; rejecting it is a false alarm", () => {
    const r = VARIANTS.V4.reading, qs = verificationQuestions(OLD, r);
    expect(qs).toHaveLength(2);
    expect(classify("V4", applyAnswers(r, qs, Object.fromEntries(qs.map((q) => [q.id, "new"])))).outcome).toBe("CORRECTLY_ACCEPTED");
    expect(classify("V4", applyAnswers(r, qs, Object.fromEntries(qs.map((q) => [q.id, "old"])))).outcome).toBe("FALSE_ALARM_REMOVED_MILK");
  });
  it("an identical reading gives no questions; the option order is stable per seed and both orders occur", () => {
    expect(verificationQuestions(OLD, OLD)).toEqual([]);
    const q = verificationQuestions(OLD, VARIANTS.V1.reading)[0];
    expect(orderOptions(q, "a")).toEqual(orderOptions(q, "a"));
    const firsts = new Set(Array.from({ length: 20 }, (_, i) => orderOptions(q, `s${i}`)[0].key));
    expect(firsts).toEqual(new Set(["old", "new"]));
  });
  it("old v1 control (V0) is still classified as before", () => {
    expect(classify("V0", VARIANTS.V0.reading).outcome).toBe("CORRECTLY_ACCEPTED");
    expect(classify("V0", { ...VARIANTS.V0.reading, contains_printed: "CONTAINS: MILK" }).outcome).toBe("FALSE_ALARM_ADDED_MILK");
  });
  it("options show only the differing part, with equal context and no highlight on either", () => {
    const [b, a] = trimCommon("SEASONING (SALT, SPICES, NATURAL FLAVOR, SILICON DIOXIDE)", "SEASONING (SALT, SPICES, NATURAL FLAVOR (MILK), SILICON DIOXIDE)");
    expect(b).toBe("… SPICES, NATURAL FLAVOR, SILICON DIOXIDE)");
    expect(a).toBe("… SPICES, NATURAL FLAVOR (MILK), SILICON DIOXIDE)");
    const q = verificationQuestions(OLD, VARIANTS.V1.reading)[0];
    expect(q.options.every((o) => o.vs === "")).toBe(true);
  });
  it("'I can't tell' is never a guess: the test records it as flagged, and it keeps the computer's text", () => {
    const r = VARIANTS.V2.reading, qs = verificationQuestions(OLD, r), ans = { [qs[0].id]: "unsure" };
    expect(anyUnsure(qs, ans)).toBe(true);
    expect(applyAnswers(r, qs, ans).contains_printed).toBe(r.contains_printed);
    expect(classify("V2", applyAnswers(r, qs, ans), true).outcome).toBe("FLAGGED_NEEDS_REVIEW");
  });
});
