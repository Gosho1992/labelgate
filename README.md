# LabelGate

**A supplier quietly changes an ingredient. Three products use it. Two of their approved labels no longer declare milk. LabelGate catches that before the labels are printed.**

Gemini Nano reads the supplier's photographed spec (English, Spanish or Japanese) **on the device**, because supplier specs and formulas are confidential. Fixed rules then check every affected label against a verified label library in milliseconds. A named QA reviewer confirms each reading and signs off each new artwork.

Built for the Google / Firebase **#BuildHybridAI** hackathon (Web / Chrome). **All companies, products and documents in this repository are synthetic.** LabelGate is a prototype for decision support; it is not a regulatory compliance certification.

**Live app:** https://protean-booth-470411-r7.web.app

## Why this matters
Undeclared allergens are one of the main reasons food is recalled. Food Standards Australia New Zealand (FSANZ) counts **197 undeclared-allergen recalls in Australia in 2021–2025**, and **57% of all recalls in 2024** ([FSANZ food recall statistics](https://www.foodstandards.gov.au/food-recalls/recallstats), page updated 30 April 2026). Two of the root causes it names are exactly this workflow:
- a supplier changes an ingredient and the change is not communicated;
- a label error from incorrect translation or reformulation of ingredients.

## Try it in 2 minutes
Open the live app in **Chrome on a desktop** (Chrome 148 or later, with Gemini Nano available on the device) and click **▶ Start the 2-minute demo**. A guide bar takes you through it one step at a time, highlighting the button to press. The same steps in writing:
1. **Gate 1:** click **Use demo document**. A photographed Spanish supplier spec is read on your device; the text appears as it streams. Check the reading against the photo and click **Confirm this reading**. The impact table shows which of the three products are now **PRINT BLOCKED**, with the evidence.
3. **Gate 2:** pick a blocked product, click **Use demo document** for its corrected artwork, answer the "which wording is printed?" questions by looking at the image, confirm, then sign off. A new verified label record is created.
3. **Recall notices tab:** read a public recall notice with hybrid inference (on device, or cloud fallback), then match it against your private formulas locally.

The page tells you if your device cannot run Gemini Nano. Without it you can still type a reading yourself (clearly marked "no AI") and the recall notice falls back to the cloud.

## How Firebase AI Logic is used (hybrid by data class)

| Data | Example | Firebase AI Logic mode | Why |
|---|---|---|---|
| **Private** document images | supplier spec photo, label artwork | `InferenceMode.ONLY_ON_DEVICE`: image + text, `en/es/ja` | Trade secrets. No cloud fallback. The answer is **rejected** unless `inferenceSource` is `on_device` on every streamed chunk and on the final response. |
| **Private** text specs | spec text in the second tab | `InferenceMode.ONLY_ON_DEVICE` | Same rule |
| **Public** recall notices | a published recall | `InferenceMode.PREFER_ON_DEVICE`: Gemini Nano if available, otherwise `gemini-3.5-flash-lite` in the cloud | Nothing confidential, so the hybrid fallback is safe. The badge shows where it ran (`on_device` / `in_cloud`). |

- **App Check** (reCAPTCHA Enterprise) protects the cloud path.
- When the page opens, the app **warms up** Gemini Nano with a fixed one-word prompt. No document content is used.
- After each private read, the app shows **privacy evidence**: `inferenceSource` for every chunk, plus every request the page made to another server during the read (Resource Timing API).

Measured results:
- **Hybrid fallback:**
  - Chrome with Nano: `on_device`.
  - The Claude desktop app's built-in browser, which has the Prompt API but `unavailable` Nano: `in_cloud` in 2.6 s, App Check OK.
- **Privacy evidence during reads:** no outside requests. When there were any, they were only App Check / reCAPTCHA. The page cannot see request bodies; it shows which servers were contacted.

## Safety design: the AI reads, rules decide, a person confirms
- **Gemini Nano only transcribes.** It never decides whether a label is safe.
- **Fixed rules decide.** Simplified US major-allergen check, 9 allergens. An allergen counts as declared by its common name in the ingredient list, or by a complete "Contains" statement. "May contain" never counts as a declaration.

  Allergen words are matched in the **original language** too (leche, soja, 乳, 大豆, 小麦…), so a wrong English translation does not hide an allergen. Look-alikes are excluded (leche de coco, 乳化剤).
- **Nothing is decided on an unconfirmed reading.**
  - An empty reading is retried once, then blocks confirmation.
  - Placeholders ("Otros: no aplica"), "Contains" lines inside the ingredient field, and "may contain" lines are flagged for the reviewer.
  - Facility / shared-equipment wording is not treated as an ingredient.
- **Differences become questions, not tick boxes.** Before an artwork reading can be confirmed, every place where the AI reading differs from the approved label becomes a neutral question: "Which one does the artwork image say?" Both answers (the approved wording and the AI's wording) are shown in random order, styled identically, trimmed to the part that differs, and nothing is pre-selected. "I can't tell from the artwork image" sends the artwork to NEEDS REVIEW. The reviewer's answer, not the AI, decides the confirmed text.

  This replaced tick boxes after a human test in which 2 of 2 testers ticked through 6 of 6 planted errors (see Evidence).
- **Three outcomes, never "approved by AI":**
  - `PRINT BLOCKED`;
  - `NEEDS REVIEW`;
  - `CHECKS CLEAR — AWAITING QA SIGN-OFF`.
- **Verified label library:** each record holds the label text, the artwork's SHA-256, the reviewer, the date, and the supplier revision its approval was based on. A supplier change invalidates the old approval. An unchanged label can be re-approved for the new revision (tied to its fingerprint). New artwork always goes through Gate 2.
- **Tamper-evident review log.** Every decision stores the SHA-256 of its content and of the previous entry, so editing, deleting or reordering an entry is detected. It can be exported as JSON or CSV. This is hash-linked, **not digitally signed**, and it lives in the browser.

## Evidence (honest scope)
All numbers come from Zain's laptop: Chrome 158, Intel integrated GPU, no dedicated GPU.

| What | Result | Where |
|---|---|---|
| Acceptance set B: 6 fresh synthetic cases (facility wording, ES placeholder, correct label, missing soy from a JA spec, ES whey/soy without a statement, deliberately wrong transcription). Expected outcomes and image hashes frozen before the run. | 7/7 checks as pre-registered. 10/10 on-device reads, all `on_device`. Median 49 s per document (29–93 s). | [`bench/acceptance/ACCEPTANCE-B-REPORT-2026-11-26.md`](bench/acceptance/ACCEPTANCE-B-REPORT-2026-11-26.md) |
| Impact check of all affected labels after one confirmed supplier reading | 8–13 ms (fixed rules, no AI) | live runs |
| Model load | cold 23.8 s + 14.2 s first prompt; warm 9 ms + 1.6 s (hence the warm-up) | [`bench/results/UPDATE-2026-11-26-evening.md`](bench/results/UPDATE-2026-11-26-evening.md) |
| Recall notice, hybrid | on device 43 s (warm); cloud fallback 2.6 s | this README |
| AI reviewer stand-in (**not a human test**): a different model checked the 4 blind-test readings against the image | 3/3 planted errors caught, 1/1 correct reading accepted | [`bench/acceptance/AI-REVIEWER-STANDIN-2026-11-27.md`](bench/acceptance/AI-REVIEWER-STANDIN-2026-11-27.md) |
| **Human blind test 1** (2 people, tick-box design) | **0/6 planted errors caught**, 2/2 correct readings accepted. They ticked to move on. The design was replaced by A/B questions. | [`bench/reviewer-test/HUMAN-TEST-1-REPORT-2026-11-27.md`](bench/reviewer-test/HUMAN-TEST-1-REPORT-2026-11-27.md) |
| **Human blind test 2** (1 new person, A/B questions) | **3/3 planted errors caught**, 5/6 answers correct. In the control round (milk really added) one real change was wrongly rejected. One person: a usability observation, not proof. | [`bench/reviewer-test/HUMAN-TEST-2-REPORT-2026-11-27.md`](bench/reviewer-test/HUMAN-TEST-2-REPORT-2026-11-27.md) |
| **Live reading glitches seen while filming the demo (27 Nov)** | Gemini Nano wrote "MALTODEXTRIN" as `MALTOДЕКТРИН` (with Cyrillic letters) in one read and as `MACTODEXTRIN` in the next. The A/B question showed the reviewer the misspelled wording, and the reviewer corrected it before confirming. A new check now flags any word that mixes alphabets as a reading problem that must be resolved. | [`bench/results/proof-evidence/nano-mixed-script-glitch-2026-11-27.png`](bench/results/proof-evidence/nano-mixed-script-glitch-2026-11-27.png), `test/mixed-script.test.js` |
| **No Gemini Nano on the device** (private document) | The read **stops**: "On-device AI is not available here — type the reading instead". **No outside requests**; no cloud fallback for private documents. | tested in a browser with Nano unavailable |
| **Offline** (Wi-Fi off after the page was open) | Spec read on device 67 s (`on_device`, no outside requests); impact 6 ms; public recall on device 39 s | [`bench/results/OFFLINE-TEST-2026-11-27.md`](bench/results/OFFLINE-TEST-2026-11-27.md) |
| Automated tests (rules, original-language matching, retry, audit chain, hybrid wiring, UI flow) | 151 passing | `npm test` |
| **Experimental Android check** (native Kotlin, Firebase AI Logic `ONLY_ON_DEVICE`, real Samsung phones via Samsung Remote Test Lab) | **Galaxy S26, Android 16:** Gemini Nano (`nano-v3`) read the same spec photos **on the phone** (`ON_DEVICE`) with **0 bytes sent**. The full Spanish reading took 12.2 s and matches the Chrome reading word for word. **Galaxy S25 and S26+ lab units:** Nano unavailable (AICore missing), so the read stopped and nothing was sent to the cloud. | [`bench/android/ANDROID-NANO-CHECK-2026-11-27.md`](bench/android/ANDROID-NANO-CHECK-2026-11-27.md) |

## Experimental Android check (not part of the submission)
The submitted product is the Web/Chrome app. To see whether LabelGate's most sensitive step, reading a confidential supplier spec photo with no cloud fallback, works on Android, we built a small native app in [`android-experimental/`](android-experimental/). It uses the same Firebase AI Logic API (`InferenceMode.ONLY_ON_DEVICE`) and the same prompt. We ran it on real Samsung phones through Samsung Remote Test Lab.

| Phone | Gemini Nano | Private photo read | Sent to the cloud |
|---|---|---|---|
| Galaxy S26, Android 16 | available after a 4.2 GB model download | on the phone; full Spanish reading in 12.2 s, identical to the Chrome reading | 0 bytes |
| Galaxy S25 (one lab unit), Android 16 | not available (AICore missing or too old) | stopped with an error | nothing (no cloud fallback) |
| Galaxy S26+ (US model, one lab unit) | not available (AICore missing or too old) | stopped with an error | nothing (no cloud fallback) |

What this shows: the private reading step runs on Android through Firebase AI Logic. Whether it can run depends on the individual phone, not just the phone model.

What it does not show: the full LabelGate workflow on Android. The impact card, artwork check, sign-off and audit log exist only in the web app.

## Limitations
- **Speed:** 30–90 s per document read on a laptop without a dedicated GPU. One read per supplier change; the impact on every label is then instant.
- **Small test sets:** the documents are synthetic and the evaluation sets are small. There are no real supplier PDFs (images only, JPEG/PNG) and no real factory pilot.
- **Reading errors:** Gemini Nano sometimes misspells words. Mixed alphabets are now caught automatically, but a plain misspelling such as `MACTODEXTRIN` is caught only by the reviewer comparing the reading with the image. That is why every reading must be confirmed by a person.
- **Human safety step:** tick boxes did not make people check the image (0/6, 2 testers). The A/B questions that replaced them caught 3/3 with 1 new tester, who also rejected one real change. That is too few people to claim reliability, and no interface can force a person to actually look.
- **Offline:** works once the page is open (shown with Wi-Fi off). There is no offline install, so the page cannot be loaded for the first time without internet.
- **Rule scope:** a simplified US major-allergen rule set. Not legal or regulatory advice.
- **Single user, single browser:** the library and log are stored locally. There is no multi-user authorisation or server-side audit store.
- **Recall details may differ between paths:** on device and in the cloud the model can phrase fields differently (for example, expanding a lot range). Product matching uses the ingredient terms, and a person reviews the result.

## Run locally
```bash
npm install
cp .env.example .env.local   # Firebase web config + reCAPTCHA Enterprise site key (see comments in the file)
npm run dev                  # http://localhost:5173
npm test                     # 151 tests
npm run build && npx firebase deploy --only hosting
```
For local development, App Check can use a debug token (`VITE_APPCHECK_DEBUG=1`). Register it in the Firebase console and never commit it.

## Repository map
- `src/proof/`: the main app.
  - `ui.js`: Gate 1 / Gate 2 / impact / history.
  - `read.js`: on-device reading and retry.
  - `rules.js`: deterministic checks.
  - `library.js`: verified label records, re-approval, diffs.
  - `audit.js`: hash chain.
  - `privacy.js`: network evidence.
  - `verify.js`: the A/B verification questions.
  - `reviewer-test.js`, `reviewer-test-page.js`: blind reviewer test (`reviewer-test.html`).
- `src/ai/firebase.js`: every Firebase AI Logic model and its inference mode, App Check, warm-up.
- `src/ai/extract.js`, `src/engine/`, `src/allergens/`: second tab (text specs and recall matching).
- `bench/`: frozen test sets, raw model outputs and reports.
- `demo/`: scripts that render the synthetic documents.
- Dev harness pages: `acceptance.html`, `acceptance-b.html`, `specproof.html`, `privacy-test.html`, `bench.html`.
- `android-experimental/`: native Android check of the on-device reading step (experimental, not submitted).
- `public/expert/`: 7-minute comprehension test for quality professionals.
- `docs/`: earlier progress and audit notes.

## Disclosure
The multi-objective routing formula in `src/engine/router.js` was designed before the hackathon. All code in this repository was written during the submission period.

## License
Apache-2.0. See [LICENSE](LICENSE).
