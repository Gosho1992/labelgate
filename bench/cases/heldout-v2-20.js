// HELD-OUT v2 (H11–H30). Written on Nov 25, 2026, AFTER the dictionary (2026.11.25-1) and the extraction
// prompt (extract-v1) were frozen, and BEFORE any run of the app pipeline on these cases.
// RULE: never add a word from these cases to the dictionary or the prompt, and never edit gold after seeing results.
// test/holdout-guard.test.js enforces that the "unseen" key terms are absent from both.
//
// gold.contains = allergens really present (US major 9); gold.may = precautionary only;
// gold.review = a human must look (source not stated, contradiction, missing information).
// unseenTerm = the wording that carries the allergen and is NOT in the frozen dictionary or prompt.

export const HELDOUT_V2_20 = [
  // Scientific names
  { id: "H11", cat: "scientific", text: "Thickener: flour from Glycine max, guar gum, water.", gold: { contains: ["soy"], may: [], review: false }, unseenTerm: "Glycine max" },
  { id: "H12", cat: "scientific", text: "Topping: sliced kernels of Prunus dulcis, lightly toasted.", gold: { contains: ["treenut"], may: [], review: false }, unseenTerm: "Prunus dulcis" },
  { id: "H13", cat: "scientific", text: "Oil blend: rapeseed oil, oil of Sesamum indicum (10%).", gold: { contains: ["sesame"], may: [], review: false }, unseenTerm: "Sesamum indicum" },
  // Derivatives
  { id: "H14", cat: "derivative", text: "Binder: ovomucoid (0.5%), potato starch, water.", gold: { contains: ["egg"], may: [], review: false }, unseenTerm: "ovomucoid" },
  { id: "H15", cat: "derivative", text: "Crisp mix: corn, rice, kamaboko pieces (2%), salt.", gold: { contains: ["fish"], may: [], review: false }, unseenTerm: "kamaboko" },
  { id: "H20", cat: "derivative", text: "Coating mix: einkorn flour, rice flour, salt.", gold: { contains: ["wheat"], may: [], review: false }, unseenTerm: "einkorn" },
  { id: "H29", cat: "derivative", text: "Pasta: semola di grano duro, water.", gold: { contains: ["wheat"], may: [], review: false }, unseenTerm: "grano duro" },
  // Carriers
  { id: "H16", cat: "carrier", text: "Omega-3 powder: maltodextrin, refined oil of Clupea harengus, glucose syrup, antioxidant.", gold: { contains: ["fish"], may: [], review: false }, unseenTerm: "Clupea harengus" },
  { id: "H17", cat: "carrier", text: "Natural vanilla flavour (carrier: dried quark powder), sugar.", gold: { contains: ["milk"], may: [], review: false }, unseenTerm: "quark" },
  // Compound ingredients
  { id: "H18", cat: "compound", text: "Satay sauce (water, monkey nut paste, chilli, palm sugar, salt).", gold: { contains: ["peanut"], may: [], review: false }, unseenTerm: "monkey nut" },
  { id: "H19", cat: "compound", text: "Fried rice seasoning [salt, sugar, dried krill powder, garlic].", gold: { contains: ["shellfish"], may: [], review: false }, unseenTerm: "krill" },
  { id: "H30", cat: "compound", text: "Pastry: wheat flour, butter, egg wash, Corylus avellana praline (20%).", gold: { contains: ["wheat", "milk", "egg", "treenut"], may: [], review: false }, unseenTerm: "Corylus avellana" },
  // Negatives (no major allergen; several contain look-alike words)
  { id: "H21", cat: "negative", text: "Ingredients: water chestnuts, coconut milk, salt.", gold: { contains: [], may: [], review: false } },
  { id: "H22", cat: "negative", text: "Ingredients: sunflower seed butter, cane sugar, sunflower oil, salt.", gold: { contains: [], may: [], review: false } },
  { id: "H23", cat: "negative", text: "Ingredients: rice, nutritional yeast, cream of tartar, salt.", gold: { contains: [], may: [], review: false } },
  { id: "H24", cat: "negative", text: "Ingredients: potatoes, sunflower oil, sea salt, rosemary.", gold: { contains: [], may: [], review: false } },
  // Ambiguous (source not stated -> review)
  { id: "H25", cat: "ambiguous", text: "Glaze: sugar, water, modified starch, flavouring preparation (composition on request).", gold: { contains: [], may: [], review: true } },
  { id: "H26", cat: "ambiguous", text: "Batter: starch, raising agents, protein isolate (source not stated), salt.", gold: { contains: [], may: [], review: true } },
  // Contradiction
  { id: "H27", cat: "contradiction", text: "Allergens: none declared. Ingredients: rice crackers, nori, katsuobushi flakes, soy-free tamari alternative.", gold: { contains: ["fish"], may: [], review: true }, unseenTerm: "katsuobushi" },
  // Precautionary wording not in the dictionary's precaution list
  { id: "H28", cat: "precaution", text: "Ingredients: oats, raisins, sunflower seeds. Made in a bakery where hazelnuts and sesame are handled.", gold: { contains: [], may: ["treenut", "sesame"], review: false } },
];
