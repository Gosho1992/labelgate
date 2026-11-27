// Guards for B2: the baseline dictionary, the prompt and the held-out v2 set are frozen.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DICT, LOOKALIKES } from "../src/allergens/dictionary.js";
import { NANO_EXTRACTION_SCHEMA } from "../src/schemas.js";
import { EXTRACT_SYSTEM, EXTRACT_SYSTEM_V1 } from "../src/detect/prompt.js";
import { HELDOUT_V2_20 } from "../bench/cases/heldout-v2-20.js";

const h = (s) => createHash("sha256").update(s).digest("hex");

describe("frozen artefacts", () => {
  it("dictionary content unchanged (2026.11.25-1)", () => {
    expect(h(JSON.stringify(DICT))).toBe("79ce7ff9e408664395858133da8055f4d572b762c3271154cf9e0a2ed58d29cc");
  });
  it("v1 extraction prompt unchanged (used by B2)", () => {
    expect(h(EXTRACT_SYSTEM_V1)).toBe("9dd182061b775aba1c953c8e84bc12fecbd2d41529484db333d03ab0ca264d02");
  });
  it("v2 discovery prompt frozen before held-out v3 was written (Nov 26)", () => {
    expect(h(EXTRACT_SYSTEM)).toBe("62572a8f9b8fbb6fbf020652656f6c862daccb2b3205af6198ea3094e0f41231");
  });
  it("discovery schema v2 frozen", () => {
    expect(h(JSON.stringify(NANO_EXTRACTION_SCHEMA))).toBe("28d9fa51272639340bd163b0b529150ec973bfd85418d037c9d715c217276c07");
  });
  it("look-alike exclusions frozen (exactly the three approved)", () => {
    expect(LOOKALIKES.map((l) => l.id)).toEqual(["coconut-milk", "cream-of-tartar", "seed-butter"]);
    expect(h(JSON.stringify(LOOKALIKES.map((l) => l.re.source)))).toBe("460eaab5fec6f75de5ee09bce191ae15253fb9818b56bde197b62fb210b83b10");
  });
  it("held-out v2 file unchanged since it was written (gold cannot be edited after seeing results)", () => {
    expect(h(readFileSync(new URL("../bench/cases/heldout-v2-20.js", import.meta.url)))).toBe("df5b46d242c9fd1e362fd457625ef46a97a0a7cf8cc040a71e2e021e55b4d816");
  });
});

describe("held-out v2 is genuinely unseen", () => {
  const dictWords = Object.values(DICT).flat().map((w) => w.toLowerCase());
  const prompt = EXTRACT_SYSTEM_V1.toLowerCase(); // v2 was frozen against the v1 prompt
  for (const c of HELDOUT_V2_20.filter((x) => x.unseenTerm)) {
    it(`${c.id} "${c.unseenTerm}" is not in the dictionary or the prompt`, () => {
      const t = c.unseenTerm.toLowerCase();
      expect(prompt.includes(t)).toBe(false);
      for (const tok of t.split(/\s+/)) expect(dictWords).not.toContain(tok);
      expect(dictWords).not.toContain(t);
    });
  }
  it("has 20 cases covering every required category", () => {
    expect(HELDOUT_V2_20).toHaveLength(20);
    const cats = new Set(HELDOUT_V2_20.map((c) => c.cat));
    for (const k of ["scientific", "derivative", "carrier", "compound", "negative", "ambiguous", "contradiction", "precaution"]) expect(cats.has(k)).toBe(true);
  });
});
