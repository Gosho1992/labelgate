// VERBATIM COPY of labelgate/core.js CASES (go/no-go v1, Nov 25 2026). Do not edit: these cases are the preserved earlier benchmark.
export const LEGACY_TUNING_20 = [
 {
  "id": "S1",
  "cat": "simple",
  "text": "Ingredients: wheat flour, sugar, butter (milk), whole eggs, salt.",
  "gold": {
   "contains": [
    "wheat",
    "milk",
    "egg"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "S2",
  "cat": "simple",
  "text": "Ingredients: roasted peanuts, peanut oil, salt. Contains: peanuts.",
  "gold": {
   "contains": [
    "peanut"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "S3",
  "cat": "simple",
  "text": "Ingredients: water, egg yolk, distilled vinegar, soy lecithin, salt.",
  "gold": {
   "contains": [
    "egg",
    "soy"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "S4",
  "cat": "simple",
  "text": "Ingredients: sesame seeds, tahini (ground sesame), garlic, lemon juice.",
  "gold": {
   "contains": [
    "sesame"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "S5",
  "cat": "simple",
  "text": "Ingredients: cod fillet, breadcrumbs (wheat flour, yeast, salt), sunflower oil.",
  "gold": {
   "contains": [
    "fish",
    "wheat"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "M1",
  "cat": "messy",
  "text": "Natural flavor — contains milk-derived carrier. May contain traces of soy.",
  "gold": {
   "contains": [
    "milk"
   ],
   "may": [
    "soy"
   ],
   "review": false
  }
 },
 {
  "id": "M2",
  "cat": "messy",
  "text": "Seasoning blend: salt, spices, hydrolyzed vegetable protein (source: soy), whey powder, yeast extract. Processed on shared equipment that also processes sesame.",
  "gold": {
   "contains": [
    "soy",
    "milk"
   ],
   "may": [
    "sesame"
   ],
   "review": false
  }
 },
 {
  "id": "M3",
  "cat": "messy",
  "text": "Coating: rice flour, tapioca starch, egg white powder (albumen). This product is dairy-free and nut-free.",
  "gold": {
   "contains": [
    "egg"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "M4",
  "cat": "messy",
  "text": "Filling: almond paste (almonds, sugar), glucose syrup. Manufactured in a facility that does not handle peanuts.",
  "gold": {
   "contains": [
    "treenut"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "M5",
  "cat": "messy",
  "text": "Sauce base: water, tomato paste, Worcestershire sauce (vinegar, molasses, anchovies, tamarind), spices.",
  "gold": {
   "contains": [
    "fish"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "N1",
  "cat": "nested",
  "text": "Chocolate chips [sugar, chocolate liquor, cocoa butter, emulsifier (lecithin), vanilla]. Emulsifier source not specified by sub-supplier.",
  "gold": {
   "contains": [],
   "may": [],
   "review": true
  }
 },
 {
  "id": "N2",
  "cat": "nested",
  "text": "Crumb topping (enriched flour [wheat flour, niacin, iron], margarine [palm oil, water, salt, mono- and diglycerides, natural flavor (milk)]).",
  "gold": {
   "contains": [
    "wheat",
    "milk"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "N3",
  "cat": "nested",
  "text": "Prawn crackers: tapioca starch, palm oil, sugar, salt, dried prawn powder (5%), flavor enhancer (E621).",
  "gold": {
   "contains": [
    "shellfish"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "N4",
  "cat": "nested",
  "text": "Pesto: basil, sunflower oil, grana padano cheese (cow's milk, salt, rennet, egg lysozyme), pine nuts, garlic.",
  "gold": {
   "contains": [
    "milk",
    "egg",
    "treenut"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "N5",
  "cat": "nested",
  "text": "Glaze: icing sugar, water, flavouring (contains a butter-derived component), colour (E160a).",
  "gold": {
   "contains": [
    "milk"
   ],
   "may": [],
   "review": false
  }
 },
 {
  "id": "C1",
  "cat": "contradictory",
  "text": "Allergen statement: none. Ingredients: wheat flour, water, salt, yeast.",
  "gold": {
   "contains": [
    "wheat"
   ],
   "may": [],
   "review": true
  }
 },
 {
  "id": "C2",
  "cat": "contradictory",
  "text": "Ingredients: sugar, cocoa, natural and artificial flavors, emulsifier.",
  "gold": {
   "contains": [],
   "may": [],
   "review": true
  }
 },
 {
  "id": "C3",
  "cat": "contradictory",
  "text": "Contains: milk. Ingredients: oat base (water, oats), sunflower oil, calcium carbonate, salt.",
  "gold": {
   "contains": [
    "milk"
   ],
   "may": [],
   "review": true
  }
 },
 {
  "id": "C4",
  "cat": "contradictory",
  "text": "Spice mix: paprika, garlic, onion, mustard seed, celery seed. Allergen information: see page 2 (not provided).",
  "gold": {
   "contains": [],
   "may": [],
   "review": true
  }
 },
 {
  "id": "C5",
  "cat": "contradictory",
  "text": "Ingredients: whey protein isolate, cocoa, sucralose. Suitable for vegans.",
  "gold": {
   "contains": [
    "milk"
   ],
   "may": [],
   "review": true
  }
 }
];
