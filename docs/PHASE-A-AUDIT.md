# LabelGate — Phase A audit (Nov 25, 2026)

Inspected: labelgate/ (core.js, heldout.js, labelgate-gonogo.html, GONOGO-RESULTS-2026-11-25.md) and labelgate-app/ (all src, tests). `vitest`: 20/20 pass.

## 1. Structure
- **Benchmark harness** (`labelgate/labelgate-gonogo.html` + `core.js` + `heldout.js`): 20 tuning cases (S/M/N/C) + 10 held-out (H1–H10). Calls Chrome `LanguageModel` (Prompt API) **directly**, not through Firebase. Own system prompt, own schema `{contains, may_contain, needs_review, evidence[]}`, **frozen** dictionary.
- **App** (`labelgate-app/`, Vite, no backend):
  - `allergens/dictionary.js`: rules
  - `allergens/rulepack.js`: FALCPA R1–R4
  - `engine/profile.js`: merge plus span check
  - `engine/diff.js`: text diff and profile delta
  - `engine/gate.js`: impact, states, approval invalidation, sign-off
  - `engine/recall.js`
  - `engine/router.js`
  - `ai/firebase.js`: Firebase AI Logic, three models
  - `ai/extract.js`: orchestration, cache, audit log
  - `data/sample.js`: 6 specs, 4 formulas, 4 labels, 2 recalls
  - `main.js`: UI

## 2. How the benchmark was scored
- **rules** = frozen dictionary.
- **nano** = Nano output after the span check (`validateNano`). Unsupported claims are counted but not removed.
- **hybrid** = union of Nano and rules contains; REVIEW if Nano flags, rules flag ambiguity, the two disagree, or any claim is unsupported.
- Recall/precision are on "contains" only. **Silent miss** = an allergen missed with no REVIEW flag.
- Raw per-case JSON was **not downloaded** (it stays on the VM page). The report numbers were read off the screen.

## 3. Benchmark vs app — discrepancies (important)
| # | Issue | Effect |
|---|---|---|
| D1 | App uses the Firebase SDK `generateContent` + a different prompt and schema (claims with `assertion`), not the harness prompt/schema | **The app's Nano pipeline has never been measured.** The 0.78 / 0-silent-miss numbers do not transfer to it. |
| D2 | App dictionary was extended with held-out words (lactalbumin, crustacean, triticum, yolk, filberts, bonito, marzipan, "line also runs") | Verified: app rules now catch **10/10 held-out = contaminated**. In the app, Nano adds nothing visible on these cases. |
| D3 | App dictionary maps "cheese" → milk | H8 "Cheese alternative: cashew…" gives a false milk claim. |
| D4 | Proposed hero "natural flavor (contains a milk-derived carrier)" | Verified: the dictionary catches it via the word "milk". It is also benchmark case M1. **Not a valid Nano hero.** |
| D5 | `detectNano()` treats only `"available"` as usable | On the VM the state was `"downloadable"`. The app would route to rules-only and never trigger the download. |
| D6 | Cache key is the hand-written `spec.sha256` field + "v1", not a real hash of text + prompt + dictionary version | Risk of reusing a stale analysis. No in-flight de-dupe, no cancel. |
| D7 | Benchmark "hybrid" = union with REVIEW; app `buildProfile` = dictionary floor + span check + disagreement → unresolved | Similar intent, different code. Must be unified and re-benchmarked. |

## 4. What works (keep)
- Deterministic core:
  - dependency lookup (spec → formula → label)
  - FALCPA R1–R4
  - approval bound to spec revisions and invalidated on a new revision
  - states PRINT_BLOCKED / NEEDS_REVIEW / CLEAR / PASS
  - sign-off only from CLEAR
- Span validation: an unsupported model claim → rejected + unresolved (never silently dropped).
- Dictionary floor: the model cannot remove a dictionary hit.
- Router hard rule: private → ON_DEVICE only, else rules + review. Never cloud.
- UI: diff, findings cards, evidence highlight, struck approval, audit log with cloud bytes.
- Tests: 20 unit tests.

## 5. Incomplete / untested (not faked, but never run)
- **Firebase:** no project, no config, no App Check site key/enforcement. `privateExtractionModel` (ONLY_ON_DEVICE), `demoExtractionModel` (PREFER_ON_DEVICE, synthetic only) and `publicRecallModel` (ONLY_IN_CLOUD) have **never executed**. We don't know whether ONLY_ON_DEVICE needs network or App Check at call time, or whether `responseConstraint` passes through the SDK on Chrome 158.
- **Recall parsing:** cloud only, never executed.
- **Diff:** shows changed sentences only. No classification as new allergen / same allergen reworded / removed / wording-only (`profileDelta` exists but the UI doesn't use it).
- **Review flags:** listed per label as text. No grouping (allergen / evidence type / section / product / status) and no expandable evidence.
- **Progress:** only "spec i of n". No stages, cancel, or download progress.
- **Offline / privacy:** never tested with network inspection.
- **Not built:** Firestore audit metadata, Remote Config.

## 6. Simulated / demo-only
- All data is synthetic (labelled).
- `DEFAULT_ESTIMATES` in the router are guesses (p90 15 s on-device, 3 s cloud). They should be replaced by measured values (CPU 23 s p90 is now measured).
- Demo mode allows cloud for synthetic specs, labelled in the UI.

## 7. Must not break
- Dictionary-floor and span-check invariants.
- Approval invalidation.
- Never PASS with unresolved items.
- The 20 existing tests.
- The frozen benchmark files: `core.js`, `heldout.js`, and the results report.

## 8. Plan (proposed, in priority order)
**B1 Unify pipeline**
- One `detect(spec)` module used by both app and benchmark: dictionary → Nano candidates → span validation → normalization map → profile.
- Keep the app's claim schema (it has precautionary and negative assertions), and port the harness to it.

**B2 Fix contamination honestly**
- Split the dictionary into `DICT_FROZEN` (the benchmark baseline, unchanged) and the app dictionary.
- Write a **new held-out set H11–H30**, authored before any tuning, with wording absent from both dictionaries.
- Re-run all three arms on the app pipeline. Keep the old numbers alongside the new ones.

**B3 Delta classifier**
- Classify each change as new allergen / removed / same allergen reworded / precaution change / wording-only, using profile deltas plus the text diff.

**B4 Review grouping UI**
- Group by allergen × evidence status (verified / unsupported / disagreement / unspecified source / contradiction).
- Each group expands to the verbatim evidence and the affected products.

**C Hero example**
- Choose from the new held-out cases a wording that (a) the dictionary misses and (b) Nano gets right in at least 4 of 5 runs on the VM. Candidates are like H4 ("pasteurised hen's yolk", which caught the old frozen dictionary out), e.g. "caseinate-free … sodium caseinate" style phrasing.
- Verify before using it. Add the side-by-side "rules-only vs hybrid" panel.

**D Reliability**
- Accept `downloadable`/`downloading` and trigger the download with progress.
- One session per page, `clone()` per spec.
- Cache key = SHA-256(text) + prompt version + dictionary version + model id.
- In-flight de-dupe, timeout, cancel (AbortSignal), staged progress.
- Explicit "Nano did not run" state.

**E Firebase**
- Create the project (needs Zain: Google account + billing choice), web app config, reCAPTCHA Enterprise key, App Check enforcement for AI Logic.
- Run ONLY_ON_DEVICE / ONLY_IN_CLOUD for real and log `inferenceSource`.
- Document whether the benchmark's raw `LanguageModel` path is kept only as an availability probe. All inference in the app must go through Firebase AI Logic.

**F Privacy/offline**
- On the VM: DevTools Network capture + offline toggle across the 9 steps.
- Record exactly which requests happen and when.

**G Regression**
- vitest suite for the 15 listed categories, with a mocked Nano for deterministic tests.
- Live benchmark runs (on the VM) reported separately.

## Needs Zain
1. A Firebase project (Google account) — I can create it via the console if you're logged in.
2. OK to keep the nano-test VM running for the re-benchmark runs (~$0.2/hr).
