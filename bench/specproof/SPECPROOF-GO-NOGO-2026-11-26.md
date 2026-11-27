# Spec-to-Proof feasibility test: GO / NO-GO report (Nov 26, 2026)

**Verdict: the capability is proven, but the safety bar is NOT yet met → "GO to a second, fresh test after two design fixes".** This is not yet a GO to build the product.

## What was run
- **Model path:** the real Firebase AI Logic path (`firebase@13.4.0`), `InferenceMode.ONLY_ON_DEVICE`, image input (PNG/JPEG).
- **Machine:** Zain's laptop, Chrome 158, Windows, 8 cores, Intel integrated GPU.
- **Run:** 22 images, 1 repeat. Started 10:30:22Z, finished 10:42:09Z.
- **Data:** 20 cases written by Nemotron, rendered as images by me, plus 2 heavily degraded "stress" copies.
- **Locked before the run** (hashes in `FROZEN-specproof-v1.txt`): the cases, the answers, the renderer, the prompts, the decision rules and the scorer.
- **Changed before the run, based only on 2 separate dev images:** the decision no longer uses the model's own "legible" flag.
- **Pre-run answer-key dispute:** L08. Nemotron's answer says BLOCK, but the label prints "BUTTERMILK", which names milk. It is reported separately and not counted.
- **Division of labour:** Nano only transcribes the image. A fixed, simplified US FDA rule (scoped to this test) makes the decision.

## Results against GPT's pass criteria

| Criterion | Result | Pass? |
|---|---|---|
| Ingredient extraction ≥ 90% | **34/37 = 91.9%** (strict scorer) | ✅ |
| Allergens found per spec (EN / ES / JA) | **10/10 specs exactly right**, 0 missed, 0 extra | ✅ |
| Zero fabricated ingredients | **1 real fabrication:** S10 (Japanese) added "該当なし" ("none"), which is not printed. The strict scorer also counts 3 more items because they kept the printed list numbers ("1. Nonfat Milk"); those are printed on the image, so they are scorer artifacts, not inventions | ❌ |
| Every accepted ingredient has an exact source quote | 33/37 = 89.2%. The 4 misses are the same 3 list-number prefixes plus 1 more | ⚠️ |
| All deliberate label errors flagged (excluding disputed L08) | **3/4.** **L07 was missed:** Nano merged the "Contains: Wheat" line into the ingredient list and returned no Contains line, so the rule did not see an incomplete Contains statement and cleared the label | ❌ |
| No false print blocks on correct labels | **0 of 5** | ✅ |
| Unreadable images → NEEDS REVIEW, never silently clear | **Not really tested.** Nano still read both stress images correctly: U01 → wheat found (correct); U02 → BLOCK (correct for that label). Neither was silently cleared, but these images were not unreadable to Nano | ⚠️ |
| Privacy: zero content to cloud inference | **22/22 `inferenceSource = on_device`, 0 external requests** during inference | ✅ |
| Runtime | p50 **29.6 s**, p90 42.2 s, max 47.8 s, **0 failures** | recorded |

Other observations:
- **The model's "legible" flag** said false on 22/22 images, including perfect reads. It is useless; don't use it.
- **Transcription quality on labels:** mean similarity 0.951. There were small errors that didn't change the decision on these cases:
  - "SEASME" (L05, blurred);
  - Cyrillic "МАLTOДЕКТРИН" and "SOY SAUCE POWER" (L10, blurred);
  - a repeated "CHOCOLATE (…)" segment (L04, photo).
- **Spanish and Japanese** were read and translated correctly. Examples: "suero de leche" → milk whey, "lecitina de soja" → soy lecithin, "カゼインナトリウム" → caseinate sodium, "大豆" → soybeans. The dictionary then mapped all of them correctly.

## What this means
1. **The core premise holds.** Gemini Nano, on your laptop and fully on device, reads photographed, rotated and blurred spec sheets in English, Spanish and Japanese well enough that the allergen sets were right in 10/10 cases. A dictionary alone cannot do this at all with images. This is the essential AI job the product was missing.
2. **Two safety failures stop a full GO:**
   - **L07 (structure error):** the model put the Contains line in the wrong field, and an under-declared label was cleared. In a real factory this is exactly the failure we must never have.
   - **S10 (fabrication):** "該当なし" was invented. Harmless here, but it breaks the zero-fabrication rule.
3. **Small sample:** 20 cases, 1 repeat. This is screening, not validation.

## Proposed fixes (to be designed on separate dev images, then judged on a NEW frozen set; nothing is tuned on these 20)
- **F1. Contains line found by a rule, not by the model.** Search the *whole* transcription (ingredient field + Contains field) for a "Contains:" line. If the model's fields disagree with the rule, or a Contains line could be hidden, the result becomes **NEEDS REVIEW**, never CLEAR. This would have caught L07.
- **F2. Transcription hygiene.** Strip printed list numbers. Reject placeholder entries ("none", "N/A", "該当なし", "ninguno") as ingredients. Show the image and the transcription side by side so the reviewer confirms the *reading*, not the allergen.
- **F3. Stability.** 3 repeats per image. Any disagreement between repeats → NEEDS REVIEW.
- **F4. Harder stress images**, so the "unreadable → review" behaviour is actually exercised.

**Re-test:** Nemotron writes a fresh set (specproof-v2, about 20 cases including new error types), frozen before any run, with the same pass criteria. Estimated time: about 2–3 hours including the run on your laptop.

## Files
- `specproof-v1.json`: cases and answers (Nemotron)
- `images/`: rendered images
- `manifest.json`
- `FROZEN-specproof-v1.txt`
- `results-v1-run1.json`: raw model output
- `score-v1-run1.json`: full scoring
- `score.mjs`
- `src/specproof/*`: prompts, rules, harness
- **Live harness:** https://protean-booth-470411-r7.web.app/specproof.html
