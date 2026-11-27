// @vitest-environment happy-dom
// UI smoke test of the main Spec-to-Proof flow, with the on-device model replaced by recorded REAL Gemini Nano readings
// (acceptance run B). Added on 27 Nov after a UI regression marked every successful spec read as failed — unit tests of
// the rules could not catch that. This tests OUR UI wiring, not the model.
import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { RECORDED_SPEC_RAW } from "../src/proof/reviewer-test.js";

const results = JSON.parse(readFileSync(process.cwd() + "/bench/acceptance/results-B-run1-2026-11-26.json", "utf8"));
const LABEL_V1 = JSON.parse(results.readings["/demo/LBL-1003-v1.png"].raw); // Pretzel Bites, no milk (real Nano)
// a deliberately wrong reading of the same artwork (blind-test variant V1): invents milk in the ingredients and a Contains line
const WRONG = { ingredient_list_printed: LABEL_V1.ingredient_list_printed.replace("NATURAL FLAVOR,", "NATURAL FLAVOR (MILK),"), contains_printed: "CONTAINS: WHEAT, MILK." };
let labelReading = LABEL_V1;

vi.mock("../src/ai/firebase.js", () => ({
  firebaseConfigured: true, privateDocumentModel: () => ({}), warmUpDeviceModel: async () => 1,
  lastReadSources: { chunks: ["on_device"], final: "on_device" },
}));
vi.mock("../src/proof/read.js", async (orig) => {
  const real = await orig();
  const { checkSpecReading, checkLabelReading } = await import("../src/proof/rules.js");
  return { ...real, readDocument: vi.fn(async (kind) => ({ ok: true, ms: 1000, retried: false, inferenceSource: { chunks: ["on_device"], final: "on_device" },
    draft: kind === "spec" ? { ...checkSpecReading(RECORDED_SPEC_RAW), allergen_statement_english: RECORDED_SPEC_RAW.allergen_statement_english } : checkLabelReading(labelReading) })) };
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await wait(20); } return false; };
const $ = (s) => document.querySelector(s);

beforeAll(async () => {
  const html = readFileSync(process.cwd() + "/index.html", "utf8");
  document.body.innerHTML = html.slice(html.indexOf("<body"), html.lastIndexOf("</body>")).replace(/^<body[^>]*>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
  globalThis.fetch = async () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }));
  globalThis.LanguageModel = { availability: async () => "available" };
  URL.createObjectURL = () => "blob:x"; URL.revokeObjectURL = () => {};
  localStorage.clear();
  const { initProof } = await import("../src/proof/ui.js");
  initProof();
  await wait(50);
});

describe("Spec-to-Proof UI flow (recorded Nano readings)", () => {
  it("Gate 1: the demo spec is read and shown as read (not as an error)", async () => {
    $('[data-demo="spec"]').click();
    expect(await until(() => /Read on this device/.test($("#pf-spec-status")?.textContent || ""))).toBe(true);
    expect($("#pf-spec-status").textContent).not.toMatch(/Could not read/);
    expect($('[data-confirm="spec"]').disabled).toBe(false);
  });
  it("confirming the spec computes the impact: two labels blocked for milk, one clear", async () => {
    $('[data-confirm="spec"]').click();
    expect(await until(() => /blocked/.test($("#pf-impact")?.textContent || ""))).toBe(true);
    const txt = $("#pf-impact").textContent;
    expect((txt.match(/PRINT BLOCKED/g) || []).length).toBe(2);
    expect(txt).toMatch(/CHECKS CLEAR/);
    expect($(".sumbar").textContent).toMatch(/Next action/);
  });
  it("the Supplier Change Impact Card shows the real change, its place on the spec, and the same results as the impact table", async () => {
    const card = $(".icard"); expect(card).toBeTruthy();
    const t = card.textContent;
    expect(t).toMatch(/natural flavour \(plant-derived\)/i);                       // approved wording before (revision 1)
    expect(t).toMatch(/Aroma natural \(contiene un portador derivado de la leche\)/); // new wording as printed
    expect(t).toMatch(/ingredient 7 on the spec photo/);
    expect(t).toMatch(/New allergen source\s*Milk/);
    // no fabricated results: each product's chip equals the state in the detailed impact table
    const table = [...document.querySelectorAll("#pf-impact tbody tr")].map((tr) => tr.textContent);
    const rows = [...card.querySelectorAll(".ic-row")];
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      const name = r.querySelector("b").textContent, chipText = r.querySelector(".chip").textContent;
      expect(table.find((x) => x.includes(name))).toContain(chipText);
    }
    expect(rows.filter((r) => /PRINT BLOCKED/.test(r.textContent))).toHaveLength(2);
    expect(t).toMatch(/Hold print for Crispy Garden Crackers and Seasoned Pretzel Bites/);
  });
  it("Gate 2: an artwork reading identical to the approved label asks no questions and is confirmed → still blocked (no milk)", async () => {
    const sel = $("#pf-artsku"); sel.value = "SKU-1003"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(20);
    $('[data-demo="label"]').click();
    expect(await until(() => /Read on this device/.test($("#pf-label-status")?.textContent || ""))).toBe(true);
    expect($(".chk-box").textContent).toMatch(/No wording differences|identical fingerprint/);
    $('[data-confirm="label"]').click();
    expect(await until(() => /PRINT BLOCKED/.test($("#pf-art-result")?.textContent || ""))).toBe(true);
  });
  it("a wrong AI reading (invented milk) asks neutral A/B questions; it cannot be confirmed until every one is answered", async () => {
    labelReading = WRONG;
    $('[data-read="label"]').click(); // "Retry reading" on the same artwork
    expect(await until(() => document.querySelectorAll(".vqq").length === 2)).toBe(true);
    expect(document.querySelectorAll(".vqq input:checked").length).toBe(0); // nothing pre-selected
    expect($('[data-confirm="label"]').disabled).toBe(true);
  });
  it("choosing what the artwork really says removes the invented milk, so the label is correctly blocked", async () => {
    for (let i = 0; i < 2; i++) {
      const old = document.querySelectorAll(".vqq")[i].querySelector('input[value="old"]');
      old.checked = true; old.dispatchEvent(new Event("change", { bubbles: true })); await wait(20);
    }
    expect($('[data-confirm="label"]').disabled).toBe(false);
    expect($('[data-lb="ing"]').value).not.toMatch(/\(MILK\)/);
    $('[data-confirm="label"]').click();
    expect(await until(() => /PRINT BLOCKED/.test($("#pf-art-result")?.textContent || ""))).toBe(true);
  });
  it("answering \"I can't tell\" sends the artwork to NEEDS REVIEW instead of guessing", async () => {
    $('[data-read="label"]').click();
    expect(await until(() => document.querySelectorAll(".vqq").length === 2 && !document.querySelector(".vqq input:checked"))).toBe(true);
    for (let i = 0; i < 2; i++) {
      const pick = document.querySelectorAll(".vqq")[i].querySelector(i === 0 ? 'input[value="unsure"]' : 'input[value="new"]');
      pick.checked = true; pick.dispatchEvent(new Event("change", { bubbles: true })); await wait(20);
    }
    // the Contains answer keeps the (invented) milk, so this label would otherwise look CLEAR — "can't tell" must stop that
    $('[data-confirm="label"]').click();
    expect(await until(() => /NEEDS REVIEW/.test($("#pf-art-result")?.textContent || ""))).toBe(true);
    expect($("#pf-art-result").textContent).toMatch(/could not tell/);
  });
  it("every decision is written to the hash-chained history", async () => {
    expect(await until(() => /Audit chain intact/.test($("#pf-history")?.textContent || ""), 3000)).toBe(true);
  });
});
