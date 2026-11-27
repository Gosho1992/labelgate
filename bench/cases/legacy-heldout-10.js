// VERBATIM COPY of labelgate/heldout.js (go/no-go v1, Nov 25 2026). Do not edit: these cases are the preserved earlier benchmark.
// NOTE: after go/no-go v1 these words were added to the app dictionary and prompt, so for the APP pipeline
// this set is CONTAMINATED (no longer held-out). Reported separately and labelled as such.
export const LEGACY_HELDOUT_10 = [
 {
  "id": "H1",
  "cat": "heldout",
  "text": "Protein crisp: rice, lactalbumin, cocoa powder, salt.",
  "gold": {
   "contains": [
    "milk"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "H2",
  "cat": "heldout",
  "text": "Flavour preparation contains a hydrolysate of crustacean origin (approx. 2%).",
  "gold": {
   "contains": [
    "shellfish"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "H3",
  "cat": "heldout",
  "text": "Binder: hydrolysed vegetable protein from Triticum aestivum, maltodextrin.",
  "gold": {
   "contains": [
    "wheat"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "H4",
  "cat": "heldout",
  "text": "Dressing: rapeseed oil, pasteurised hen's yolk, mustard, vinegar.",
  "gold": {
   "contains": [
    "egg"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "H5",
  "cat": "heldout",
  "text": "Granola: oats, honey, chopped filberts, raisins.",
  "gold": {
   "contains": [
    "treenut"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "H6",
  "cat": "heldout",
  "text": "Seasoning: salt, garlic, dried bonito flakes, kelp.",
  "gold": {
   "contains": [
    "fish"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "H7",
  "cat": "heldout",
  "text": "Ingredients: chickpeas, olive oil, lemon juice, salt. Line also runs products with peanuts; cleaning validated but not guaranteed.",
  "gold": {
   "contains": [],
   "may": [
    "peanut"
   ],
   "review": false
  }
 },
 {
  "id": "H8",
  "cat": "heldout",
  "text": "Cheese alternative: cashew base, coconut oil, cultures. Declared allergens: none.",
  "gold": {
   "contains": [
    "treenut"
   ],
   "may": [],
   "review": true
  }
 },
 {
  "id": "H9",
  "cat": "heldout",
  "text": "Snack bar: dates, marzipan, cocoa, sea salt.",
  "gold": {
   "contains": [
    "treenut"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "H10",
  "cat": "heldout",
  "text": "Noodles: buckwheat flour (60%), common wheat flour (40%), water.",
  "gold": {
   "contains": [
    "wheat"
   ],
   "may": [],
   "review": false
  }
 }
];
