# Human blind reviewer test 1: tick boxes failed (27 Nov 2026)

## Setup
- **Testers:** 2 people, Dr. Waqas Ahmed and Danish, on Zain's laptop. They had no food-industry training and had never seen the test case.
- **Page:** `reviewer-test.html` v1. One label picture (B6, Seasoned Pretzel Bites, where milk is **not** declared) and the computer's reading.
  - Parts of the reading that were not on the old approved label were highlighted.
  - Each highlighted part had a tick box: "tick it only if you can see it in the picture; if you can't see it, delete it from the text".
- **Rounds:** 4 per tester, in random order. 3 had a planted milk error (V1–V3) and 1 had a correct reading (V0). Testers were told only that the computer can make mistakes.
- **First attempt:** the testers first tried the in-app version. Dr. Waqas found it too confusing to start: too much information and unfamiliar terms, with no step-by-step path. This led to the simple standalone page.
- Raw data: `human-v1-ticks-2026-11-27.json`. Screen recording: provided by Zain (`Recording_2026-11-27_094343.mp4`, 3 min 52 s).

## Result

| | Planted errors caught | Correct readings accepted |
|---|---|---|
| Dr. Waqas Ahmed | 0 / 3 | 1 / 1 |
| Danish | 0 / 3 | 1 / 1 |
| **Total** | **0 / 6** | **2 / 2** |

Time per round was 3–79 s. After the first round most rounds took under 20 s.

## What the recording shows
- **Both testers ticked every highlighted part to unlock the button.** The tick box worked as "I noticed this", not as "I found this in the picture". This is automation bias: the computer's text was treated as correct by default.
- **Danish tried to fix one reading but changed the wrong part.** He changed "CONTAINS: WHEAT, MILK." to "CONTAINS: MILK", which removed wheat (real) and kept milk (invented).
- **The picture was small next to a large editable text box,** so attention stayed on the computer's text.

## Conclusion
The "tick each difference" design **does not work** with these users. The claim that it forces verification was wrong and has been removed from the README.

## Change made (same day)
Both the test page and the app's artwork check (Gate 2) now show:
- the picture large and first;
- one **neutral A/B question** per difference ("Which one does the picture say?"), offering the approved label's wording and the computer's wording. The order is random and nothing is pre-selected.

The answer, not the computer, decides the confirmed text. The new test also has a control round on a **different** real picture (B3), where milk really was added and the computer is right. That round detects people who reject every change without looking.

These testers have now seen this picture 4 times, so a retest of v2 should use new people, or report that the testers were repeat participants.
