// Network evidence for the privacy claim, measured in the page: every request the browser makes to another origin
// while a private document is being read (Resource Timing API). Request bodies are not visible to the page, so this
// shows WHICH hosts were contacted, not what was sent. Paired with Firebase AI Logic's inferenceSource on every chunk.
const net = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) net.push({ url: e.name, at: performance.now() }); }).observe({ type: "resource", buffered: false }); } catch { /* not available */ }
const external = (u) => typeof location !== "undefined" && !u.startsWith(location.origin) && !u.startsWith("data:") && !u.startsWith("blob:");
export const classify = (u) => /recaptcha|gstatic\.com|firebaseappcheck/.test(u) ? "App Check (reCAPTCHA)"
  : /firebasevertexai|aiplatform|generativelanguage|firebaseml/.test(u) ? "MODEL ENDPOINT" : "other";
export const mark = () => performance.now();
/** Outside requests since `t0`, reduced to host + class (no query strings). */
export function requestsSince(t0) {
  return net.filter((n) => n.at >= t0 && external(n.url)).map((n) => ({ host: n.url.split("/")[2], class: classify(n.url) }));
}
