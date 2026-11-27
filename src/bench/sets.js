import { LEGACY_TUNING_20 } from "../../bench/cases/legacy-tuning-20.js";
import { LEGACY_HELDOUT_10 } from "../../bench/cases/legacy-heldout-10.js";
import { HELDOUT_V2_20 } from "../../bench/cases/heldout-v2-20.js";
import { HELDOUT_V3_20 } from "../../bench/cases/heldout-v3-20.js";
export const SETS = [
  { name: "Legacy tuning 20 (dictionary/prompt were tuned on these)", key: "legacy20", cases: LEGACY_TUNING_20 },
  { name: "Legacy held-out 10 (CONTAMINATED for app: words later added to dictionary+prompt)", key: "legacy10", cases: LEGACY_HELDOUT_10 },
  { name: "Held-out v2 20 (clean, never tuned on)", key: "v2", cases: HELDOUT_V2_20 },
];

/** Nov 26 checkpoint: only v3 is run (v2 is historical and frozen). */
export const SETS_V3 = [{ name: "Held-out v3 20 (authored by Nemotron, frozen before any run)", key: "v3", cases: HELDOUT_V3_20 }];
