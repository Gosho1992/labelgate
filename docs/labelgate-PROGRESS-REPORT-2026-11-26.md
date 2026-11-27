# LabelGate — Progress Report (Nov 25–26, 2026)

**Project:** LabelGate, our entry for the Google/Firebase **#BuildHybridAI** hackathon (Devpost). Deadline: Nov 30, 2:00 PM PT (Dec 1, 3:00 AM PKT).
**Live app:** https://protean-booth-470411-r7.web.app
**Status:** updated Thu Nov 26, 13:55 PKT. The Firebase-path benchmark **finished (60/60)**. The AWS VM has been **shut down** (stopped).

Every claim in this report carries one of these labels:
- ✅ **Verified working**: run for real and observed (screenshot or JSON evidence).
- 🟡 **Implemented, not runtime-verified**: the code exists and unit tests pass, but it has not been run for real.
- ⬜ **Not implemented**
- ❌ **Failed / blocked**

---

## 1. What LabelGate does (one paragraph)

**The problem:** a food manufacturer's supplier changes an ingredient. For example, a seasoning's "natural flavour" now "contains a milk‑derived carrier". Printed labels that were approved against the old spec become wrong, and an undeclared allergen can lead to a recall or an allergic reaction.

**What LabelGate does:** it compares the new supplier spec against every approved label that uses it, then marks each label **PRINT BLOCKED**, **NEEDS REVIEW** or **clear**, and shows the evidence.

**How the AI is used:**
- **Confidential supplier specs** are analysed **only on the device**, by Gemini Nano through Firebase AI Logic in `ONLY_ON_DEVICE` mode.
- **Public recall notices** are parsed **in the cloud**, through Firebase AI Logic in `ONLY_IN_CLOUD` mode, protected by App Check.

**Reporting sentence (use this wording, as the reviewer asked):**
> LabelGate combines deterministic allergen detection with on-device discovery of unfamiliar ingredients. Unfamiliar discoveries are presented for independent human verification, rather than being treated as confirmed allergen classifications.

We do **not** claim "100% recall" or "zero incorrect findings".

---

## 2. Timeline of work

| Step | What was done | Result |
|---|---|---|
| Go/no-go v1 (Nov 25) | Tested whether Gemini Nano runs at all on a cloud Windows VM (AWS m5.xlarge, CPU only) | GO. Nano runs (CPU, slow). `GONOGO-RESULTS-2026-11-25.md` |
| Phase A audit | Audited the codebase and planned the work | `PHASE-A-AUDIT.md` |
| B1 | One shared `detect()` pipeline for app and benchmark; dictionary frozen; content-hash cache; model lifecycle fix (`downloadable` → download) | ✅ Done, tests pass |
| B2 | 20 new held-out cases (v2), 3 arms × 3 repeats | Nano had prompt echo and wrong-category guesses. Decision: **demote Nano** (Nemotron agreed) |
| B2 direction (Decisions 1–4) | Nano is used **only for ingredient discovery**. Allergen shown as **UNKNOWN — verify**, model guess shown as "unreliable"; strict verbatim evidence; look-alike exclusions; v3 cases written by Nemotron | ✅ Done (Section 3) |
| Firebase checkpoint (Nov 26) | Real Firebase project, AI Logic, App Check, hosting, tests A–E on real Nano | ✅ A–E verified (Section 4) |
| Firebase-path v3 benchmark | Same frozen v3 cases through the Firebase transport | ✅ 60/60 done (Section 5) |

---

## 3. Detection design (after the B2 review)

1. **Dictionary** (deterministic): the **only** thing that can CONFIRM an allergen.
2. **Gemini Nano** (on-device): *discovers* ingredients the dictionary doesn't know. Its allergen guess is shown greyed out as "Model guess (unreliable) — not used for any decision".
3. **Strict evidence:** each Nano finding must quote the spec verbatim. A finding whose quote is not in the text is rejected and logged, and raises no review flag. The same rule applies to "absence" claims (e.g. "allergen statement missing").
4. **The human decides:** the reviewer picks the allergen from a blank dropdown (9 allergens + "Not a major allergen"). The UI never asks them to just confirm the model's guess.
5. **Look-alike exclusions:** coconut milk, cream of tartar and seed butter no longer trigger milk/dairy. Positive and negative tests exist for each.

### v3 benchmark (Prompt API transport, 20 Nemotron-authored cases × 3 repeats = 60 runs)

The case file was hashed **before** any run (`3543bd8f…`). We did no tuning on v3.

| Arm | Ingredient ID recall | ID precision | Silent misses | Wrong category | Review rate |
|---|---|---|---|---|---|
| Rules only | 0.933 | 0.875 | 3 (V08 "Glycine max") | 0 | 0.15 |
| Nano only | 1.0 | 0.627 | — | (guesses) | 0.95 |
| **Hybrid (the app)** | **1.0** | 0.64 | **0** | **0** | 0.53 |

**Honest reading of these results:**
- v3 is mostly made of ingredients the dictionary already knows. Hybrid's recall gain over rules comes mainly from **one case** (V08).
- **Broad discovery value is therefore not yet proven.**
- The 60 runs are **20 unique cases**. The repeats measure stability, not sample size.

---

## 4. Firebase checkpoint: tests A–E (real Gemini Nano, real Firebase)

**Setup:**
- Hardware: AWS Windows VM m5.xlarge (4 vCPU, **CPU only**, no GPU).
- Browser: Chrome 158 with the on-device model flag, model already downloaded.
- Evidence folder: `bench/results/firebase-evidence/`.

| Test | What it checks | Result | Evidence |
|---|---|---|---|
| **A** Model available | Specs analysed via Firebase AI Logic `ONLY_ON_DEVICE` | ✅ **5/5 specs ran on device**; Firebase reported `inferenceSource = on_device` for each. The UI shows "UNKNOWN — verify" cards from real model output | `A0`–`A3` screenshots |
| **B** Model unavailable | Same hosted app in Edge (no Nano) | ✅ "On-device analysis did NOT run for 5/5 specs … **rules-only result**"; cards say "Unfamiliar wording was not checked". Note: Edge shows "not supported", not Chrome's "unavailable" state | `B0`–`B2` |
| **C** Offline after init | Model loaded online, then DevTools → **Offline**, then analysis | ✅ Nano ran (`online:false`, status ok, 39.7 s), **0 network requests**. Offline was simulated in DevTools because the VM needs its network for RDP | `C-offline-report…json`, `C1` |
| **D** App Check | Cloud call without a token / with a bad token / with a real token | ✅ Without a token and with `invalid-token-123`: **HTTP 401** "Firebase App Check token is invalid." With a real reCAPTCHA Enterprise token on web.app: **success** (recall parsed: milk, lots 2611A–2614C, matched SKU-1001/1002/1003 locally) | `D1` (+ curl 401 log) |
| **E** Privacy canaries | Private spec full of unique canary strings; every request recorded | ✅ **PASS: 0 canary hits, 0 requests during the 40 s analysis.** DevTools shows only the reCAPTCHA scripts loaded at page start | `E-privacy-report…json`, `E1` |

**Bug found and fixed during testing:**
- **Bug:** the cloud recall call failed with "Must provide a model name". `ONLY_IN_CLOUD` needs an explicit model.
- **Fix:** we now set `gemini-3.5-flash-lite`, added a test for it, and redeployed.
- **Evidence:** `D0` (the error) and `D1` (after the fix).

---

## 5. Firebase-path v3 benchmark (✅ finished: 20 cases × 3 repeats = 60 runs)

This uses the same frozen v3 cases, now through the Firebase AI Logic transport (`ONLY_ON_DEVICE`). All 60 model calls returned status "ok".

| Arm | ID precision | ID recall | Classified correctly | Wrong category | Left UNKNOWN for human | Ambiguous flagged / overclaimed | False-positive allergens | Silent misses | Review rate | Rejected evidence / absence |
|---|---|---|---|---|---|---|---|---|---|---|
| Rules | 0.875 | 0.933 (42/45) | 42 | 0 | 0 | 3/0 of 9 | 6 (V16, V19 milk ×3) | 3 (V08 ×3) | 0.15 | 0 / 0 |
| Nano | 0.588 | 1.0 (45/45) | 41 | 0 | 4 | 5/1 of 9 | 5 (tree nut / wheat guesses) | 0 | 0.95 | 0 / 188 |
| **Hybrid** | 0.598 | **1.0 (45/45)** | 42 | **0** | 3 | 6/0 of 9 | 6 (V16, V19 milk) | **0** | 0.467 | 0 / 188 |

### Prompt API vs Firebase AI Logic (same frozen cases, same pipeline)

| Hybrid metric | Prompt API | Firebase AI Logic |
|---|---|---|
| ID recall | 1.0 | 1.0 |
| ID precision | 0.64 | 0.598 |
| Silent misses | 0 | 0 |
| Wrong category | 0 | 0 |
| Review rate | 0.533 | 0.467 |
| Stability, hybrid (cases identical over 3 repeats) | 13/20 | 13/20 |
| Stability, Nano | 9/20 | 7/20 |
| Latency p50 / p90 / max | 22.1 / 66.4 / 83.4 s | 27.1 / 69.7 / 74.7 s |

**Reading:**
- The headline behaviour holds on the real Firebase path: **all ingredients found, 0 silent misses, 0 wrong-category decisions**.
- Precision and Nano's stability are slightly lower. The run-to-run variation is of a similar size, so treat the small differences as noise, not a real effect.
- ⚠️ Only the summary table was saved (screenshot `F-v3-firebase-bench-60runs-final.jpg`). The per-run JSON could not be copied off the VM before shutdown.

### Latency comparison

| Transport | p50 | p90 | max | Hardware |
|---|---|---|---|---|
| Prompt API (v3, 60 runs) | 22.1 s | 66.4 s | 83.4 s | CPU VM |
| Firebase AI Logic (60 runs) | 27.1 s | 69.7 s | 74.7 s | CPU VM |
| GPU | ⬜ not measured | — | — | no GPU machine available |

Model initialisation on an already-downloaded model: **22–27 ms**. The first download time was not re-measured.

**Why Firebase may be slower:**
- The Firebase SDK creates a **new on-device session for every call**, so it re-processes the system prompt each time.
- Our Prompt API path clones a session that has the system prompt already loaded.
- We did not work around this, because the prompt is frozen.

---

## 6. The 13 deliverables requested by the reviewer

| # | Deliverable | Status |
|---|---|---|
| 1 | Firebase config | ✅ Project `protean-booth-470411-r7` (Spark, no billing), web app "LabelGate web", AI Logic with Gemini Developer API, Analytics off. Config lives in `.env.local` (never committed) |
| 2 | SDK version | ✅ `firebase@13.4.0` (`@firebase/ai` 3.1.0), module `firebase/ai` |
| 3 | Exact runtime call | ✅ `getGenerativeModel(ai, {mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams:{createOptions:{…initialPrompts:[system prompt]}, promptOptions:{responseConstraint: schema}}}).generateContent(userPrompt(spec))` |
| 4 | How ONLY_ON_DEVICE is enforced | ✅ (a) The private model is built only with `ONLY_ON_DEVICE`; the SDK has no cloud branch in this mode and throws if the model is unavailable. (b) A **privacy guard** rejects any response whose `inferenceSource ≠ on_device`, so the result is never used. (c) A test fails if any `PREFER_*` mode appears in the code. (d) Tests C and E prove it at runtime |
| 5 | App Check config | ✅ reCAPTCHA Enterprise provider (key restricted to `*.web.app` / `*.firebaseapp.com`), token TTL 1 h, auto-refresh. The debug provider is used only when `VITE_APPCHECK_DEBUG=1`; the production build has no debug token. Enforcement is proven by the 401 responses in test D. 🟡 The enforcement settings page in the console was not opened; the 401 is the evidence |
| 6 | Files changed | ✅ `src/ai/firebase.js`, `nano.js`, `extract.js`, `main.js`, `index.html`, `styles.css`, `privacy-test.html` + `src/privacy/run.js`, `bench.html` + `src/bench/run.js`, `vite.config.js`, `firebase.json`, `.firebaserc`, `.env.example`, `test/firebase.test.js`, `test/pipeline.test.js` |
| 7 | Tests A–E | ✅ All verified (Section 4) |
| 8 | Real screenshots | ✅ 12 screenshots in `bench/results/firebase-evidence/` |
| 9 | Network / canary evidence | ✅ Two JSON reports (online and offline) + DevTools screenshots |
| 10 | Latency | ✅ CPU (Section 5); ⬜ GPU not measured (no GPU hardware) |
| 11 | Tests / build | ✅ **83/83 unit tests pass**, `vite build` OK, deployed to Firebase Hosting |
| 12 | Limitations | See Section 7 |
| 13 | Frozen confirmation | ✅ Prompt, schema, dictionary, profile and pipeline files are byte-identical to the hashes recorded before v3 (`FROZEN-BEFORE-V3-2026-11-26.txt`). No tuning on v3 |

---

## 7. Known limitations (stated plainly)

1. **Broad discovery value is not proven.** v3 is mostly dictionary-familiar. The hybrid's gain over rules is driven mainly by V08 ("Glycine max").
2. **The canary test exposed a discovery miss.** Nano did **not** flag the invented ingredient "canaryquillium flour" (`possible: []`) in either the online or the offline run.
3. **"Vegetable protein" (V14) is missed** in all 3 Prompt API repeats.
4. **Review noise:** Nano sometimes flags ordinary ingredients (e.g. "High oleic sunflower oil", "rosemary extract") as UNKNOWN. The review burden is not yet shown to be acceptable.
5. **False positives:** oat milk and apple butter still trigger "milk" (V16, V19). The exclusions were not tuned on v3, by design.
6. **Stability:** results differ between repeats for some cases (hybrid 13/20 identical in the Prompt API run).
7. **Latency:** about 22–26 s per spec on CPU, up to about 83 s. GPU not tested.
8. **Unsupported absence claims:** many (188 in 60 runs) are rejected for having no valid quote. They are rejected safely, but this shows the model often makes ungrounded claims.
9. **Test B used Edge** (API missing), not Chrome with the model unavailable. Both lead to the same rules-only path in the code, but only the Edge case was observed.

### How the metrics are calculated (for external use)

- **Identification:** a gold ingredient counts as found (TP) if any finding's text span overlaps the gold term's span (including a bracket that directly follows it). FN = a gold ingredient with no overlapping finding. **Precision** = findings that overlap any gold ingredient ÷ all findings.
- **Classification** (per identified ingredient):
  - *correct*: an asserted allergen equals the gold allergen.
  - *wrong category*: an allergen is asserted, but not the gold one.
  - *left UNKNOWN*: no allergen asserted, so a human decides.
- **False-positive allergen:** a confirmed allergen that is not in the case's gold set.
- **Silent miss:** a gold allergen that is not confirmed **and** the case was not flagged for review.
- **Review rate:** runs flagged for human review ÷ all runs.

---

## 8. Accounts and housekeeping

- **Firebase:** billing-free project `protean-booth-470411-r7` ("My First Project"). The billed project and EduScholarshipAgent were **not touched**.
- **Firebase CLI:** logged in as zainzia8@gmail.com, in my workspace only.
- **AWS VM** nano-test (i-0ce2deb70e33edd2c) was **shut down from inside Windows** on Nov 26 at 13:52 PKT. On EC2 an OS shutdown stops the instance; the disk is kept. **Please confirm in the AWS console that it shows "Stopped"** (the console would not load from my side).
- A stray file `{versions}pipelinedetect-1,dictiona.txt` is in your Documents folder. Please delete it.
- No secrets were committed: `.env.local`, API keys and debug tokens all stayed out.

## 9. Next steps

1. The reviewer reviews this checkpoint. As instructed, no feature work until then.
2. Possible later (not started, needs your approval):
   - Test with a broader, harder unfamiliar-ingredient set, to address limitation 1.
   - Measure the review burden with a real reviewer.
