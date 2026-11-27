// GPT check (Nov 26): the automatic retry on an empty on-device reading was never triggered in a real run.
// This tests it with a simulated model: first answer empty, second answer good.
import { describe, it, expect, vi, beforeEach } from "vitest";

const answers = [];
vi.mock("../src/ai/firebase.js", () => ({
  firebaseConfigured: true,
  lastReadSources: { chunks: ["on_device"], final: "on_device" },
  readPrivateDocumentStream: vi.fn(async () => answers.shift()),
  privateDocumentModel: vi.fn(),
}));
globalThis.FileReader = class { readAsDataURL() { this.result = "data:image/png;base64,AAAA"; this.onload(); } };

const { readDocument } = await import("../src/proof/read.js");
const fb = await import("../src/ai/firebase.js");
const png = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
const GOOD = JSON.stringify({ ingredient_list_printed: "INGREDIENTS: WHEAT FLOUR, SALT.", contains_printed: "CONTAINS: WHEAT.", may_contain_printed: null });
const EMPTY = JSON.stringify({ ingredient_list_printed: "", contains_printed: null, may_contain_printed: null });

describe("automatic retry on an empty reading", () => {
  beforeEach(() => { answers.length = 0; fb.readPrivateDocumentStream.mockClear(); });
  it("an empty first answer is retried once and the second answer is used", async () => {
    answers.push(EMPTY, GOOD);
    const r = await readDocument("label", png, "T");
    expect(r.ok).toBe(true); expect(r.retried).toBe(true);
    expect(fb.readPrivateDocumentStream).toHaveBeenCalledTimes(2);
    expect(r.draft.contains_printed).toBe("CONTAINS: WHEAT.");
  });
  it("a good first answer is not retried", async () => {
    answers.push(GOOD);
    const r = await readDocument("label", png, "T");
    expect(r.retried).toBe(false); expect(fb.readPrivateDocumentStream).toHaveBeenCalledTimes(1);
  });
  it("two empty answers do not become a clean reading: the field stays empty for the reviewer", async () => {
    answers.push(EMPTY, EMPTY);
    const r = await readDocument("label", png, "T");
    expect(r.retried).toBe(true);
    expect(String(r.draft.ingredient_list_printed || "").trim()).toBe("");
    expect(r.draft.issues.map((i) => i.kind)).toContain("empty_reading"); // blocks confirmation until the reviewer acts
  });
  it("an empty supplier-spec ingredient list is retried too", async () => {
    answers.push(JSON.stringify({ language: "es", ingredients: [], allergen_statement_printed: null, allergen_statement_english: null }),
      JSON.stringify({ language: "es", ingredients: [{ printed: "Sal", english: "Salt" }], allergen_statement_printed: null, allergen_statement_english: null }));
    const r = await readDocument("spec", png, "T");
    expect(r.retried).toBe(true); expect(r.draft.ingredients.length).toBe(1);
  });
});
