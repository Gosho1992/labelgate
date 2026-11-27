# LabelGate — Devpost submission text

**Tagline:** Supplier changes. Label consequences. Before print.

**Platform:** Web (Chrome). Firebase AI Logic with Gemini Nano. Android on-device reading tested on a real Galaxy S26.

**Live app:** https://protean-booth-470411-r7.web.app
**Code:** https://github.com/Gosho1992/labelgate (Apache-2.0)
**Video:** https://youtu.be/Hk8Kiy7bpMY

---

## STORY

**Try it:** https://protean-booth-470411-r7.web.app (desktop Chrome with Gemini Nano) · **Code, reports and evidence:** https://github.com/Gosho1992/labelgate

## The problem
A missing allergen on a food label is not a typo. U.S. law requires labels to name the source of all 9 major allergens, and the FDA treats a product with an undeclared one as misbranded and subject to recall ([FDA](https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies)). Every 10 seconds in the U.S., a food allergy reaction sends someone to the emergency room ([FARE](https://www.foodallergy.org/media-room/fare-announces-support-american-center-cures)). Undeclared allergens were the **#1 reason for U.S. food recalls in 2025, 38.8% of recalls** ([U.S. PIRG data via Statista](https://www.statista.com/chart/36281/fda-and-usda-food-recalls-in-the-united-states/)), and an average recall costs about **$10 million** in direct costs ([GMA/FMI/GS1 US study, 2010, via Food Dive](https://www.fooddive.com/news/more-than-money-what-a-recall-truly-costs/426855/)).

It often starts with a supplier. Australia's food regulator counted 197 undeclared-allergen recalls in 2021–2025 and names, among the causes, a supplier changing an ingredient without the change being communicated, and errors from incorrect translation or reformulation ([FSANZ](https://www.foodstandards.gov.au/food-recalls/recallstats)). Two recent U.S. cases:
- **May 2026:** 71,603 lb of dumplings recalled (Class I) because peanut was not on the label; the company said a formulation change led to the mislabeling ([USDA FSIS, via Food Safety News](https://www.foodsafetynews.com/2026/05/35-tons-of-frozen-dumplings-recalled-because-of-undeclared-peanut-risk/)).
- **February 2025:** snacks recalled after a customer's allergic reaction; the supplier had missed milk, egg and wheat while translating the ingredient list ([FDA](https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/zb-importing-issue-voluntary-recall-and-allergy-alert-undeclared-egg-wheat-and-milk-certain-ulker)).

Why it slips through: supplier specs arrive as photos or scans, sometimes in another language, and they are confidential, so teams avoid uploading them to cloud AI. Artwork proofreading compares new artwork with the *approved* text, so when the approved text is itself out of date, a wrong label still passes.

## What it does
- **Gate 1, supplier change.** Gemini Nano reads the photographed supplier spec **on the device** (English, Spanish or Japanese). A named QA reviewer checks the reading against the photo and confirms it.
- **Impact in milliseconds.** Fixed rules, not AI, re-check every product label that uses the ingredient against its verified label record. The **Supplier Change Impact Card** gives a one-line verdict ("Supplier added Milk → 2 labels PRINT BLOCKED · 1 clear"), the exact wording that changed, where it is on the spec, and the next action for each label.
- **Gate 2, corrected artwork.** Nano reads the new artwork on device. Differences from the approved label become neutral A/B questions ("Which one does the artwork say?"), with nothing pre-selected and an "I can't tell" option. QA signs off that exact artwork revision (SHA-256), creating a new verified label record.
- **Audit.** Every decision goes into a hash-chained log with a one-click tamper test; export as JSON or CSV.
- **Public recall notices** use hybrid inference and are matched to your own formulas locally.

**Who decides what:** Gemini Nano only *reads*. Deterministic rules *decide* (9 major U.S. allergens, matched in the original language too: leche, soja, 乳, 大豆, 小麦). A person *confirms* every reading and *signs off* every artwork. Outcomes are PRINT BLOCKED, NEEDS REVIEW or CHECKS CLEAR — AWAITING QA SIGN-OFF; never "approved by AI".

## How we used Firebase AI Logic
LabelGate picks the inference mode by how sensitive the data is (Firebase JS SDK 13.4, `firebase/ai`, all in `src/ai/firebase.js`):
- **Private documents** (supplier specs, label artwork, formulas): `InferenceMode.ONLY_ON_DEVICE` with image input, `en/es/ja`, and a JSON response constraint. A privacy guard checks `inferenceSource` on **every streamed chunk** and on the final answer and throws if it is not `on_device`. The app also lists every outside request made during the read. Without Gemini Nano the read stops and the reviewer types the reading: **no cloud fallback for private data.**
- **Public recall notices:** `InferenceMode.PREFER_ON_DEVICE` with a JSON schema on both paths: Gemini Nano when available, `gemini-3.5-flash-lite` in the cloud otherwise, protected by **App Check** (reCAPTCHA Enterprise).
- **Warm-up** on page open (cold ≈ 38 s → warm ≈ 2 s) and an **AI call log** showing where each call ran, how long it took and bytes sent.
- **Gemini Nano 4 generation:** on the web an app cannot pick the on-device model; Chrome serves it. We ran the live LabelGate demo on a Chrome with **"Gemma 4 for Built-in AI" enabled** (the Prompt API uses Gemma 4, which Google describes as the foundation of Gemini Nano 4) and the `gemma4` model ready: the Spanish supplier spec photo was read **on device in 54 s** through Firebase AI Logic (`on_device`, no outside requests), with every ingredient and the milk source correct. Our other Chrome tests and the video ran on a laptop where Chrome serves Gemini Nano v3; the code is identical. Screenshots: `bench/results/chrome-model/` in the repo.
- **Android:** the same `ONLY_ON_DEVICE` reading in a native Kotlin app with the Firebase AI Logic Android SDK (`firebase-ai` 18.2.0 + `firebase-ai-ondevice`), tested on a real Galaxy S26.

## How LabelGate compares
Artwork proofreading and label-compliance tools (GlobalVision, Esko Comply, GoVisually, Artwork Flow) compare artwork with the approved master text and check it against rulebooks. Supplier-document platforms (TraceGains, Trustwell, NSF TraQtion) collect supplier documents and extract data with AI in a cloud platform. **LabelGate starts from the supplier change, reads the confidential document on the device, finds every affected approved label revision and blocks print until a person signs off.** (From the vendors' public pages; we have not tested their products, which are far broader than this prototype.)

## How we tested it: 20 tests, including the failures
Laptop without a dedicated GPU (Chrome 158), an AWS CPU-only Windows VM, and real Samsung phones. Synthetic documents only; expected outcomes and image hashes frozen before the main runs. Every report is in the repo.
1. **Go/no-go on an AWS VM:** Gemini Nano runs on CPU.
2. **Held-out benchmark v2 (60 runs):** Nano raised recall on unfamiliar wording (0.19 → 0.56) but often named the wrong allergen → **decision: AI reads, rules decide.**
3. **Benchmark v3 + Firebase AI Logic path (60/60 OK):** hybrid found 45/45 allergen-bearing ingredients, 0 silent misses.
4. **Photo reading feasibility (22 images, `ONLY_ON_DEVICE`):** allergens exactly right on 10/10 specs (EN/ES/JA); 22/22 on device, 0 outside requests; 2 safety failures fixed by rules.
5. **Acceptance set A:** failed 4/10 (blocked everything) → root causes fixed.
6. **Acceptance set B (fresh, frozen):** 7/7 as pre-registered; 10/10 reads on device; median 49 s.
7. **End-to-end with real Nano:** impact on 3 labels in 6–13 ms; artwork read 53 s; label signed off.
8. **Hybrid fallback:** on device 43 s; cloud 2.6 s with App Check.
9. **Offline:** spec read on device 67 s, impact 6 ms, recall on device 39 s.
10. **No Nano:** private read stops; nothing sent.
11. **Privacy evidence:** `on_device` on every chunk; no outside requests during reads.
12. **Warm-up:** cold 23.8 s + 14.2 s → warm 9 ms + 1.6 s.
13. **Tamper detection:** an edited log entry is detected.
14. **AI reviewer stand-in** (not human): 3/3 planted errors caught.
15. **Human blind test 1 (tick boxes, 2 people): 0/6 caught** → design replaced.
16. **Human blind test 2 (A/B questions, new person): 3/3 caught**, 1 real change wrongly rejected.
17. **Independent comprehension review** (in progress): first reviewer 4/5 correct, rated 5/5; the unclear "CHECKS CLEAR" is now explained on the card.
18. **Live reading glitch:** Nano wrote `MALTOДЕКТРИН` with Cyrillic letters; the reviewer caught it; a new rule flags mixed alphabets.
19. **Android on real phones (Samsung Remote Test Lab):** Galaxy S26 read the full Spanish spec **on the phone in 12.2 s**, same result as Chrome, 0 bytes sent by the app; S25 / S26+ without Nano stopped safely.
20. **151 automated tests.**

## How we built it
- **Nov 25:** tested whether Gemini Nano runs at all on an AWS VM, then benchmarked it against a rules-only baseline. It read unfamiliar wording well but could not be trusted to classify, so it became the reader, not the judge.
- **Nov 26:** connected Firebase AI Logic, App Check and Hosting; repeated the benchmark through Firebase AI Logic; proved photo reading on the laptop; failed acceptance set A, fixed the causes, passed a fresh set B; added hybrid recall notices.
- **Nov 27:** two human blind tests (the first failed and forced a redesign), offline test, the Android reading on a real Galaxy S26 via Samsung Remote Test Lab, comprehension reviews, the website and the video.

Stack: Firebase AI Logic (JS + Android), Gemini Nano, Gemini 3.5 Flash-Lite, Firebase Hosting, App Check, reCAPTCHA Enterprise, Vite, Vitest, Web Crypto (SHA-256), Kotlin.

## Challenges
- **Trusting the AI:** our first benchmark showed Nano naming the wrong allergen, so we made it a reader only and put deterministic rules and a person in charge.
- **Automation bias:** tick boxes failed completely (0/6); neutral A/B questions worked (3/3).
- **Speed:** 30–90 s per read on a laptop without a GPU; streaming, warm-up, and one read per supplier change that then re-checks every label instantly.
- **Reading errors:** misspellings and mixed alphabets, now flagged or caught by the reviewer.

## What's next
- A pilot with a food manufacturer's QA team on real supplier documents (including PDFs).
- The full workflow in the Android app (the on-device reading already runs on the phone).
- Multi-user sign-off with server-side audit storage; more allergen rule sets (EU 14).

**Users:** no public users yet; the people above tested it. All companies, products and documents are synthetic. LabelGate is decision support, not regulatory approval.

---

## Built during the submission period
LabelGate is a new project, started on Nov 25, 2026. Everything in the repository was written during the submission period, with an AI coding assistant. The only exception is the multi-objective routing formula in `src/engine/router.js`, which was designed before the hackathon and is disclosed in the README. All companies, products and documents are synthetic.

## Testing instructions for judges
1. Open https://protean-booth-470411-r7.web.app in **desktop Chrome** with Gemini Nano available (Chrome 148 or later). The first page checks your browser; click **Open the live demo** (or go straight to https://protean-booth-470411-r7.web.app/app/).
2. Click **▶ Start the 2-minute demo** and follow the yellow guide bar.
3. Without Gemini Nano, private documents are not sent to the cloud. Use "Type it myself (no AI)" to see the rules and the Impact Card work; the recall notice uses the cloud fallback.
