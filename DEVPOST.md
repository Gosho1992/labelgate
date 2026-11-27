# LabelGate — Devpost submission text

**Tagline:** Supplier changes. Label consequences. Before print.

**Platform:** Web (Chrome). Firebase AI Logic with Gemini Nano.

**Live app:** https://protean-booth-470411-r7.web.app
**Code:** https://github.com/Gosho1992/labelgate (Apache-2.0)

---

## Inspiration
Every 10 seconds, a food allergy reaction sends someone in the U.S. to the emergency room ([FARE](https://www.foodallergy.org/living-food-allergy)). Undeclared allergens were the most common reason for U.S. food recalls in 2025, 38.8% of recalls ([U.S. PIRG data via Statista](https://www.statista.com/chart/amp/36281/fda-and-usda-food-recalls-in-the-united-states/)), and the average recall costs about $10 million in direct costs ([GMA/FMI study, via Food Dive](https://www.fooddive.com/news/more-than-money-what-a-recall-truly-costs/426855/)). Australia's food regulator counted 197 undeclared-allergen recalls between 2021 and 2025.

Two real cases show how it happens. In May 2026, 71,603 lb of dumplings were recalled because peanut was not on the label; the company said "a formulation change led to the mislabeling" ([USDA FSIS, via Food Safety News](https://www.foodsafetynews.com/2026/05/35-tons-of-frozen-dumplings-recalled-because-of-undeclared-peanut-risk/)). In February 2025, snacks were recalled after a customer's allergic reaction; the supplier had missed allergens while translating the ingredient list ([FDA](https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/zb-importing-issue-voluntary-recall-and-allergy-alert-undeclared-egg-wheat-and-milk-certain-ulker)). Often the cause is not a mistake on the factory floor. A supplier quietly changes an ingredient, for example a "natural flavour" that now carries a milk-derived ingredient, and the labels already approved for every product that uses it are now wrong. The people who must catch this are QA reviewers working from supplier spec sheets. Those sheets arrive as photos or scans, sometimes in another language, and are confidential.

## What it does
- **Gate 1 — supplier change.** Gemini Nano reads the photographed supplier spec **on the device** (English, Spanish or Japanese). A named QA reviewer checks the reading against the photo and confirms it.
- **Impact.** Fixed rules, not AI, re-check every affected product label against its verified label record in a few milliseconds. The Supplier Change Impact Card gives the verdict in one line, for example: "Supplier added Milk → 2 labels PRINT BLOCKED · 1 clear". It shows the exact wording that changed, where it is on the spec, and the next action.
- **Gate 2 — corrected artwork.** Nano reads the new label artwork. The reviewer answers neutral either-or questions about what is actually printed. Then QA signs off that exact artwork revision, which creates a new verified label record.
- **Audit.** Every decision goes into a hash-chained log that detects later edits. The log can be exported as JSON or CSV.
- **Public recall notices.** These use hybrid inference: on-device when Gemini Nano is available, cloud fallback when it isn't. The notice is then matched to your own formulas locally.

## How we built it (Firebase AI Logic)
- **Private data** (supplier specs, label artwork, formulas): `InferenceMode.ONLY_ON_DEVICE` with image input. A privacy guard checks `inferenceSource` on every streamed chunk and on the final answer. The app records the network requests made during each read; there were none. Without Gemini Nano, the read stops and the reviewer types the reading instead. There is **no cloud fallback for private documents**.
- **Public data** (recall notices): `InferenceMode.PREFER_ON_DEVICE` with a JSON response schema on device and on `gemini-3.5-flash-lite` in the cloud, protected by App Check (reCAPTCHA Enterprise).
- **Warm-up.** The model is warmed up when the page opens. A cold start takes about 38 s; warm, it is about 2 s.
- **Rules.** The deterministic rules cover a simplified set of 9 US major allergens. They match original-language terms, ignore facility and "may contain" wording, and pair reworded ingredients.
- **Storage.** The verified label library and the hash-chained audit log stay in the browser. Firebase Hosting serves the app.

## Testing (honest scope)
- **Acceptance set B:** 6 fresh synthetic cases, with expected outcomes and image hashes frozen before the run. Result: 7/7 checks as pre-registered, and 10/10 reads `on_device`. The median read took 49 s on a laptop without a dedicated GPU.
- **Human tests:**
  - Our first design, with tick boxes, failed: 0/6 planted errors caught, because people ticked through.
  - We replaced it with neutral A/B questions. A new tester then caught 3/3 planted errors, and wrongly rejected 1 real change.
  - Both results are from very few people; they are usability signals, not proof.
- **Offline:** with Wi-Fi off after the page loaded, the spec read ran on device, the impact check took 6 ms, and the recall notice was read on device.
- **Reading errors found while filming the demo:** Nano wrote "MALTODEXTRIN" as `MALTOДЕКТРИН` (with Cyrillic letters) in one read and as `MACTODEXTRIN` in another. The A/B question showed the misspelled wording, and the reviewer corrected it. A new rule now flags mixed-alphabet words automatically.
- **Android: the on-device reading already runs on a real phone:**
  - We built a native Kotlin app that uses Firebase AI Logic `ONLY_ON_DEVICE` and ran it on real Samsung phones via Samsung Remote Test Lab.
  - On a **Galaxy S26 (Android 16)**, Gemini Nano read the same spec photos on the phone with **0 bytes sent**. The full Spanish reading took 12.2 s and matches the Chrome reading word for word.
  - Two other lab phones (a Galaxy S25 and an S26+) did not have Gemini Nano installed. Their reads stopped safely, with no cloud fallback.
  - Next: the full LabelGate workflow on Android. The on-device reading it depends on already works on the phone.
- **Automated tests:** 151 tests (`npm test`).
- **Expert review:** *[results from quality professionals — to be added]*

## Challenges
- **Speed:** on-device reads take 30–90 s on a laptop without a dedicated GPU. We added streaming, a warm-up, and a design where one read re-checks every label.
- **Automation bias:** people tick boxes to move on. We replaced the tick boxes with A/B questions and an "I can't tell → needs review" option.
- **Reading errors:** Nano can misspell or mix alphabets, so the AI never decides. Rules decide, and a person confirms.

## What's next
- A real factory pilot.
- PDF supplier specs.
- Multi-user sign-off with server-side audit storage.
- Completing the Android app.

## Built during the submission period
Everything in the repository was written during the submission period, with an AI coding assistant. The only exception is the multi-objective routing formula in `src/engine/router.js`, which was designed before the hackathon and is disclosed in the README. All companies, products and documents are synthetic.

## Testing instructions for judges
1. Open https://protean-booth-470411-r7.web.app in **desktop Chrome** with Gemini Nano available (Chrome 148 or later).
2. Click **▶ Start the 2-minute demo** and follow the yellow guide bar.
3. Without Gemini Nano, the app shows that private documents are not sent to the cloud. You can still type the reading and see the rules and the Impact Card work.
