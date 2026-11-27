# AI reviewer stand-in for the blind reviewer test, 27 Nov 2026

**This is NOT a human test.** It is a separate AI model doing the reviewer's job, used as a stand-in until the human blind test is run. The human test (`/?reviewer-test=1`) is still pending.

## Setup
- **Reviewer model:** NVIDIA Nemotron 3 Nano Omni (free), in OpenRouter Chat. It is a different model family from Gemini Nano, which made the readings.
- **Image:** the real test artwork B6 (Seasoned Pretzel Bites). It is a design-only change, and **milk is not declared**. It was attached as a screenshot of the hosted image at 1000×432.
- **Readings tested:** the same four readings as the app's blind test (`src/proof/reviewer-test.js`).
- **One fresh chat per variant**, with the same instruction every time. The model was never told which, if any, reading was wrong:

  > You are a food-label QA reviewer. The attached image is new label artwork for Seasoned Pretzel Bites. An AI model transcribed the artwork as follows. Ingredient list: "…" Contains statement: "…" Compare the transcription with the image word by word. Answer first with exactly one word, CORRECT or INCORRECT. Then list every difference between the transcription and the image, and give the corrected text.

## Results

| Variant | Planted error | Verdict | Found the planted error? | Notes |
|---|---|---|---|---|
| V2 | invented "CONTAINS: WHEAT, MILK." only | INCORRECT | **Yes**: said the Contains statement does not appear on the label | Corrected text was right |
| V0 | none (control) | CORRECT | n/a: **correctly accepted** | |
| V3 | invented "(MILK)" in the ingredient list only | INCORRECT | **Yes**: said "(MILK)" is extra | Also claimed a "misplaced comma", which is wrong but harmless |
| V1 | both of the above | INCORRECT | **Yes**: found both | Also claimed a missing comma after "FLAVOR", which is wrong but harmless; corrected list was right |

**Summary:** 3 of 3 planted errors were caught and 1 of 1 correct readings was accepted. In 2 of 4 answers the model added a spurious punctuation remark.

**Excluded run:** one V3 attempt was sent without the image because the upload failed. The model answered INCORRECT with made-up differences ("SPICES → SPICE"). That run is excluded and was repeated with the image attached. It shows a model will "find" errors even when it cannot see the image, which is one reason this stand-in is weak evidence.

## What this does and does not show
- It shows that on this artwork, the planted milk errors are visible to a reviewer who actually compares the image with the reading. The error is catchable, not hidden.
- It does **not** show that human QA reviewers catch it. A person can tick a highlighted difference without looking. In the app, the keyboard flow lets a reviewer tick and confirm with two Enter presses. The app forces attention to each difference; it cannot force verification.
- It is 4 runs on one synthetic image, with no repeats.
- Raw answers are copied above from the OpenRouter chat page.
