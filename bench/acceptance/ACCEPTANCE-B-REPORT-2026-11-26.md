# LabelGate — acceptance set B (6 fresh cases) and end-to-end library run, 26 Nov 2026

This is an integration check on synthetic documents, not a benchmark. It makes no accuracy claim.

## 1. What was tested

The six cases are the ones the reviewer asked for. The documents were rendered and their SHA-256 written to `FROZEN-B.txt` at 14:50 UTC. The expected outcomes were written to `EXPECTED-B-2026-11-26.json` before any model run on these images. The run started at 14:52 UTC.

| Case | What it tests | Documents |
|---|---|---|
| B1 | Facility wording | EN spec: "factory that also handles peanuts and tree nuts; shared equipment with soy". No allergen ingredient. Label: Pretzel Bites v1 |
| B2 | Placeholder behind an ES field label | ES spec with "Otros: no aplica" and skim milk powder. Label: Herb Croutons v2 |
| B3 | Correct label | Demo ES spec (milk). New Pretzel Bites artwork that declares milk |
| B4 | Real missing declaration | JA spec: 醤油粉末（大豆・小麦を含む）. Label: Herb Croutons v2 (no soy) |
| B5 | Multilingual ingredient, no allergen statement | ES spec: "Suero de leche en polvo" and "Lecitina de soja". Label declares WHEAT, MILK, SOY |
| B6a | Wrong-transcription case, real reading | Pretzel Bites artwork with a net-weight change only (milk still not declared) |
| B6b | Confident, deliberately wrong transcription | Same image. The reading was replaced by one that claims "NATURAL FLAVOR (MILK)" and "CONTAINS: WHEAT, MILK." |

**Path used:** the hosted app's real reading path (`acceptance-b.html` on protean-booth-470411-r7.web.app), on Zain's laptop in Chrome 158 (no dedicated GPU):

- Firebase AI Logic with `ONLY_ON_DEVICE` and streaming.
- The privacy guard on every chunk and on the final response.
- The app's rules (`us-fda-9-prototype v2026.11.26-1`) and the verified label library.

Each document was read once.

## 2. Results

**7 of 7 rows matched the pre-registered expectations. The rules were not changed after the run.**

| Case | Expected | Rules outcome | App shows before acks | Checks |
|---|---|---|---|---|
| B1 | CLEAR | CLEAR | CLEAR | peanut, tree nut and soy not required ✓ |
| B2 | CLEAR | CLEAR | NEEDS REVIEW (placeholder flagged; May-contain moved out) | milk required ✓; "no aplica" not an ingredient ✓ |
| B3 | CLEAR | CLEAR | CLEAR | ✓ |
| B4 | BLOCK | BLOCK (soy missing) | NEEDS REVIEW until the moved May-contain line is acknowledged, then BLOCK | soy missing ✓ |
| B5 | CLEAR | CLEAR | NEEDS REVIEW (Contains line moved out of the ingredient field) | milk ✓ and soy ✓ found from the Spanish words |
| B6a | BLOCK | BLOCK (milk missing) | BLOCK | ✓ |
| B6b | Rules clear the wrong reading, and the diff shows both invented changes | CLEAR on the wrong reading | — | diff shows "NATURAL FLAVOR (MILK)" ✓ and "CONTAINS: WHEAT, MILK." ✓; after correction → BLOCK ✓ |

### Readings

- **Model and source:** 10 on-device reads. `inferenceSource` was `on_device` on every chunk and on every final response.
- **Speed:** median 49 s, minimum 29 s, maximum 93 s (the B5 label).
- **Retries:** no empty reading, so the automatic retry was never used.
- **Transcriptions:** all 10 were correct for the decision-relevant fields.

  The only translation variation was 食塩 → "Sodium chloride", which is harmless. Raw outputs are in `results-B-run1-2026-11-26.json`.

### Network

During the 10 reads the browser made 3 external requests, all during the first read:

- `www.google.com/recaptcha/enterprise.js`
- `www.gstatic.com/.../recaptcha__en.js`
- `www.google.com/recaptcha/enterprise/anchor`

These come from App Check / reCAPTCHA Enterprise initialisation. There were no requests to a model endpoint (`firebasevertexai`, `aiplatform`, `generativelanguage`) and no other external requests.

Limitation: request bodies are not visible to the page. This shows which hosts were contacted. It does not inspect what was sent.

## 3. What B6b shows, and what it does not

The rules cannot detect a wrong reading by themselves: on the invented reading they say CLEAR. This is expected, and it is why a reviewer is required.

What the product does:

- In the artwork gate, it compares the reading with the verified record (LBL-1003@1).
- It shows both invented changes as "new or changed" for the reviewer to check against the image:
  - the seasoning line now containing "(MILK)";
  - "Contains" changed from none to "CONTAINS: WHEAT, MILK."

Whether a person actually catches it has not been tested yet. The person who wrote the case cannot test that. A blind reviewer test is deployed at `/?reviewer-test=1`:

- The artwork reading is replaced by the wrong one.
- The reviewer is told only that readings may contain errors.
- Nothing is saved to the label library.
- The history records "CAUGHT" or "MISSED".

## 4. Honest notes

- **Small and self-made.** The set is 6 cases on synthetic, cleanly rendered documents with a simulated phone-photo effect. They were written by the same AI that wrote the rules, and there was one run. This shows that the integration works. It does not show reliability on real supplier PDFs or photos.
- **Code changed after the freeze, before the run:**
  - `specChanges` (the wording diff shown in Gate 1) now reports "reworded" instead of removed + added. This was a fix for noise seen in the live demo ("yeast extract" vs "Brewer's yeast extract").
  - The artwork diff logic was moved unchanged from `ui.js` into `library.js` (`labelDiff`) so the harness could use it.
  - `readDocument` now also returns the observed `inferenceSource` values.

  `compare()`, `checkSpecReading` and `checkLabelReading`, which decide the outcomes, were not changed. The rules version string was not bumped.
- **B6b check wording.** The harness checks that the diff text contains each expected phrase. For "CONTAINS: WHEAT, MILK." the final full stop is stripped before matching.
- **Latency is still the main weakness.** It is 29–93 s per document on this laptop.

## 5. End-to-end library run (same day, real Gemini Nano, hosted app)

1. **Gate 1.** The Spanish supplier spec was read on device in 111 s (first run) and 60 s (second run). After the reviewer confirmed it, the impact on all three verified labels was computed in 8–13 ms:
   - Crispy Garden Crackers: BLOCK (milk);
   - Herb Croutons: CLEAR;
   - Pretzel Bites: BLOCK.

   "Hold print" was recorded.
2. **Gate 2.** The corrected crackers artwork was read on device in 53 s, giving "CONTAINS: WHEAT, MILK." and "NATURAL FLAVOR (MILK)" with no issues. After confirmation the result was CHECKS CLEAR. QA sign-off created the verified record LBL-1001@4 ("Approved for revision 2").
3. **New since then: re-approval of an unchanged label.** Herb Croutons was CLEAR but its approval was based on revision 1. It now shows "Re-approve label". This records a named reviewer's approval for revision 2, tied to the artwork fingerprint, and does not run the artwork gate because the artwork is unchanged. After re-approval: 2 approved for revision 2, 1 blocked.

Screenshots: `bench/results/proof-evidence/gate2-artwork-checks-clear-2026-11-26.jpg` and `impact-after-signoff-2026-11-26.jpg`.

## 6. Impact statistics: checked against the regulator

FSANZ "Food recall statistics" was checked on foodstandards.gov.au; the page was last updated 30 April 2026. It gives:

- **197** undeclared-allergen recalls in Australia in 2021–2025;
- **57%** of all recalls in 2024.

The page lists these root causes:

- "Supplier verification issues — ingredient changes by a supplier not being communicated";
- "Label error — … incorrect translation or reformulation of ingredients".

The older split of 79 packaging errors and 39 supplier-verification issues (2019–2023) appears in food-safety.com's report of FSANZ data. It is **no longer on the current FSANZ page**. If used, attribute it to that report, or use only the regulator's current figures.
