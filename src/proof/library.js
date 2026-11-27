// Verified label library: the approved, reviewer-verified text of every label the manufacturer prints.
// A supplier change is checked against these records instantly (no AI), so one on-device read of the new supplier spec
// is enough to see the impact on every affected product. A record is used for an instant check ONLY if it is verified
// and current; anything else is reported as NEEDS REVIEW. New artwork must pass the artwork gate before it becomes a
// record. SYNTHETIC demo data: the seed records below match the demo artwork images (fingerprints = SHA-256 of the PNG).

const SEAS = "SEASONING (SALT, MALTODEXTRIN, ONION POWDER, GARLIC POWDER, SPICES, YEAST EXTRACT, NATURAL FLAVOR, SILICON DIOXIDE)";
const SEED_VERIFIED = { by: "M. Rivera (QA, demo)", at: "2026-10-01T10:00:00Z", method: "Artwork proof check at approval" };

export const SEED_RECORDS = [
  { id: "LBL-1001@3", sku: "SKU-1001", product: "Crispy Garden Crackers", revision: 3, status: "approved",
    ingredient_list_printed: `INGREDIENTS: ENRICHED WHEAT FLOUR (WHEAT FLOUR, NIACIN, REDUCED IRON, THIAMINE MONONITRATE, RIBOFLAVIN, FOLIC ACID), SUNFLOWER OIL, ${SEAS}.`,
    contains_printed: "CONTAINS: WHEAT.", precautionary_printed: "MAY CONTAIN SESAME.",
    verified: SEED_VERIFIED, approvalBasedOn: { "FLOUR-02": "FLOUR-02@4", "OIL-03": "OIL-03@2", "SEAS-01": "SEAS-01@1" },
    artwork: { file: "/demo/LBL-1001-v3.png", sha256: "6746bfe9687abaf683ee5cf50619fe0ea479daf9fd36dae69a2830b625184c9a" } },
  { id: "LBL-1002@2", sku: "SKU-1002", product: "Herb Croutons", revision: 2, status: "approved",
    ingredient_list_printed: `INGREDIENTS: BREAD CRUMBS (WHEAT FLOUR, YEAST, SALT, SUGAR), SUNFLOWER OIL, ${SEAS.replace("NATURAL FLAVOR,", "NATURAL FLAVOR (MILK),")}.`,
    contains_printed: null, precautionary_printed: "MAY CONTAIN EGG AND SESAME.",
    verified: SEED_VERIFIED, approvalBasedOn: { "CRUMB-04": "CRUMB-04@1", "OIL-03": "OIL-03@2", "SEAS-01": "SEAS-01@1" },
    artwork: { file: "/demo/LBL-1002-v2.png", sha256: "289a2fad5d179672126c071bb9d834e38288ae7c0662d518bdedc03310a5293b" } },
  { id: "LBL-1003@1", sku: "SKU-1003", product: "Seasoned Pretzel Bites", revision: 1, status: "approved",
    ingredient_list_printed: `INGREDIENTS: WHEAT FLOUR, ${SEAS}.`, contains_printed: null, precautionary_printed: null,
    verified: SEED_VERIFIED, approvalBasedOn: { "FLOUR-02": "FLOUR-02@4", "SEAS-01": "SEAS-01@1" },
    artwork: { file: "/demo/LBL-1003-v1.png", sha256: "98480a2f17ccd079dcdee8adb556eb6a03f40029000fcaf63194ea4f2cacf57d" } },
];

const KEY = "labelgate.library.v1";
const loadLocal = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const saveLocal = (r) => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* storage unavailable: kept in memory */ } };
let local = typeof localStorage === "undefined" ? [] : loadLocal();

export const allRecords = () => [...SEED_RECORDS, ...local];
/** Latest record per SKU (highest revision). */
export function currentRecord(sku) {
  return allRecords().filter((r) => r.sku === sku).sort((a, b) => b.revision - a.revision)[0] ?? null;
}
/** Usable for an instant check only if verified by a named reviewer and approved/current. */
export function recordProblem(rec) {
  if (!rec) return "No label record exists for this product.";
  if (!rec.verified?.by || !rec.verified?.at) return "The label record has not been verified by a reviewer.";
  if (rec.status !== "approved") return `The label record is "${rec.status}", not approved.`;
  if (!rec.ingredient_list_printed) return "The label record has no ingredient declaration.";
  return null;
}
/** Add a new verified revision after the artwork gate and QA sign-off. */
/** What a new artwork reading changes compared with the verified record: shown to the reviewer to check against the image. */
export function labelDiff(rec, reading, sha = null) {
  const strip = (t) => String(t ?? "").replace(/^ingredients?\s*:\s*/i, "");
  const split = (t) => { const out = []; let depth = 0, cur = ""; for (const ch of strip(t)) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((x) => x.trim().replace(/[.。]+$/, "")).filter(Boolean); };
  const before = new Set(split(rec?.ingredient_list_printed).map((x) => x.toLowerCase()));
  const afterList = split(reading.ingredient_list_printed);
  const after = new Set(afterList.map((x) => x.toLowerCase()));
  const added = afterList.filter((x) => !before.has(x.toLowerCase()));
  const removed = split(rec?.ingredient_list_printed).filter((x) => !after.has(x.toLowerCase()));
  const containsBefore = rec?.contains_printed || null, containsAfter = reading.contains_printed || null;
  return { sameFile: !!(sha && rec?.artwork?.sha256 === sha), added, removed, containsChanged: (containsBefore || "") !== (containsAfter || ""), containsBefore, containsAfter };
}
export function addVerifiedRecord(rec) {
  local = [...local.filter((r) => r.id !== rec.id), rec];
  saveLocal(local);
  return rec;
}
export function resetLocalRecords() { local = []; saveLocal(local); reapprovals = []; saveRe(reapprovals); }

// Re-approval of an UNCHANGED verified label after a supplier change: the artwork is not touched (same fingerprint),
// so no new artwork gate is needed — but a named reviewer must still approve it for the new supplier revision.
const RKEY = "labelgate.reapprovals.v1";
const loadRe = () => { try { return JSON.parse(localStorage.getItem(RKEY) || "[]"); } catch { return []; } };
const saveRe = (r) => { try { localStorage.setItem(RKEY, JSON.stringify(r)); } catch { /* memory only */ } };
let reapprovals = typeof localStorage === "undefined" ? [] : loadRe();
export function reapprove(rec, itemId, itemRevision, by, state) {
  if (!by) throw new Error("A named reviewer is required.");
  if (recordProblem(rec)) throw new Error(recordProblem(rec));
  if (state !== "CHECKS_CLEAR_AWAITING_SIGNOFF") throw new Error("Only a label whose checks are clear can be re-approved.");
  const a = { recordId: rec.id, sha256: rec.artwork?.sha256 ?? null, itemId, itemRevision, by, at: new Date().toISOString() };
  reapprovals = [...reapprovals, a]; saveRe(reapprovals); return a;
}
/** The supplier revision this record's approval is based on, plus who re-approved it (if anyone). */
export function approvalFor(rec, itemId) {
  if (!rec) return { revision: null, reapproval: null };
  const re = reapprovals.filter((a) => a.recordId === rec.id && a.itemId === itemId && a.sha256 === (rec.artwork?.sha256 ?? null)).at(-1);
  return re ? { revision: re.itemRevision, reapproval: re } : { revision: rec.approvalBasedOn?.[itemId] ?? null, reapproval: null };
}

export async function sha256Hex(blob) {
  const buf = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
