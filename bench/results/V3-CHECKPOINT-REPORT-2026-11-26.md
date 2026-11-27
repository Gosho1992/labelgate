# Checkpoint Nov 26 — Nano as ingredient discovery, evidence/absence validation, look-alike exclusions, held-out v3

## 1. Files changed
- **Pipeline:** src/detect/prompt.js (prompt discovery-v2; v1 kept), src/schemas.js (schema discovery-v2; v1 kept), src/detect/pipeline.js (detect-2), src/engine/profile.js (UNKNOWN allergen, model guess, strict evidence/absence validation, reviewer determinations), src/engine/gate.js (needsId + determinations), src/allergens/dictionary.js (3 look-alike exclusions, version 2026.11.26-1).
- **UI:** src/main.js, src/styles.css (Needs-allergen-identification block, blank reviewer dropdown, non-actionable model guess).
- **Benchmark:** src/bench/score.js, src/bench/score-v3.js, src/bench/sets.js, src/bench/run.js, bench/cases/heldout-v3-20.js, bench/report-v3.mjs, bench/exclusions-before-after.mjs, bench/build-bench.mjs, bench/bench.template.html.
- **Tests:** test/discovery.test.js (new), test/frozen.test.js, test/pipeline.test.js, test/engine.test.js.

## 2. Tests
78/78 pass: the original 50 still pass, plus 28 new.
- 3 original tests were rewritten for the new schema.
- **One invariant changed:** an unsupported model claim is now rejected and logged instead of raising a review flag.

## 3. v3 dataset
- Authored by Nemotron 3 Ultra from a generic brief.
- sha256 `3543bd8f844a7d853699b389bbc4219fa8b64f3d9160c10431a2650d4a05b3a5`, recorded before any model run.
- 20 unique cases: 4 unfamiliar, 4 scientific_derivative, 4 subingredient_carrier, 3 ambiguous, 5 negative_lookalike. 15 allergen-bearing gold ingredients plus 3 ambiguous ones.

## 4. Leakage
- Prompt v2, schema v2, dictionary and exclusions were hashed (bench/results/FROZEN-BEFORE-V3-2026-11-26.txt) before v3 was requested.
- No v3 gold term appears in the prompt. No exclusion matches any v3 look-alike (oat milk, apple butter, tiger nut, water chestnut, cocoa butter).
- One logged change after v3 arrived, before any Nano run: evidence lookup made strict, as Decision 2 requires. It was found with a mock model.
- **Caveat:** v3 is mostly dictionary-familiar. The author added explanatory brackets, so rules alone find 14/15 gold allergens. V08 "Glycine max" is the only positive the dictionary cannot map, and the same species appeared in v2 (H11).

## 5. Look-alike exclusions — before/after (rules arm, deterministic, v2 frozen cases)
v2: precision 0.333 → 0.50, recall 0.188 → 0.188, false positives 6 → 3 (H21 coconut milk, H22 sunflower seed butter, H23 cream of tartar). Legacy sets unchanged.

## 6. v3 results (20 unique cases × 3 repeats = 60 runs; repeats measure stability, not sample size)
| Arm | Ingredient ID precision | Ingredient ID recall | Classified correctly | Wrong category | Left UNKNOWN for human | Not identified | Precision of confirmed allergens | Ambiguous: flagged / overclaimed | False-positive allergens | Silent misses | Review rate | Unsupported evidence / absence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rules | 0.875 | 0.933 (42/45) | 42 | 0 | 0 | 3 | 0.875 | 3 / 0 of 9 | 6 | 3 | 0.15 | 0 / 0 |
| nano | 0.627 | 1 (45/45) | 41 | 0 | 4 | 0 | 0.83 | 3 / 3 of 9 | 8 | 0 | 0.95 | 0 / 134 |
| hybrid | 0.64 | 1 (45/45) | 42 | 0 | 3 | 0 | 0.875 | 6 / 0 of 9 | 6 | 0 | 0.533 | 0 / 134 |

Latency (CPU VM): p50 22102 ms · p90 66367 ms · max 83436 ms · mean 32125 ms. Statuses {"ok":60}
Stability: nano 9/20 cases identical across repeats; hybrid 13/20 cases identical across repeats

Wrong-category details (nano arm = model guesses): none
Wrong-category details (hybrid): none
False-positive allergens: rules V16:milk,V19:milk,V16:milk,V19:milk,V16:milk,V19:milk | nano V15:soy,V16:milk,V20:treenut,V15:soy,V20:treenut,V15:soy,V16:milk,V20:treenut | hybrid V16:milk,V19:milk,V16:milk,V19:milk,V16:milk,V19:milk
Silent misses: rules V08,V08,V08 | nano - | hybrid -
Hybrid review reasons (runs containing each): {"nano_unknown_ingredient":22,"grounded_absence":7,"dict_ambiguity":9}

### Per run (hybrid shows confirmed C, UNKNOWN ?:term(guess), grounded absences ABS)
| Case | Gold | Rules | Nano | Hybrid | ms |

**Reading**
- **The one case that matters (V08, Glycine max):** rules missed soy silently in 3/3 runs. Hybrid surfaced "Glycine max protein hydrolysate — allergen UNKNOWN, verify" in 3/3 runs, so it caused no silent miss. Nano's guess was soy in 2 runs and unknown in 1; in B2 it said wheat. The guess is never used.
- **Wrong-category errors reaching a decision: 0 in hybrid**, by design. Tiger nut → "treenut" and hydrolyzed plant protein → "soy" were shown only as unreliable guesses, so no false allergen was confirmed. In the nano-only arm the same guesses would have been 3 overclaims.
- **Review noise moved:**
  - Hybrid review rate is 0.53 (B2 was 0.98 on a different dataset, so not directly comparable). Prompt echo is gone: no "lecithin / emulsifier" notes. The "dictionary found X but Nano did not" flag appeared 0 times.
  - New noise: Nano lists ordinary ingredients (salt, maltodextrin, citric acid, pectin, rice flour, tapioca starch, sodium lauryl sulfate, yeast extract) as possible allergens with guess "unknown" in 22 runs.
  - A few grounded absences are wrong: it said source not stated for Tahini, Lecithin de soja and "maltodextrin from wheat", which do state their source.
- **Unsupported absences: 134.** All had an empty quote. They were rejected and logged and created no flags, as designed.
- **Gap:** V14 "Vegetable protein" (ambiguous) was flagged in 0/3 hybrid runs. Neither the dictionary nor Nano raised it.
- **False positives:** hybrid's 6 are the dictionary's oat milk / apple butter → milk. The exclusions are deliberately narrow, as approved.
- **Latency got worse:** p50 22 s, p90 66 s, max 83 s per spec on the CPU VM, against 13.8 s p50 in B2. The new prompt makes Nano list more ingredients, so it writes longer output.
- **Stability:** hybrid output identical across repeats in 13/20 cases; nano 9/20.

## 7. Reviewer UI
Mock-model screenshot: bench/results/ui-unknown-allergen-mock-2026-11-26.png. The card shows:
- "Needs allergen identification"
- Ingredient (exact text)
- **Allergen: UNKNOWN — verify**
- Evidence: the spec with the quote highlighted
- A grey, unselectable line "Model guess (unreliable): wheat — not used for any decision"
- A dropdown with no preselection (9 allergens + "Not a major allergen")

The determination is bound to the spec revision. In the tests, the reviewer choosing soy (when the model guessed wheat) leads to PRINT BLOCKED.

## 8. Unresolved risks
1. v3 is too dictionary-friendly to measure discovery. Discovery evidence on genuinely unseen wording rests on V08 (n=1 unique case) plus B2.
2. Nano over-lists ordinary ingredients as possible allergens. This is the main remaining source of review noise; it needs a decision, not a v3-tuned fix.
3. Missed ambiguous ingredient ("Vegetable protein").
4. Latency on CPU: p90 66 s. Must measure on GPU hardware, and possibly keep prompt output shorter.
5. Firebase AI Logic path not yet tested (next checkpoint).

## Appendix — per-run detail
### Per run (hybrid shows confirmed C, UNKNOWN ?:term(guess), grounded absences ABS)
| Case | Gold | Rules | Nano | Hybrid | ms |
|---|---|---|---|---|---|
| V01#1 | Khoa=milk | C:[milk] | C:[] ?:milk solids(milk) R | C:[milk] | 15158 |
| V02#1 | Surimi=fish | C:[fish] | C:[] ?:Alaska pollock(fish) R | C:[fish] | 15729 |
| V03#1 | Tahini=sesame | C:[sesame] | C:[] ?:Tahini(sesame); salt(unknown) ABS:Tahini (100% roasted sesame seed R REJ:0/8 | C:[sesame] ?:salt(unknown) ABS:Tahini (100% roasted sesame seed R REJ:0/8 | 65943 |
| V04#1 | Lecithin de soja=soy | C:[soy] R | C:[] ?:Lecithin de soja(soy) R | C:[soy] R | 14697 |
| V05#1 | Casein (Bos taurus)=milk | C:[milk] | C:[] ?:Casein (Bos taurus)(milk) R | C:[milk] | 14475 |
| V06#1 | Ovalbumin (Gallus gallus)=egg | C:[egg] | C:[] ?:Ovalbumin (Gallus gallus)(egg); sodium lauryl sulfate(unknown) R REJ:0/9 | C:[egg] ?:sodium lauryl sulfate(unknown) R REJ:0/9 | 66417 |
| V07#1 | Arachis hypogaea protein isolate=peanut | C:[peanut] | C:[] ?:Arachis hypogaea protein isolate(unknown); maltodextrin(unknown) R | C:[peanut] ?:maltodextrin(unknown) R | 22805 |
| V08#1 | Glycine max protein hydrolysate=soy | C:[] | C:[] ?:Glycine max protein hydrolysate(soy); citric acid(unknown) R | C:[] ?:Glycine max protein hydrolysate(soy); citric acid(unknown) R | 22284 |
| V09#1 | wheat starch=wheat | C:[wheat] R | C:[] ?:wheat starch(wheat) R | C:[wheat] R | 14812 |
| V10#1 | soy flour=soy | C:[soy] | C:[] ?:soy flour(soy) R REJ:0/8 | C:[soy] REJ:0/8 | 52874 |
| V11#1 | maltodextrin from wheat=wheat | C:[wheat] | C:[] ?:maltodextrin(wheat); wheat(wheat) R | C:[wheat] | 21868 |
| V12#1 | sodium caseinate=milk | C:[milk] | C:[] ?:caseinate(milk) R | C:[milk] | 14426 |
| V13#1 | Natural flavor=ambiguous R | C:[] R | C:[] ?:yeast extract(unknown) R | C:[] ?:yeast extract(unknown) R | 13246 |
| V14#1 | Vegetable protein=ambiguous R | C:[] | C:[] REJ:0/9 | C:[] REJ:0/9 | 64191 |
| V15#1 | Hydrolyzed plant protein=ambiguous R | C:[] | C:[] ?:Hydrolyzed plant protein(soy); disodium inosinate(unknown) R | C:[] ?:Hydrolyzed plant protein(soy); disodium inosinate(unknown) R | 22102 |
| V16#1 | none | C:[milk] | C:[] ?:Oat milk(milk); oats(unknown) R | C:[milk] | 22321 |
| V17#1 | soy lecithin=soy | C:[soy] | C:[] ?:soy lecithin(soy) R | C:[soy] | 13185 |
| V18#1 | soy sauce (water, wheat, soybeans, salt)=soy; soy sauce (water, wheat, soybeans, salt)=wheat | C:[soy,wheat] | C:[] ?:soy sauce(soy); wheat(wheat); soybeans(soy) R | C:[soy,wheat] | 29618 |
| V19#1 | none | C:[milk] | C:[] ?:apples(unknown); sugar(unknown); cinnamon(unknown); pectin(unknown) R | C:[milk] ?:pectin(unknown) R | 33834 |
| V20#1 | none | C:[] | C:[] ?:Tiger nut flour(treenut); rice flour(unknown); tapioca starch(unknown) R | C:[] ?:Tiger nut flour(treenut); rice flour(unknown); tapioca starch(unknown) R | 27025 |
| V01#2 | Khoa=milk | C:[milk] | C:[] ?:milk solids(milk) R REJ:0/8 | C:[milk] REJ:0/8 | 48414 |
| V02#2 | Surimi=fish | C:[fish] | C:[] ?:Surimi(fish) R | C:[fish] | 15236 |
| V03#2 | Tahini=sesame | C:[sesame] | C:[] ?:Tahini(sesame); roasted sesame seed(sesame); salt(unknown) R | C:[sesame] ?:salt(unknown) R | 30101 |
| V04#2 | Lecithin de soja=soy | C:[soy] R | C:[] ?:Lecithin de soja(soy) ABS:Lecithin de soja R REJ:0/8 | C:[soy] ABS:Lecithin de soja R REJ:0/8 | 59549 |
| V05#2 | Casein (Bos taurus)=milk | C:[milk] | C:[] ?:Casein (Bos taurus)(milk) R | C:[milk] | 14878 |
| V06#2 | Ovalbumin (Gallus gallus)=egg | C:[egg] | C:[] ?:Ovalbumin(egg); sodium lauryl sulfate(unknown) R | C:[egg] ?:sodium lauryl sulfate(unknown) R | 22474 |
| V07#2 | Arachis hypogaea protein isolate=peanut | C:[peanut] | C:[] ?:Arachis hypogaea protein isolate(unknown); maltodextrin(unknown) R | C:[peanut] ?:maltodextrin(unknown) R | 16876 |
| V08#2 | Glycine max protein hydrolysate=soy | C:[] | C:[] ?:Glycine max protein hydrolysate(unknown) R | C:[] ?:Glycine max protein hydrolysate(unknown) R | 11340 |
| V09#2 | wheat starch=wheat | C:[wheat] R | C:[] ?:wheat starch(wheat); propylene glycol(unknown) R | C:[wheat] R | 14357 |
| V10#2 | soy flour=soy | C:[soy] | C:[] ?:soy flour(soy) R | C:[soy] | 13533 |
| V11#2 | maltodextrin from wheat=wheat | C:[wheat] | C:[] ?:maltodextrin(wheat) ABS:maltodextrin from wheat R REJ:0/8 | C:[wheat] ABS:maltodextrin from wheat R REJ:0/8 | 65877 |
| V12#2 | sodium caseinate=milk | C:[milk] | C:[] ?:sodium caseinate(milk); glycerin(unknown) R | C:[milk] | 23641 |
| V13#2 | Natural flavor=ambiguous R | C:[] R | C:[] ?:yeast extract(unknown) R | C:[] ?:yeast extract(unknown) R | 14300 |
| V14#2 | Vegetable protein=ambiguous R | C:[] | C:[] | C:[] | 21495 |
| V15#2 | Hydrolyzed plant protein=ambiguous R | C:[] | C:[] ?:Hydrolyzed plant protein(soy); disodium inosinate(unknown) R | C:[] ?:Hydrolyzed plant protein(soy); disodium inosinate(unknown) R | 21775 |
| V16#2 | none | C:[milk] | C:[] ?:oats(unknown) R | C:[milk] | 14597 |
| V17#2 | soy lecithin=soy | C:[soy] | C:[] ?:soy lecithin(soy) R | C:[soy] | 13178 |
| V18#2 | soy sauce (water, wheat, soybeans, salt)=soy; soy sauce (water, wheat, soybeans, salt)=wheat | C:[soy,wheat] | C:[] ?:soy sauce(soy); wheat(wheat); soybeans(soy) ABS:Water chestnut, bamboo shoots, soy sauce (water, wheat, soybeans, salt R | C:[soy,wheat] ABS:Water chestnut, bamboo shoots, soy sauce (water, wheat, soybeans, salt R | 83436 |
| V19#2 | none | C:[milk] | C:[] ?:apples(unknown); sugar(unknown); cinnamon(unknown); pectin(unknown) R REJ:0/9 | C:[milk] ?:pectin(unknown) R REJ:0/9 | 82117 |
| V20#2 | none | C:[] | C:[] ?:Tiger nut flour(treenut); rice flour(unknown); tapioca starch(unknown) R | C:[] ?:Tiger nut flour(treenut); rice flour(unknown); tapioca starch(unknown) R | 29095 |
| V01#3 | Khoa=milk | C:[milk] | C:[] ?:milk solids(milk) R | C:[milk] | 10927 |
| V02#3 | Surimi=fish | C:[fish] | C:[] ?:Alaska pollock(fish) R | C:[fish] | 16192 |
| V03#3 | Tahini=sesame | C:[sesame] | C:[] ?:Tahini(sesame); salt(unknown) ABS:Tahini (100% roasted sesame seed R REJ:0/8 | C:[sesame] ?:salt(unknown) ABS:Tahini (100% roasted sesame seed R REJ:0/8 | 66367 |
| V04#3 | Lecithin de soja=soy | C:[soy] R | C:[] ?:Lecithin de soja(soy) R REJ:0/9 | C:[soy] R REJ:0/9 | 57841 |
| V05#3 | Casein (Bos taurus)=milk | C:[milk] | C:[] ?:Casein (Bos taurus)(milk) R | C:[milk] | 14436 |
| V06#3 | Ovalbumin (Gallus gallus)=egg | C:[egg] | C:[] ?:Ovalbumin(egg) R | C:[egg] | 14363 |
| V07#3 | Arachis hypogaea protein isolate=peanut | C:[peanut] | C:[] ?:Arachis hypogaea protein isolate(unknown); maltodextrin(unknown) R | C:[peanut] ?:maltodextrin(unknown) R | 13795 |
| V08#3 | Glycine max protein hydrolysate=soy | C:[] | C:[] ?:Glycine max protein hydrolysate(soy); citric acid(unknown) R | C:[] ?:Glycine max protein hydrolysate(soy); citric acid(unknown) R | 21856 |
| V09#3 | wheat starch=wheat | C:[wheat] R | C:[] ?:wheat starch(wheat) R | C:[wheat] R | 14703 |
| V10#3 | soy flour=soy | C:[soy] | C:[] ?:soy flour(soy) R REJ:0/8 | C:[soy] REJ:0/8 | 52630 |
| V11#3 | maltodextrin from wheat=wheat | C:[wheat] | C:[] ?:maltodextrin(wheat) ABS:carrier: maltodextrin from wheat R REJ:0/8 | C:[wheat] ABS:carrier: maltodextrin from wheat R REJ:0/8 | 65607 |
| V12#3 | sodium caseinate=milk | C:[milk] | C:[] ?:sodium caseinate(milk) R | C:[milk] | 14452 |
| V13#3 | Natural flavor=ambiguous R | C:[] R | C:[] ?:natural flavor(unknown); salt(unknown); yeast extract(unknown) R | C:[] ?:natural flavor(unknown); salt(unknown); yeast extract(unknown) R | 26418 |
| V14#3 | Vegetable protein=ambiguous R | C:[] | C:[] REJ:0/9 | C:[] REJ:0/9 | 63441 |
| V15#3 | Hydrolyzed plant protein=ambiguous R | C:[] | C:[] ?:Hydrolyzed plant protein(soy) R | C:[] ?:Hydrolyzed plant protein(soy) R | 14160 |
| V16#3 | none | C:[milk] | C:[] ?:oats(unknown); milk(milk) R REJ:0/8 | C:[milk] REJ:0/8 | 59060 |
| V17#3 | soy lecithin=soy | C:[soy] | C:[] ?:soy lecithin(soy) R REJ:0/8 | C:[soy] REJ:0/8 | 50427 |
| V18#3 | soy sauce (water, wheat, soybeans, salt)=soy; soy sauce (water, wheat, soybeans, salt)=wheat | C:[soy,wheat] | C:[] ?:soy sauce(soy); wheat(wheat); soybeans(soy) ABS:Water chestnut, bamboo shoots, soy sauce (water, wheat, soybeans, salt R | C:[soy,wheat] ABS:Water chestnut, bamboo shoots, soy sauce (water, wheat, soybeans, salt R | 81640 |
| V19#3 | none | C:[milk] | C:[] ?:apples(unknown) R | C:[milk] | 14161 |
| V20#3 | none | C:[] | C:[] ?:Tiger nut flour(treenut); rice flour(unknown); tapioca starch(unknown) R REJ:0/9 | C:[] ?:Tiger nut flour(treenut); rice flour(unknown); tapioca starch(unknown) R REJ:0/9 | 71766 |
