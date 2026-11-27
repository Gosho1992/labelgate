# Human blind reviewer test 2: A/B questions (27 Nov 2026)

## Setup
- **Tester:** 1 new person, Qudsia Sabri, who had not taken part in test 1.
- **Page:** `reviewer-test.html` v2.
  - The picture is shown large and first.
  - Each difference becomes a neutral A/B question: "Which one does the picture say?"
  - The order is random and nothing is pre-selected.
- **Rounds:** 4.
  - V1, V2, V3: picture B6, where milk is **not** declared. The computer's reading invents milk.
  - V4: a different picture, B3, where milk **is** declared. The computer's reading is correct.
- **Source:** the stored results (`human-v2-ab-2026-11-27.json`), which match Zain's screen recording (`Recording_2026-11-27_100359.mp4`, 2 min 12 s).

## Result

| Round | Case | Questions | Answers | Outcome |
|---|---|---|---|---|
| 1 | V1: milk invented in ingredients + Contains | 2 | ingredients: without milk ✓ · Contains: "No Contains line" ✓ | **Caught** |
| 2 | V4 control: milk really added (computer right) | 2 | ingredients: chose the version **without** milk ✗ · Contains: "CONTAINS: WHEAT, MILK." ✓ | **One wrong answer.** Milk stays declared through the Contains line, but the ingredient text was changed wrongly |
| 3 | V3: milk invented in ingredients only | 1 | without milk ✓ | **Caught** |
| 4 | V2: Contains line invented only | 1 | "No Contains line" ✓ | **Caught** |

**Planted errors caught: 3 / 3.** **Questions answered correctly: 5 / 6.**

## Comparison with test 1 (tick boxes)
Test 1 caught 0 / 6 planted errors with 2 testers. Test 2 caught 3 / 3 with 1 tester. This is a strong sign that the A/B questions make people look at the picture. It is **one person**, so it is a usability observation, not proof.

## A weakness found
In the control round the tester rejected a **real** milk change in the ingredient list. A likely cause: the yellow highlight appears only on the option that has the extra word "MILK", so the highlighted option can look like "the suspicious one".

A possible fix, not yet made:
- show only the short part that differs (for example "NATURAL FLAVOR, SILICON DIOXIDE" vs "NATURAL FLAVOR (MILK), SILICON DIOXIDE");
- highlight neither option.
