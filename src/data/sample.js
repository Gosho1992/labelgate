// SYNTHETIC demo data. Company, supplier and product names are invented.
// Recall notices are written in the style of public FDA notices but are fictional.

export const specs = {
  "SEAS-01@1": { id: "SEAS-01@1", itemId: "SEAS-01", supplier: "Northfield Flavor Co.", revision: 1, effectiveDate: "2026-03-01", sha256: "seas01r1",
    text: "Product: Savory Seasoning Blend SB-200. Ingredients: salt, maltodextrin, onion powder, garlic powder, spices, yeast extract, natural flavour (plant-derived), silicon dioxide. Allergen statement: none of the major allergens are added. Produced in a facility that also processes sesame." },
  "SEAS-01@2": { id: "SEAS-01@2", itemId: "SEAS-01", supplier: "Northfield Flavor Co.", revision: 2, effectiveDate: "2026-11-20", sha256: "seas01r2",
    text: "Product: Savory Seasoning Blend SB-200. Ingredients: salt, maltodextrin, onion powder, garlic powder, spices, yeast extract, natural flavour (contains a milk-derived carrier), silicon dioxide. Produced in a facility that also processes sesame." },
  "FLOUR-02@4": { id: "FLOUR-02@4", itemId: "FLOUR-02", supplier: "Prairie Mills", revision: 4, effectiveDate: "2026-01-10", sha256: "flour02r4",
    text: "Enriched wheat flour (wheat flour, niacin, reduced iron, thiamine mononitrate, riboflavin, folic acid). Contains: wheat." },
  "OIL-03@2": { id: "OIL-03@2", itemId: "OIL-03", supplier: "Sunvale Oils", revision: 2, effectiveDate: "2025-09-01", sha256: "oil03r2",
    text: "High oleic sunflower oil, rosemary extract (antioxidant). No major allergens." },
  "CRUMB-04@1": { id: "CRUMB-04@1", itemId: "CRUMB-04", supplier: "Golden Crumb Ltd", revision: 1, effectiveDate: "2026-05-05", sha256: "crumb04r1",
    text: "Panko crumb: wheat flour, yeast, salt, sugar. Line also runs products with egg." },
  "NUT-05@3": { id: "NUT-05@3", itemId: "NUT-05", supplier: "Orchard Kernels", revision: 3, effectiveDate: "2026-02-14", sha256: "nut05r3",
    text: "Roasted chopped filberts (Corylus avellana). Packed on equipment that also handles peanuts." },
};

export const formulas = [
  { sku: "SKU-1001", name: "Crispy Garden Crackers", revision: 3, lines: [{ itemId: "FLOUR-02", pct: 70 }, { itemId: "OIL-03", pct: 12 }, { itemId: "SEAS-01", pct: 5 }] },
  { sku: "SKU-1002", name: "Herb Croutons", revision: 2, lines: [{ itemId: "CRUMB-04", pct: 80 }, { itemId: "OIL-03", pct: 15 }, { itemId: "SEAS-01", pct: 5 }] },
  { sku: "SKU-1003", name: "Seasoned Pretzel Bites", revision: 1, lines: [{ itemId: "FLOUR-02", pct: 85 }, { itemId: "SEAS-01", pct: 3 }] },
  { sku: "SKU-1004", name: "Nut Crunch Bar", revision: 5, lines: [{ itemId: "NUT-05", pct: 40 }, { itemId: "OIL-03", pct: 10 }] },
];

const signedV1 = { by: "QA reviewer", at: "2026-10-01T10:00:00Z" };
export const labels = [
  { id: "LBL-1001@3", sku: "SKU-1001", ingredientStatement: "Enriched wheat flour (wheat flour, niacin, reduced iron, thiamine mononitrate, riboflavin, folic acid), sunflower oil, seasoning (salt, maltodextrin, onion powder, garlic powder, spices, yeast extract, natural flavour, silicon dioxide).", containsStatement: "Contains: wheat.", precautionaryStatement: "May contain sesame.",
    approval: { ...signedV1, basedOn: { "FLOUR-02": "FLOUR-02@4", "OIL-03": "OIL-03@2", "SEAS-01": "SEAS-01@1" } } },
  { id: "LBL-1002@2", sku: "SKU-1002", ingredientStatement: "Bread crumbs (wheat flour, yeast, salt, sugar), sunflower oil, seasoning (salt, maltodextrin, onion powder, garlic powder, spices, yeast extract, natural flavour (milk), silicon dioxide).", containsStatement: null, precautionaryStatement: "May contain egg and sesame.",
    approval: { ...signedV1, basedOn: { "CRUMB-04": "CRUMB-04@1", "OIL-03": "OIL-03@2", "SEAS-01": "SEAS-01@1" } } },
  { id: "LBL-1003@1", sku: "SKU-1003", ingredientStatement: "Wheat flour, seasoning (salt, maltodextrin, onion powder, garlic powder, spices, yeast extract, natural flavour, silicon dioxide).", containsStatement: null, precautionaryStatement: null,
    approval: { ...signedV1, basedOn: { "FLOUR-02": "FLOUR-02@4", "SEAS-01": "SEAS-01@1" } } },
  { id: "LBL-1004@5", sku: "SKU-1004", ingredientStatement: "Hazelnuts, sunflower oil.", containsStatement: "Contains: tree nuts (hazelnut).", precautionaryStatement: "May contain peanuts.",
    approval: { ...signedV1, basedOn: { "NUT-05": "NUT-05@3", "OIL-03": "OIL-03@2" } } },
];

export const recallNotices = [
  { id: "RCL-DEMO-1", text: "FICTIONAL DEMO NOTICE. Northfield Flavor Co. is voluntarily recalling Savory Seasoning Blend SB-200, lots 2611A through 2614C, because it may contain undeclared milk. The seasoning was distributed to food manufacturers in 25 kg bags. People who have an allergy or severe sensitivity to milk run the risk of a serious or life-threatening allergic reaction." },
  { id: "RCL-DEMO-2", text: "FICTIONAL DEMO NOTICE. Bluewater Ingredients is recalling Dried Shrimp Powder because it was distributed without a crustacean shellfish declaration." },
];

/** Current revision per item after the supplier sent SEAS-01 revision 2. */
export const currentSpecByItem = { "SEAS-01": "SEAS-01@2", "FLOUR-02": "FLOUR-02@4", "OIL-03": "OIL-03@2", "CRUMB-04": "CRUMB-04@1", "NUT-05": "NUT-05@3" };
