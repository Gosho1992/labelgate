"""Synthetic DEMO documents for the Spec-to-Proof review (not evaluation data).
Supplier: Northfield Flavor Co. sends revision 2 of Savory Seasoning Blend SB-200 (item SEAS-01) as a photographed
Spanish spec sheet. Label artworks are the approved labels of the three products that use SEAS-01, plus one corrected label.
"""
import importlib.util, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

HERE = Path(__file__).parent
OUT = HERE.parent / "public" / "demo"
OUT.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location("r", HERE.parent / "bench" / "specproof" / "render.py")
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)

SPEC = {
    "id": "SEAS-01", "kind": "spec", "language": "es", "supplier": "Northfield Flavor Co.",
    "product": "Mezcla de condimentos SB-200 · Revisión 2 (2026-11-20)",
    "ingredients": [{"printed": p} for p in [
        "Sal", "Maltodextrina", "Cebolla en polvo", "Ajo en polvo", "Especias", "Extracto de levadura",
        "Aroma natural (contiene un portador derivado de la leche)", "Dióxido de silicio"]],
    "allergen_statement_printed": "Contiene: leche. Elaborado en una planta que también procesa sésamo.",
}

LABELS = {
    "LBL-1001-v3": ("CRISPY GARDEN CRACKERS", "6 oz (170g)",
        "INGREDIENTS: ENRICHED WHEAT FLOUR (WHEAT FLOUR, NIACIN, REDUCED IRON, THIAMINE MONONITRATE, RIBOFLAVIN, FOLIC ACID), SUNFLOWER OIL, SEASONING (SALT, MALTODEXTRIN, ONION POWDER, GARLIC POWDER, SPICES, YEAST EXTRACT, NATURAL FLAVOR, SILICON DIOXIDE).",
        "CONTAINS: WHEAT.", "MAY CONTAIN SESAME."),
    "LBL-1003-v1": ("SEASONED PRETZEL BITES", "8 oz (227g)",
        "INGREDIENTS: WHEAT FLOUR, SEASONING (SALT, MALTODEXTRIN, ONION POWDER, GARLIC POWDER, SPICES, YEAST EXTRACT, NATURAL FLAVOR, SILICON DIOXIDE).",
        None, None),
    "LBL-1002-v2": ("HERB CROUTONS", "5 oz (142g)",
        "INGREDIENTS: BREAD CRUMBS (WHEAT FLOUR, YEAST, SALT, SUGAR), SUNFLOWER OIL, SEASONING (SALT, MALTODEXTRIN, ONION POWDER, GARLIC POWDER, SPICES, YEAST EXTRACT, NATURAL FLAVOR (MILK), SILICON DIOXIDE).",
        None, "MAY CONTAIN EGG AND SESAME."),
    "LBL-1001-v4-corrected": ("CRISPY GARDEN CRACKERS", "6 oz (170g)",
        "INGREDIENTS: ENRICHED WHEAT FLOUR (WHEAT FLOUR, NIACIN, REDUCED IRON, THIAMINE MONONITRATE, RIBOFLAVIN, FOLIC ACID), SUNFLOWER OIL, SEASONING (SALT, MALTODEXTRIN, ONION POWDER, GARLIC POWDER, SPICES, YEAST EXTRACT, NATURAL FLAVOR (MILK), SILICON DIOXIDE).",
        "CONTAINS: WHEAT, MILK.", "MAY CONTAIN SESAME."),
}


def label_img(product, net, ing, contains, may):
    W = 1000
    img = Image.new("RGB", (W, 1400), (252, 248, 236))
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, W - 20, 150], fill=(40, 110, 60))
    d.text((50, 50), product, font=r.font("en", 40, True), fill="white")
    y = 180
    d.text((50, y), f"NET WT {net}", font=r.font("en", 24, True), fill="black"); y += 60
    f = r.font("en", 24)
    for line in r.wrap(d, ing, f, W - 110):
        d.text((50, y), line, font=f, fill="black"); y += 34
    if contains:
        y += 14; d.text((50, y), contains, font=r.font("en", 26, True), fill="black"); y += 40
    if may:
        y += 4; d.text((50, y), may, font=r.font("en", 22), fill="black"); y += 36
    y += 30
    d.text((50, y), "Distributed by Example Snacks Co. · SYNTHETIC DEMO LABEL", font=r.font("en", 18), fill=(90, 90, 90)); y += 40
    d.rectangle([20, 20, W - 20, y], outline=(0, 0, 0), width=3)
    return img.crop((0, 0, W, y + 20))


if __name__ == "__main__":
    s = r.apply(r.render_spec(SPEC), "photo", "demo-seas01")
    s.save(OUT / "SEAS-01-rev2-es.jpg", quality=88)
    for k, v in LABELS.items():
        label_img(*v).save(OUT / f"{k}.png")
    print(sorted(p.name for p in OUT.iterdir()))
