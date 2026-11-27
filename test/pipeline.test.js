// B1: one detect() pipeline for app and benchmark; cache keyed on content + versions; model lifecycle.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { detect, detectFromOutput, normalizeNanoOutput, MODE } from "../src/detect/pipeline.js";
import { cacheKey, DetectCache } from "../src/detect/cache.js";

const spec = { id: "T@1", text: "Topping: sliced kernels of Prunus dulcis, lightly toasted." };
const nanoOut = { ingredients: [{ term: "Prunus dulcis", allergen_guess: "treenut", assertion: "intentional", evidence: "kernels of Prunus dulcis" }], absences: [] };

describe("detect() modes share one pipeline", () => {
  it("rules mode never asks the model and adds no 'model did not run' flag", async () => {
    const runner = vi.fn();
    const r = await detect(spec, { mode: MODE.RULES, runner });
    expect(runner).not.toHaveBeenCalled();
    expect([...r.profile.contains]).toEqual([]);
    expect(r.profile.unresolved).toEqual([]);
  });
  it("hybrid: a Nano-found ingredient the dictionary does not map is UNKNOWN (guess kept separately), never confirmed", async () => {
    const r = await detect(spec, { mode: MODE.HYBRID, runner: async () => nanoOut });
    expect([...r.profile.contains]).toEqual([]);
    expect(r.profile.possible).toHaveLength(1);
    expect(r.profile.possible[0]).toMatchObject({ term: "Prunus dulcis", allergen: "UNKNOWN", modelGuess: "treenut", evidence: "kernels of Prunus dulcis" });
    expect(r.profile.unresolved.join(" ")).toMatch(/allergen UNKNOWN, verify/);
    expect(r.nanoStatus).toBe("ok");
  });
  it("unsupported evidence span -> rejected and logged, no review flag, never confirmed", () => {
    const p = detectFromOutput(spec, { mode: MODE.HYBRID, nanoStatus: "ok", rawNano: { ingredients: [{ term: "peanut butter", allergen_guess: "peanut", assertion: "intentional", evidence: "peanut butter" }], absences: [] } });
    expect(p.contains.has("peanut")).toBe(false);
    expect(p.rejected).toHaveLength(1);
    expect(p.unresolved).toEqual([]);
  });
  it("malformed model output -> status malformed + review (not 'no allergens')", () => {
    const p = detectFromOutput(spec, { mode: MODE.NANO, nanoStatus: "ok", rawNano: { malformedText: "{oops" } });
    expect(p.nanoStatus).toBe("malformed");
    expect(p.unresolved.length).toBeGreaterThan(0);
  });
  it("normalises guess keys; an unknown guess key becomes 'unknown' (guesses are never authoritative)", () => {
    const n = normalizeNanoOutput({ ingredients: [{ term: "x", allergen_guess: "Tree nuts", assertion: "intentional", evidence: "x" }, { term: "y", allergen_guess: "gluten", assertion: "intentional", evidence: "y" }], absences: [] });
    expect(n.nano.ingredients[0].allergen_guess).toBe("treenut");
    expect(n.nano.ingredients[1].allergen_guess).toBe("unknown");
  });
  it("runner timeout -> status timeout + review", async () => {
    const r = await detect(spec, { mode: MODE.HYBRID, runner: () => new Promise(() => {}), timeoutMs: 20 });
    expect(r.nanoStatus).toBe("timeout");
    expect(r.profile.unresolved.join(" ")).toMatch(/did not run \(timeout\)/);
  });
  it("cancellation via AbortSignal", async () => {
    const ctl = new AbortController();
    const p = detect(spec, { mode: MODE.HYBRID, runner: () => new Promise(() => {}), signal: ctl.signal });
    ctl.abort(new Error("user cancelled"));
    expect((await p).nanoStatus).toBe("cancelled");
  });
});

describe("cache invalidation", () => {
  it("key changes when the spec text changes, even by one character", async () => {
    const a = await cacheKey("salt, spices", { mode: "hybrid", transport: "prompt-api" });
    const b = await cacheKey("salt, spices.", { mode: "hybrid", transport: "prompt-api" });
    expect(a).not.toBe(b);
  });
  it("key changes with transport and mode", async () => {
    const a = await cacheKey("x", { mode: "hybrid", transport: "prompt-api" });
    expect(a).not.toBe(await cacheKey("x", { mode: "hybrid", transport: "none" }));
    expect(a).not.toBe(await cacheKey("x", { mode: "rules", transport: "prompt-api" }));
  });
  it("concurrent identical requests run once; failures are not cached", async () => {
    const c = new DetectCache();
    let calls = 0;
    const slow = () => new Promise((r) => setTimeout(() => r({ nanoStatus: "ok", n: ++calls }), 10));
    const [x, y] = await Promise.all([c.get("k", slow), c.get("k", slow)]);
    expect(calls).toBe(1); expect(y.joined).toBe(true);
    expect((await c.get("k", slow)).cached).toBe(true);
    await c.get("f", async () => ({ nanoStatus: "timeout" }));
    let ran = false; await c.get("f", async () => { ran = true; return { nanoStatus: "ok" }; });
    expect(ran).toBe(true);
  });
});

describe("on-device model lifecycle", () => {
  beforeEach(() => { vi.resetModules(); });
  it("'downloadable' triggers create() with a download monitor (not a silent rules-only fallback)", async () => {
    const created = [];
    globalThis.LanguageModel = {
      availability: async () => "downloadable",
      create: async (o) => { created.push(o); o.monitor({ addEventListener: (_, f) => f({ loaded: 0.5 }) }); return { clone: async () => ({ prompt: async () => "{}", destroy() {} }) }; },
    };
    const m = await import("../src/ai/nano.js");
    m.setTransport("prompt-api"); // this test exercises the Prompt API lifecycle; Firebase transport is tested in firebase.test.js
    const seen = [];
    m.onNanoChange((s) => seen.push(s.state));
    expect(await m.checkAvailability()).toBe("downloadable");
    expect(await m.ensureReady()).toBe(true);
    expect(created).toHaveLength(1);
    expect(seen).toContain("downloading");
    expect(m.nano.state).toBe("ready");
    delete globalThis.LanguageModel;
  });
  it("'unavailable' does not pretend the model ran", async () => {
    globalThis.LanguageModel = { availability: async () => "unavailable", create: vi.fn() };
    const m = await import("../src/ai/nano.js");
    m.setTransport("prompt-api");
    expect(await m.ensureReady()).toBe(false);
    expect(globalThis.LanguageModel.create).not.toHaveBeenCalled();
    delete globalThis.LanguageModel;
  });
  it("app extraction says WHY the model did not run", async () => {
    globalThis.LanguageModel = { availability: async () => "downloadable", create: vi.fn() };
    vi.doMock("../src/ai/firebase.js", () => ({ publicRecallModel: () => null, firebaseConfigured: false, privateExtractionModel: () => null, firebaseOnDeviceRunner: async () => ({}) }));
    const nano = await import("../src/ai/nano.js");
    await nano.checkAvailability();
    const { extractSpec } = await import("../src/ai/extract.js");
    const r = await extractSpec(spec, { online: true, privacy: "private" });
    expect(r.nanoStatus).toBe("unavailable");
    expect(r.profile.unresolved.join(" ")).toMatch(/not downloaded yet \(downloadable\)/);
    delete globalThis.LanguageModel;
  });
});
