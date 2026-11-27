# Spec-to-Proof: integration acceptance check (Nov 26, 2026)

**This is an integration check of the real app path, not a benchmark.** No accuracy claims are made from these 10 cases.

**Setup:**
- Readings come from the app's real code: Firebase AI Logic `ONLY_ON_DEVICE`, Gemini Nano, Zain's laptop, Chrome 158.
- Decisions come from the app's real rules (`src/proof/rules.js`).
- Expected outcomes were written and hashed **before** any run (`EXPECTED-2026-11-26.json`, `FROZEN.txt`).
- All documents are synthetic.

## Cases and expected outcomes
| Case | What it tests | Expected |
|---|---|---|
| A1 | Crispy Crackers label, "CONTAINS: WHEAT." only | PRINT BLOCKED (milk) |
| A2 | Herb Croutons label, milk in brackets, no Contains line | CHECKS CLEAR — awaiting sign-off |
| A3 | Pretzel Bites label, milk not named | PRINT BLOCKED |
| A4 | "CONTAINS: WHEAT, MILK." printed inline after the ingredient list | CLEAR |
| A5 | Contains line split over two lines ("WHEAT," / "MILK.") | CLEAR |
| A6 | Milk only in "MAY CONTAIN MILK." | PRINT BLOCKED |
| A7 | Milk only in brackets "NATURAL FLAVOR (MILK)", no Contains line | CLEAR |
| A8 | Heavily degraded copy of the supplier spec | Must not silently clear |
| A9 | Japanese supplier spec with an "その他: 該当なし" line | Placeholder rejected, milk found, CLEAR |
| A10 | Reviewer corrects the A1 label reading to "CONTAINS: WHEAT, MILK." | CLEAR (engine uses the correction) |

## Run 1 (as pre-registered): **4/10**. All 10 cases came out PRINT BLOCKED
- **Readings:**
  - Spec (Spanish photo): 96 s.
  - Labels: 17–41 s each.
  - Unreadable spec: 65 s.
  - Japanese spec: 62 s.
  - All on device.
- **Network:** the only external requests during reading were `www.google.com` / `www.gstatic.com` (reCAPTCHA scripts for App Check, loaded while the first read started). No document content.
- **Nothing was wrongly cleared,** but every correct label was blocked too. A tool that blocks everything is useless, so this counts as a failure.

### Root causes
| # | Cause | Whose | Effect |
|---|---|---|---|
| 1 | Nano translated the supplier statement as "Manufactured in a **plant** that also processes sesame". The rule's facility-warning detector knew "facility" but not "plant", so **sesame was treated as an ingredient** | Rules (mine) | A2, A4, A5, A7 and A10 were wrongly blocked for "missing sesame" |
| 2 | Nano returned "その他：該当なし" ("Other: none"); the placeholder check only caught a bare "該当なし" | Rules (mine) | Placeholder accepted as an ingredient in A9 |
| 3 | The harness reported the raw rules outcome for readings with unresolved problems. In the app such a reading cannot be confirmed until the reviewer corrects or acknowledges it, i.e. **NEEDS REVIEW** | Harness (mine) | A2, A8 and A9 showed BLOCKED instead of NEEDS REVIEW |
| 4 | Nano returned an **empty ingredient list** for the Herb Croutons label (17 s). The app flagged it ("No ingredient list could be read") | Model | A2, A8, A9 (all three use this label) cannot clear without the reviewer typing or retrying |
| 5 | The "unreadable" spec was read almost perfectly (only "Dióxido de silicio" → "Diluido de silic") | Test design | The "unreadable → review" behaviour is **still not exercised** |

What worked in run 1:
- The **inline Contains line (A4)** was found and moved to its own field, and flagged for the reviewer.
- The **split Contains line (A5)** was read completely ("CONTAINS: WHEAT,\nMILK.").
- **"May contain" (A6)** never counted as a declaration.
- The **bracket-only declaration (A7)** was read correctly.

## Fixes (general rules, each tested with *different* wording from these cases)
- **Facility / shared-line / equipment wording** (EN/ES/JA, including "plant", "factory", "shared line", "equipment", "planta", "工場") in a supplier allergen statement never makes an allergen an ingredient.
- **Placeholders behind a short field label** ("Notes: N/A", "備考：なし", "Otros: ninguno") are rejected.
- **The harness now also reports the app's outcome** (NEEDS REVIEW while a reading problem is open).
- Tests: 107/107 pass, and the fixes are deployed.

## Re-score of run 1's stored readings with the fixed rules: **8/10 as expected, 0 wrong "clear" results**
*Same cases the fixes were found on, so this is **not** independent evidence.*

| Case | Expected | App outcome |
|---|---|---|
| A1 | BLOCK | BLOCK ✓ |
| A2 | CLEAR | NEEDS REVIEW. Empty label reading by Nano (safe) |
| A3 | BLOCK | BLOCK ✓ |
| A4 | CLEAR | CLEAR ✓ |
| A5 | CLEAR | CLEAR ✓ |
| A6 | BLOCK | BLOCK ✓ |
| A7 | CLEAR | CLEAR ✓ |
| A8 | not a silent clear | NEEDS REVIEW ✓ (but only because of the empty label reading, not because the spec was unreadable) |
| A9 | CLEAR | NEEDS REVIEW. Placeholder now rejected ✓, milk found ✓, but the same empty Herb Croutons label reading |
| A10 | CLEAR | CLEAR ✓ |

## Run 2 (fresh readings, fixed rules)
Started at 13:22Z. **Interrupted:** Chrome on the laptop restarted or reloaded, so there are no results. To be re-run when the laptop is available.

## Remaining limitations (to disclose)
1. **Latency:** about 17–100 s per document on a laptop with an integrated GPU.
2. **Nano can return an empty or partial field** (the Herb Croutons label). The app flags it and the reviewer must retry or type; it never clears silently.
3. **An unreadable image can still be "read".** Nano produced a near-perfect reading of a heavily degraded image, which makes it plausible it may also produce a confident wrong reading. The reviewer's image-to-reading check is the safeguard, and **this has not been shown to work by any automated test.**
4. **Translation is the model's job.** The allergen mapping depends on Nano's English translation; the reviewer confirms the translation.
5. Only 10 synthetic cases; no real supplier documents.
