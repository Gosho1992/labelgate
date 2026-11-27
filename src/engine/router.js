// Hybrid router.
// Step 1 - HARD CONSTRAINTS (never traded off):
//   * PRIVATE content (formulas, supplier specs, evidence quotes) -> ON_DEVICE only.
//   * If on-device is unavailable for private content -> LOCAL_RULES_ONLY (dictionary) + NEEDS_REVIEW.
//     Never cloud, never PASS. Exception: content explicitly marked SYNTHETIC_DEMO (judge demo data)
//     may use the cloud, and the UI says so.
//   * PUBLIC content (public recall notices, public regulations) -> cloud allowed; on-device allowed.
//   * Offline -> cloud routes removed.
// Step 2 - among the routes that survive, pick by augmented weighted Tchebycheff over
//   normalised objectives (lower is better): quality loss, p90 latency, cost.
//   J(m) = max_k w_k (f_k(m) - z_k) + rho * sum_k w_k f_k(m)
// The router never changes what evidence is sufficient; it only chooses where inference runs.

export const ROUTE = { ON_DEVICE: "ON_DEVICE", CLOUD: "IN_CLOUD", LOCAL_RULES: "LOCAL_RULES_ONLY" };
export const PRIVACY = { PRIVATE: "private", PUBLIC: "public", SYNTHETIC_DEMO: "synthetic_demo" };

/** Default estimates; replaced at runtime by measured p90 latency / quality from the benchmark log. */
export const DEFAULT_ESTIMATES = {
  [ROUTE.ON_DEVICE]: { qualityLoss: 0.25, p90ms: 15000, cost: 0 },
  [ROUTE.CLOUD]: { qualityLoss: 0.1, p90ms: 3000, cost: 1 },
  [ROUTE.LOCAL_RULES]: { qualityLoss: 0.6, p90ms: 5, cost: 0 },
};

const TASK_WEIGHTS = {
  extract_spec: { qualityLoss: 0.7, p90ms: 0.2, cost: 0.1 },
  parse_recall: { qualityLoss: 0.5, p90ms: 0.3, cost: 0.2 },
};

/**
 * @param {{task:"extract_spec"|"parse_recall", privacy:string}} req
 * @param {{nanoAvailable:boolean, online:boolean, estimates?:Object}} env
 * @returns {{route:string, reason:string, candidates:Object[], degraded:boolean}}
 */
export function route(req, env) {
  const est = env.estimates || DEFAULT_ESTIMATES;
  let allowed = [];
  const notes = [];
  if (req.privacy === PRIVACY.PRIVATE) {
    if (env.nanoAvailable) allowed = [ROUTE.ON_DEVICE];
    else { allowed = [ROUTE.LOCAL_RULES]; notes.push("private content and on-device model unavailable: rules only, result will need review"); }
  } else {
    allowed = [ROUTE.ON_DEVICE, ROUTE.CLOUD];
    if (!env.nanoAvailable) allowed = allowed.filter((r) => r !== ROUTE.ON_DEVICE);
    if (!env.online) allowed = allowed.filter((r) => r !== ROUTE.CLOUD);
    if (!allowed.length) { allowed = [ROUTE.LOCAL_RULES]; notes.push("no model route available"); }
    if (req.privacy === PRIVACY.SYNTHETIC_DEMO) notes.push("synthetic demo data: cloud permitted");
  }
  const w = TASK_WEIGHTS[req.task] || TASK_WEIGHTS.extract_spec;
  const keys = Object.keys(w);
  const all = Object.values(est);
  const norm = {};
  for (const k of keys) {
    const vals = all.map((e) => e[k]);
    norm[k] = { min: Math.min(...vals), max: Math.max(...vals) };
  }
  const f = (r, k) => (norm[k].max === norm[k].min ? 0 : (est[r][k] - norm[k].min) / (norm[k].max - norm[k].min));
  const z = Object.fromEntries(keys.map((k) => [k, Math.min(...allowed.map((r) => f(r, k)))])); // utopia over allowed
  const rho = 0.01;
  const candidates = allowed.map((r) => {
    const terms = keys.map((k) => w[k] * (f(r, k) - z[k]));
    const J = Math.max(...terms) + rho * keys.reduce((s, k) => s + w[k] * f(r, k), 0);
    return { route: r, J: +J.toFixed(4) };
  }).sort((a, b) => a.J - b.J);
  const chosen = candidates[0].route;
  const reason = [
    req.privacy === PRIVACY.PRIVATE ? "hard constraint: private data stays on device" : `allowed: ${allowed.join(", ")}`,
    ...notes,
    `chosen by Tchebycheff score among allowed routes`,
  ].join("; ");
  return { route: chosen, reason, candidates, degraded: chosen === ROUTE.LOCAL_RULES };
}
