// Firebase AI Logic transport: ONLY_ON_DEVICE configuration and the inferenceSource privacy guard.
// These tests mock the SDK, so they prove OUR wiring, not the SDK's runtime behaviour (that is runtime-verified separately).
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = [];
let nextSource = "on_device";
vi.mock("firebase/app", () => ({ initializeApp: (cfg) => ({ cfg }) }));
vi.mock("firebase/app-check", () => ({ initializeAppCheck: () => ({}), ReCaptchaEnterpriseProvider: class { constructor(k) { this.k = k; } }, getToken: async () => ({ token: "x".repeat(40) }) }));
vi.mock("firebase/ai", () => ({
  InferenceMode: { ONLY_ON_DEVICE: "only_on_device", ONLY_IN_CLOUD: "only_in_cloud", PREFER_ON_DEVICE: "prefer_on_device" },
  InferenceSource: { ON_DEVICE: "on_device", IN_CLOUD: "in_cloud" },
  GoogleAIBackend: class {},
  getAI: () => ({}),
  getGenerativeModel: (_ai, params) => {
    calls.push(params);
    return {
      initializeDeviceModel: async (cb) => { cb?.(1); },
      generateContent: async () => ({ response: { inferenceSource: nextSource, text: () => JSON.stringify({ ingredients: [], absences: [] }) } }),
    };
  },
}));

beforeEach(() => { calls.length = 0; nextSource = "on_device"; vi.resetModules(); });

describe("Firebase AI Logic private extraction", () => {
  it("uses InferenceMode.ONLY_ON_DEVICE with the frozen prompt and schema, and no inCloudParams", async () => {
    const fb = await import("../src/ai/firebase.js");
    const { EXTRACT_SYSTEM } = await import("../src/detect/prompt.js");
    const { NANO_EXTRACTION_SCHEMA } = await import("../src/schemas.js");
    fb.privateExtractionModel();
    expect(calls[0].mode).toBe("only_on_device");
    expect(calls[0].inCloudParams).toBeUndefined();
    expect(calls[0].onDeviceParams.createOptions.initialPrompts[0].content).toBe(EXTRACT_SYSTEM);
    expect(calls[0].onDeviceParams.promptOptions.responseConstraint).toBe(NANO_EXTRACTION_SCHEMA);
  });
  it("runner returns parsed JSON when the SDK reports on_device", async () => {
    const fb = await import("../src/ai/firebase.js");
    expect(await fb.firebaseOnDeviceRunner("spec")).toEqual({ ingredients: [], absences: [] });
  });
  it("privacy guard: a response reporting in_cloud is rejected, never used", async () => {
    nextSource = "in_cloud";
    const fb = await import("../src/ai/firebase.js");
    await expect(fb.firebaseOnDeviceRunner("spec")).rejects.toThrow(/privacy guard/);
  });
  it("public recall model is HYBRID: PREFER_ON_DEVICE with an on-device schema and a named cloud fallback", async () => {
    const fb = await import("../src/ai/firebase.js");
    fb.publicRecallModel();
    expect(calls.at(-1).mode).toBe("prefer_on_device");
    expect(calls.at(-1).onDeviceParams.promptOptions.responseConstraint).toBeTruthy();
    expect(calls.at(-1).inCloudParams.model).toBe("gemini-3.5-flash-lite");
  });
  it("PREFER_ON_DEVICE appears exactly once (the public recall model) and only parseRecall uses that model", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/ai/firebase.js", import.meta.url), "utf8");
    const uses = [...src.matchAll(/mode:\s*InferenceMode\.(\w+)/g)];
    expect(uses.filter((m) => m[1].startsWith("PREFER_"))).toHaveLength(1);
    const i = src.search(/mode:\s*InferenceMode\.PREFER_/);
    expect(src.slice(i - 300, i)).toMatch(/export function publicRecallModel/);
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
    const users = walk(new URL("../src", import.meta.url).pathname).filter((f) => f.endsWith(".js") && !f.endsWith("firebase.js") && readFileSync(f, "utf8").includes("publicRecallModel("));
    expect(users.map((f) => f.split("/src/")[1])).toEqual(["ai/extract.js"]);
    const ex = readFileSync(new URL("../src/ai/extract.js", import.meta.url), "utf8");
    expect(ex.match(/publicRecallModel\(\)/g)).toHaveLength(1);
    expect(ex.slice(ex.indexOf("export async function parseRecall"))).toMatch(/publicRecallModel\(\)/);
  });
  it("private document images (Spec-to-Proof) use ONLY_ON_DEVICE with image input and no cloud params", async () => {
    const fb = await import("../src/ai/firebase.js");
    fb.privateDocumentModel("label", { type: "object" });
    expect(calls[0].mode).toBe("only_on_device");
    expect(calls[0].inCloudParams).toBeUndefined();
    expect(calls[0].onDeviceParams.createOptions.expectedInputs.some((i) => i.type === "image")).toBe(true);
  });
  it("privacy guard: a document reading reported as in_cloud is rejected", async () => {
    nextSource = "in_cloud";
    const fb = await import("../src/ai/firebase.js");
    await expect(fb.readPrivateDocument("spec", {}, "p", { mimeType: "image/png", data: "AA==" })).rejects.toThrow(/privacy guard/);
  });
});
