# Independent review of the Impact Card — 2026-11-27

**What testers did:** opened https://protean-booth-470411-r7.web.app/expert/ on their own device, looked at one real screenshot of the Supplier Change Impact Card (`public/expert/impact-card.png`), and answered 5 comprehension questions, 2 ratings and 1 free-text question. The answer key was written into the page before any tester saw it. Testers paste back the result text the page produces; raw results are in this folder.

**Scope:** very few people, recruited personally. These are usability signals, not a study.

## Results

| # | Role (self-described) | Time | Comprehension | Ease (1–5) | Usefulness (1–5) | Missed | Comment |
|---|---|---|---|---|---|---|---|
| 1 | Doctor (not food QA) | 98 s | 4/5 | 5 | 5 | q5: chose "I can't tell" for what CHECKS CLEAR means | — |

## What we changed because of it
- **Tester 1 could not tell what "CHECKS CLEAR" means** from the card. The explanation was only in small print under "Next action". The card row for a clear label now says, next to the result: *"CHECKS CLEAR means the rules found no missing allergen; QA still signs off, and it is not regulatory approval."* (`src/proof/ui.js`, deployed 2026-11-27).
- The test screenshot was **not** changed, so all testers see the same screen.
