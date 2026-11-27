// App orchestration for one spec revision. Uses the SAME detect() pipeline as the benchmark.
import { route, ROUTE, PRIVACY } from "../engine/router.js";
import { detect, MODE } from "../detect/pipeline.js";
import { DetectCache, cacheKey } from "../detect/cache.js";
import { activeRunner, getTransport, isReady, nano } from "./nano.js";
import { publicRecallModel, RECALL_INSTRUCTION, RECALL_CLOUD_MODEL } from "./firebase.js";

export const audit = []; // in-memory audit log (metadata only, never spec text)
const log = (e) => { audit.push({ at: new Date().toISOString(), ...e }); return e; };
export const cache = new DetectCache();

/**
 * @param {import("../schemas.js").SupplierSpecRevision} spec
 * @param {{online:boolean, privacy:string, timeoutMs?:number, signal?:AbortSignal}} env
 */
export async function extractSpec(spec, env) {
  const nanoAvailable = isReady();
  const r = route({ task: "extract_spec", privacy: env.privacy }, { ...env, nanoAvailable });
  // Private specs: on-device (Firebase AI Logic, ONLY_ON_DEVICE) or a clearly labelled rules-only result. Never cloud.
  const runner = r.route === ROUTE.ON_DEVICE ? activeRunner() : null;
  const transport = runner ? getTransport() : "none";
  const key = await cacheKey(spec.text, { mode: MODE.HYBRID, transport });
  const out = await cache.get(key, async () => {
    const d = await detect(spec, { mode: MODE.HYBRID, runner, timeoutMs: env.timeoutMs ?? 90000, signal: env.signal });
    // Explicit, never silent: say WHY the model did not run.
    if (!runner) {
      const why = nano.state === "downloadable" || nano.state === "downloading"
        ? `on-device model not downloaded yet (${nano.state})`
        : `on-device model ${nano.state}`;
      const msg = `Rules-only result: ${why}. Unfamiliar wording was not checked.`;
      const i = d.profile.unresolved.findIndex((u) => u.startsWith("On-device extraction did not run"));
      if (i >= 0) d.profile.unresolved[i] = msg; else d.profile.unresolved.push(msg);
    }
    return d;
  });
  log({ type: "extract", specId: spec.id, route: runner ? ROUTE.ON_DEVICE : ROUTE.LOCAL_RULES, reason: r.reason,
    inferenceSource: runner && out.nanoStatus === "ok" ? "on_device (verified)" : null, transport, nanoStatus: out.nanoStatus, ms: out.ms, error: out.error,
    cached: !!out.cached, cloudBytes: 0, key: key.slice(0, 12) });
  return { profile: out.profile, route: r, nanoStatus: out.nanoStatus, ms: out.ms, cached: !!out.cached };
}

/**
 * PUBLIC recall notice -> structured terms. Hybrid (PREFER_ON_DEVICE): runs on Gemini Nano when this device has it,
 * otherwise Firebase AI Logic falls back to Gemini in the cloud. Returns where it actually ran.
 */
export async function parseRecall(notice, env) {
  const r = route({ task: "parse_recall", privacy: PRIVACY.PUBLIC }, { ...env, nanoAvailable: isReady() });
  const t0 = performance.now();
  const result = await publicRecallModel().generateContent(`${RECALL_INSTRUCTION}\n\nPublic recall notice:\n${notice.text}`);
  const terms = JSON.parse(result.response.text());
  const inferenceSource = result.response.inferenceSource ?? null;
  const ms = Math.round(performance.now() - t0);
  log({ type: "recall_parse", noticeId: notice.id, route: r.route, inferenceSource, ms, cloudBytes: inferenceSource === "in_cloud" ? notice.text.length : 0, privateBytes: 0 });
  return { terms, inferenceSource, ms, model: inferenceSource === "in_cloud" ? RECALL_CLOUD_MODEL : "Gemini Nano (on this device)" };
}
