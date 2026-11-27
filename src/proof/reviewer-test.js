// Blind reviewer test (?reviewer-test=1). Tests the HUMAN step of the artwork gate, not the model.
// Each run shows the same real artwork image (acceptance case B6: Seasoned Pretzel Bites, net-weight change, milk NOT
// declared) with one of four artwork readings, chosen at random:
//   V0 control — the correct reading (nothing to catch)
//   V1 — invented "NATURAL FLAVOR (MILK)" in the ingredient list AND invented "CONTAINS: WHEAT, MILK."
//   V2 — invented "CONTAINS: WHEAT, MILK." only
//   V3 — invented "NATURAL FLAVOR (MILK)" only
// The tester is told only that readings may contain errors. Results are stored in this browser and shown only on
// /?reviewer-test=results, never to the tester. Nothing is written to the label library in test mode.
// The supplier-spec reading used in the test is a REAL Gemini Nano output of /demo/SEAS-01-rev2-es.jpg, recorded in
// acceptance run B (bench/acceptance/results-B-run1-2026-11-26.json), pre-loaded so each run takes minutes, not a minute of waiting.

export const TEST_ART = { file: "/acceptance/B6-label-pretzel-netwt.png", note: "new artwork from the design agency (net weight change)" };

const ING_OK = "INGREDIENTS: WHEAT FLOUR, SEASONING (SALT, MALTODEXTRIN, ONION POWDER, GARLIC POWDER, SPICES, YEAST EXTRACT, NATURAL FLAVOR, SILICON DIOXIDE).";
const ING_MILK = ING_OK.replace("NATURAL FLAVOR,", "NATURAL FLAVOR (MILK),");
export const VARIANTS = {
  V0: { error: false, reading: { ingredient_list_printed: ING_OK, contains_printed: null, may_contain_printed: null } },
  V1: { error: true, reading: { ingredient_list_printed: ING_MILK, contains_printed: "CONTAINS: WHEAT, MILK.", may_contain_printed: null } },
  V2: { error: true, reading: { ingredient_list_printed: ING_OK, contains_printed: "CONTAINS: WHEAT, MILK.", may_contain_printed: null } },
  V3: { error: true, reading: { ingredient_list_printed: ING_MILK, contains_printed: null, may_contain_printed: null } },
  // V4 (added 27 Nov, v2 test): a DIFFERENT, real picture (B3: corrected Pretzel Bites artwork that really declares milk)
  // with a CORRECT reading. Same differences from the old label as V1, but here the computer is right — a control that
  // detects reviewers who reject every change without looking.
  V4: { error: false, truthMilk: true, image: "/acceptance/B3-label-pretzel-correct.png", reading: { ingredient_list_printed: "INGREDIENTS: WHEAT FLOUR, SEASONING (SALT, MALTODEXTRIN, ONION POWDER, GARLIC POWDER, SPICES, YEAST EXTRACT, NATURAL FLAVOR (MILK), SILICON DIOXIDE).", contains_printed: "CONTAINS: WHEAT, MILK.", may_contain_printed: null } },
};
export const imageFor = (variant) => VARIANTS[variant].image ?? TEST_ART.file;
export function pickVariant(rand = Math.random) { const k = Object.keys(VARIANTS); return k[Math.floor(rand() * k.length)]; }

// Real Nano output (acceptance run B, 66.8 s on device) for the demo Spanish spec.
export const RECORDED_SPEC_RAW = {"language": "es", "ingredients": [{"printed": "Sal", "english": "Salt"}, {"printed": "Maltodextrina", "english": "Maltodextrin"}, {"printed": "Cebolla en polvo", "english": "Powdered onion"}, {"printed": "Ajo en polvo", "english": "Powdered garlic"}, {"printed": "Especias", "english": "Spices"}, {"printed": "Extracto de levadura", "english": "Yeast extract"}, {"printed": "Aroma natural (contiene un portador derivado de la leche)", "english": "Natural flavor (contains a carrier derived from milk)"}, {"printed": "Dióxido de silicio", "english": "Silicon dioxide"}], "allergen_statement_printed": "Contiene: leche. Elaborado en una planta que también procesa sésamo.", "allergen_statement_english": "Contains: milk. Processed in a facility that also processes sesame."};

const norm = (t) => String(t ?? "").toUpperCase().replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
const claimsMilk = (x) => /MILK/.test(norm(x.contains_printed)) || /\(MILK\)/.test(norm(x.ingredient_list_printed));

/** Classify what the reviewer confirmed. */
export function classify(variant, confirmed, unsure = false) {
  const v = VARIANTS[variant];
  if (unsure) return { outcome: "FLAGGED_NEEDS_REVIEW", edited: false }; // safe: not printed without a closer look
  const edited = norm(confirmed.ingredient_list_printed) !== norm(v.reading.ingredient_list_printed) || norm(confirmed.contains_printed) !== norm(v.reading.contains_printed);
  const milk = claimsMilk(confirmed);
  if (v.error) return { outcome: milk ? "MISSED" : "CAUGHT", edited };
  if (milk !== Boolean(v.truthMilk)) return { outcome: v.truthMilk ? "FALSE_ALARM_REMOVED_MILK" : "FALSE_ALARM_ADDED_MILK", edited };
  return { outcome: edited ? "EDITED_CORRECT_READING" : "CORRECTLY_ACCEPTED", edited };
}

const KEY = "labelgate.reviewertest.v1";
export const loadRuns = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
export function saveRun(run) { const r = [...loadRuns(), run]; try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* memory only */ } return r; }

export function resultsHTML(esc) {
  const runs = loadRuns();
  const ui = (r) => r.ui || (r.page ? "v1 ticks" : "app");
  const groups = [...new Set(runs.map(ui))];
  const line = (g) => { const rs = runs.filter((r) => ui(r) === g), err = rs.filter((r) => VARIANTS[r.variant]?.error), ctl = rs.filter((r) => !VARIANTS[r.variant]?.error);
    const caught = err.filter((r) => r.outcome === "CAUGHT").length, ok = ctl.filter((r) => r.outcome === "CORRECTLY_ACCEPTED").length, fl = rs.filter((r) => r.outcome === "FLAGGED_NEEDS_REVIEW").length;
    return `<p><b>${esc(g)}:</b> planted errors caught <b>${caught} / ${err.length}</b> · correct readings accepted <b>${ok} / ${ctl.length}</b>${fl ? ` · flagged "can't tell" (needs review): ${fl}` : ""} · testers: ${new Set(rs.map((r) => r.tester)).size}</p>`; };
  return `<h2>Blind reviewer test — results (this browser)</h2>
  ${groups.map(line).join("")}
  <p class="muted small">A usability observation on one synthetic case, not a reliability measure. Variants: V0 control (correct reading, no change); V1 milk in ingredients + Contains; V2 Contains only; V3 ingredients only; V4 control on a different picture that really adds milk (computer is right). Rows marked "v1" used tick boxes; "v2" used A/B questions.</p>
  <table class="ev"><thead><tr><th>#</th><th>When</th><th>Page</th><th>Tester</th><th>Variant</th><th>Outcome</th><th>Edited</th><th>Seconds on artwork</th><th>Confirmed "Contains"</th></tr></thead><tbody>
  ${runs.map((r, i) => `<tr><td>${i + 1}</td><td>${new Date(r.at).toLocaleString()}</td><td>${esc(r.ui || (r.page ? "v1 ticks" : "app"))}</td><td>${esc(r.tester || "—")}</td><td>${r.variant}</td><td><b>${r.outcome}</b></td><td>${r.edited ? "yes" : "no"}</td><td>${r.seconds ?? "—"}</td><td>${esc(r.confirmed?.contains_printed ?? "none")}</td></tr>`).join("")}
  </tbody></table>
  <details><summary>Raw JSON</summary><pre style="white-space:pre-wrap">${esc(JSON.stringify(runs, null, 1))}</pre></details>
  <p><a href="/app/?reviewer-test=1">Start a run</a></p>`;
}
