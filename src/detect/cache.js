// Content-addressed result cache + in-flight de-duplication.
// Key = SHA-256 over the spec TEXT and every version that can change the answer
// (pipeline, dictionary, prompt, schema, transport/model id, mode). The hand-written spec.sha256 field is NOT used.
// Only successful model runs are cached: a timeout / error / "model not downloaded yet" result is never reused,
// so the spec is re-analysed once the model becomes ready.
import { VERSIONS } from "./pipeline.js";

export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function cacheKey(specText, { mode, transport }) {
  return sha256Hex(JSON.stringify({ text: specText, ...VERSIONS, mode, transport }));
}

export class DetectCache {
  constructor() { this.done = new Map(); this.inflight = new Map(); this.stats = { hits: 0, misses: 0, joined: 0 }; }

  /** @param {string} key  @param {() => Promise<{nanoStatus:string}>} compute */
  async get(key, compute) {
    if (this.done.has(key)) { this.stats.hits++; return { ...this.done.get(key), cached: true }; }
    if (this.inflight.has(key)) { this.stats.joined++; return { ...(await this.inflight.get(key)), joined: true }; }
    this.stats.misses++;
    const p = compute();
    this.inflight.set(key, p);
    try {
      const r = await p;
      if (r.nanoStatus === "ok" || r.nanoStatus === "not_used") this.done.set(key, r);
      return r;
    } finally {
      this.inflight.delete(key);
    }
  }
  clear() { this.done.clear(); }
}
