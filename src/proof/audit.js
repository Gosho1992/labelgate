// Tamper-evident review log. Every decision is appended with the SHA-256 of its own content plus the hash of the
// previous entry, so changing, removing or reordering any earlier entry breaks the chain from that point on.
// This is tamper-EVIDENT, not signed: anyone with access to the browser storage could rebuild a whole new chain.
// A production system would anchor the chain head on a server or sign entries with a key held by the QA system.

export const GENESIS = "0".repeat(64);

/** Deterministic JSON (sorted keys) so the same entry always hashes the same. */
export function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
}
export async function sha256Text(t) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const body = (e) => { const { hash, ...rest } = e; return rest; };

/** Return a new entry chained to `prevHash`. */
export async function chainEntry(entry, prevHash = GENESIS) {
  const e = { ...entry, prevHash };
  return { ...e, hash: await sha256Text(canonical(e)) };
}

/** Check the chain. Entries recorded before the chain existed (no hash) are reported as legacy, not as tampering. */
export async function verifyChain(entries) {
  let prev = GENESIS, n = 0, legacy = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.hash) { legacy++; continue; }
    if (e.prevHash !== prev) return { ok: false, brokenAt: i, reason: "link to the previous entry does not match", checked: n, legacy };
    if (await sha256Text(canonical(body(e))) !== e.hash) return { ok: false, brokenAt: i, reason: "entry content was changed", checked: n, legacy };
    prev = e.hash; n++;
  }
  return { ok: true, checked: n, legacy, head: prev };
}

const CSV_COLS = ["at", "caseId", "action", "by", "sku", "product", "label", "state", "supplierRevision", "documentSha256", "ruleset", "prevHash", "hash", "details"];
const cell = (v) => { const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCSV(entries) {
  const known = new Set(CSV_COLS);
  return [CSV_COLS.join(","), ...entries.map((e) => {
    const details = Object.fromEntries(Object.entries(e).filter(([k]) => !known.has(k) && k !== "sha256"));
    return CSV_COLS.map((c) => c === "details" ? cell(details) : c === "documentSha256" ? cell(e.sha256 ?? e.documentSha256) : cell(e[c])).join(",");
  })].join("\n");
}
