# LabelGate: summary of all tests (26–27 Nov 2026)

**Project:** LabelGate is an entry in the Google / Firebase #BuildHybridAI hackathon (Web/Chrome track).

**What it does:**
1. A supplier changes an ingredient.
2. Gemini Nano reads the supplier's photographed spec on the device (Firebase AI Logic, `ONLY_ON_DEVICE`).
3. Fixed rules check every affected product label in milliseconds against a verified label library.
4. A named QA reviewer confirms each reading and signs off new artwork.
5. Public recall notices use hybrid inference (`PREFER_ON_DEVICE`): Gemini Nano when available, the cloud otherwise.

**Live app:** https://protean-booth-470411-r7.web.app

**Test conditions:** all on Zain's laptop (Chrome 158, Intel integrated GPU, no dedicated GPU). Synthetic documents only. Every number below comes from a real run; the raw data and reports are in `bench/`.

---

## 1. What we tested and what happened

| # | Test | What it checks | Result | Report |
|---|---|---|---|---|
| 1 | **Acceptance set B**: 6 fresh cases, expected outcomes and image hashes frozen before the run | Facility wording, a Spanish placeholder, a correct label, missing soy from a Japanese spec, Spanish whey/soy with no allergen statement, a deliberately wrong reading | **7/7 as pre-registered.** 10/10 reads ran on device (`on_device` on every chunk). Median 49 s per document (29–93 s). | `acceptance/ACCEPTANCE-B-REPORT-2026-11-26.md` |
| 2 | **End-to-end run with real Gemini Nano** | Gate 1 → impact on 3 labels → Gate 2 artwork → QA sign-off → new verified label record | Spec read 60–111 s. **Impact on all 3 labels in 6–13 ms** (2 blocked for milk, 1 clear). Corrected artwork read in 53 s → checks clear → verified record LBL-1001@4 created. | `results/UPDATE-2026-11-26-evening.md` |
| 3 | **Hybrid fallback** (public recall notice, `PREFER_ON_DEVICE`) | Does it really run on device when Nano is there, and fall back to the cloud when it isn't? | Chrome with Nano: **`on_device`, 43 s**. Browser without Nano (Prompt API "unavailable"): **`in_cloud`, 2.6 s**, App Check OK. Private documents never use this path; a test enforces that. | screenshots in `results/proof-evidence/` |
| 4 | **Offline** (Wi-Fi off after the page was open) | Does the private workflow work with no internet? | Spec read **on device in 67 s** with no outside requests. **Impact in 6 ms.** Public recall **on device in 39 s**. | `results/OFFLINE-TEST-2026-11-27.md` |
| 5 | **Privacy evidence** (inside the app, on every read) | Which servers does the page contact while a private document is read? | Every read reported `on_device` on all chunks. **No outside requests** during reads. The only outside traffic seen was App Check / reCAPTCHA when the page starts. | in the app and in test 1 |
| 6 | **Model warm-up** | Does loading the model on page open help? | Cold model load **23.8 s + 14.2 s** first prompt; warm **9 ms + 1.6 s**. Warm-up now runs on page open (34–39 s, no document content). It does **not** make a read faster once the model is loaded (warm spec read: 73 s). | `results/UPDATE-2026-11-26-evening.md` |
| 7 | **Tamper-evident audit log** | Is editing a stored decision detected? | Editing one stored entry → the app shows "**Audit chain broken at entry 8 — entry content was changed**". | same |
| 8 | **AI reviewer stand-in** (a different model, Nemotron Omni; *not a human*) | Can the planted errors be seen by someone who compares image and reading? | **3/3 planted errors caught, 1/1 correct reading accepted.** One run excluded: the image failed to upload, and the model still "found" errors it could not see. | `acceptance/AI-REVIEWER-STANDIN-2026-11-27.md` |
| 9 | **Human blind test 1**: 2 people (Dr. Waqas Ahmed, Danish), **tick-box design** | Does a person catch a confident but wrong AI reading? | **0/6 planted errors caught**, 2/2 correct readings accepted. They ticked the highlighted items to unlock the button (automation bias). One tester "fixed" the wrong word. | `reviewer-test/HUMAN-TEST-1-REPORT-2026-11-27.md` |
| 10 | **Human blind test 2**: 1 new person (Qudsia Sabri), **A/B question design** | Same question, after the redesign | **3/3 planted errors caught**, 5/6 answers correct. In the control round (milk really added, computer right) she rejected one real change. | `reviewer-test/HUMAN-TEST-2-REPORT-2026-11-27.md` |
| 11 | **Automated tests** | Rules, original-language allergen words (ES/JA, with a wrong or missing translation), retry on an empty reading, audit chain, hybrid wiring, the A/B questions, the full UI flow | **142 passing** | `npm test` |

## 2. What the testing changed in the product

1. **Safety design replaced.** Human test 1 showed that the "tick each difference" design does not work: people tick to move on. Both the app (Gate 2) and the test now ask **neutral A/B questions** ("Which one does the artwork say?"), with random order and nothing pre-selected. The reviewer's answer, not the AI, decides the confirmed text. Human test 2: 0/6 → 3/3.
2. **Simple test page.** The first tester could not start the in-app test (too much information, unfamiliar terms), so a separate, plain-language page was built.
3. **Real hybrid inference.** Public recall notices changed from cloud-only to `PREFER_ON_DEVICE`, tested both ways and offline.
4. **Bug caught.** A UI change briefly marked every successful spec read as failed. It was found in my own check and fixed within about 10 minutes, and an automated full UI-flow test was added that fails if it returns.
5. **Honest claims.** The README no longer says the interface "forces verification". It lists the human results, including the failure.

## 3. Honest limits
- **Small samples.** Human tests: 3 people in total, and only **1** person on the current design. Acceptance: 6 synthetic cases, one run. These are usability and integration observations, not accuracy or reliability claims.
- **Synthetic documents only.** No real supplier PDFs (images only) and no factory pilot.
- **Speed.** 30–90 s per document read on a laptop without a dedicated GPU. Only one read is needed per supplier change; the impact on every label is then instant.
- **A known weakness in the A/B questions.** The yellow highlight marks only the option with the extra word (e.g. "MILK"). This may push people to reject a real change, as happened once in the control round. Not yet fixed.
- **Offline needs the page already open.** There is no offline install.
- **Single user, browser storage.** The audit log is tamper-evident (hash-linked), not digitally signed and not server-side.

---

## 4. Questions for reviewers (GPT and Nemotron)
1. **Does this test evidence help LabelGate in hackathon judging?** For each criterion (Technological Implementation, Design, Potential Impact, Quality of the Idea), how much does it strengthen the project?
2. **Is the human-test story a strength or a risk?** It starts with a failure (0/6 with tick boxes) and shows a redesign that worked with 1 new tester (3/3). Should we show it in the demo and Devpost text, and how?
3. **Which 2–3 results should go in the 3-minute demo,** and which only in the README?
4. **What is still the weakest point a judge would notice,** and is it worth fixing before Nov 30? Options we are considering:
   - (a) a guided "Start demo" on the main page for first-time users, because the first tester did not know where to start;
   - (b) removing the one-sided highlight in the A/B questions.
5. Re-score the project with this evidence (each criterion out of 5), and give the top-3 chance as a range with your reasoning.

---

## Update after the final UX changes (Nov 27, late)

Both items from question 4 are now done, and two more were added. Evidence is split by kind.

**Automated tests: 147 passing (`npm test`).** New ones cover:
- the A/B options are neutral (no highlight), trimmed to the differing part, and include "I can't tell from the picture";
- choosing "I can't tell" puts the artwork in NEEDS REVIEW, never CHECKS CLEAR;
- the Supplier Change Impact Card shows the same status for every label as the impact table;
- a translation variant from real Nano ("Natural aroma") is paired with "natural flavouring" for display only; decisions are unchanged.

**Manual checks (me, in Chrome on Zain's laptop with real Gemini Nano):**
- The guided demo ("▶ Start the 2-minute demo") ran end to end. All 6 guide steps showed the right text and target. Spec read 84–116 s, label read 48 s, impact check about 5 ms. It ended with LBL-1001 rev 4 approved, and the card showed "APPROVED FOR REV 2".
- The Impact Card shows: the old and new wording; "ingredient 7 on the spec photo"; "new allergen source: milk"; 2 labels PRINT BLOCKED and 1 CHECKS CLEAR, with reasons; the next action; and evidence one click away.
- **No Nano on the device** (Claude desktop browser): reading a private document stops with "On-device AI is not available here — type the reading instead". Zero outside requests were recorded, so private documents never fall back to the cloud.

**Human usability tests:** unchanged from above (test 1 tick boxes 0/6; test 2 A/B 3/3 caught, 5/6 correct). The new v3 page (no highlight, plus "can't tell") has **not** yet been tried by a new person.

**Still not done:** cropping the image to the exact line. This is not reliable with the current model output, so it was not faked.
