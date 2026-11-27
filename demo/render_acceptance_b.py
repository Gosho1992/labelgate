"""Fresh acceptance set B (Nov 26, after the verified-label-library build). Integration check only, NOT a benchmark.
Six cases requested by the reviewer (GPT): facility wording, placeholder behind an ES field label, a correct label,
a real missing declaration, a multilingual ingredient, and a deliberately wrong transcription the reviewer must catch.
All documents are SYNTHETIC. Expected outcomes are frozen in bench/acceptance/EXPECTED-B-2026-11-26.json together with
the SHA-256 of every image, before any model run on these images. Do not change rules to fit these cases.
"""
import importlib.util
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE.parent / "public" / "acceptance"; OUT.mkdir(parents=True, exist_ok=True)


def load(name, path):
    s = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m


r = load("r", HERE.parent / "bench" / "specproof" / "render.py")
dm = load("dm", HERE / "render_demo.py")


def spec(lang, product, items, stmt):
    return {"id": "SEAS-01", "kind": "spec", "language": lang, "supplier": "Northfield Flavor Co.", "product": product,
            "ingredients": [{"printed": p} for p in items], "allergen_statement_printed": stmt}


SPECS = {
    # B1: facility / shared-equipment wording only. No allergen is an ingredient.
    "B1-spec-en-facility": ("photo", spec("en", "Savory Seasoning Blend SB-200 · Revision 3 (2026-11-24)",
        ["Salt", "Sugar", "Paprika", "Garlic powder", "Yeast extract", "Rosemary extract"],
        "Allergens: none of the major allergens as ingredients. Manufactured in a factory that also handles peanuts and tree nuts; shared equipment with soy products.")),
    # B2: placeholder behind a Spanish field label ("Otros: no aplica") must not become an ingredient. Milk is real.
    "B2-spec-es-placeholder": ("photo", spec("es", "Mezcla de condimentos SB-200 · Revisión 3 (2026-11-24)",
        ["Sal", "Azúcar", "Leche desnatada en polvo", "Cebolla en polvo", "Otros: no aplica"],
        "Alérgenos: leche.")),
    # B4: Japanese spec introduces soy (and wheat) through soy sauce powder.
    "B4-spec-ja-soy": ("photo", spec("ja", "調味料ミックス SB-200 · 改訂3 (2026-11-24)",
        ["食塩", "砂糖", "醤油粉末（大豆・小麦を含む）", "たまねぎ粉末", "香辛料"],
        "アレルゲン：大豆、小麦")),
    # B5: multilingual ingredient names, no allergen statement at all: whey (milk) and soy lecithin only in Spanish words.
    "B5-spec-es-whey-nostatement": ("photo", spec("es", "Mezcla de condimentos SB-200 · Revisión 3 (2026-11-24)",
        ["Sal", "Suero de leche en polvo", "Lecitina de soja", "Ajo en polvo", "Pimentón"],
        None)),
}

BASE = "INGREDIENTS: ENRICHED WHEAT FLOUR (WHEAT FLOUR, NIACIN, REDUCED IRON, THIAMINE MONONITRATE, RIBOFLAVIN, FOLIC ACID), SUNFLOWER OIL, "
SEAS_MILK = "SEASONING (SALT, MALTODEXTRIN, ONION POWDER, GARLIC POWDER, SPICES, YEAST EXTRACT, NATURAL FLAVOR (MILK), SILICON DIOXIDE)"
SEAS_PLAIN = SEAS_MILK.replace("NATURAL FLAVOR (MILK),", "NATURAL FLAVOR,")
LABELS = {
    # B3: correct new Pretzel Bites artwork for the demo revision-2 spec.
    "B3-label-pretzel-correct": ("SEASONED PRETZEL BITES", "8 oz (227g)", f"INGREDIENTS: WHEAT FLOUR, {SEAS_MILK}.", "CONTAINS: WHEAT, MILK.", None),
    # B5: crackers label for the whey/soy revision, declaring all three.
    "B5-label-crackers-whey-soy": ("CRISPY GARDEN CRACKERS", "6 oz (170g)",
        BASE + "SEASONING (SALT, WHEY (MILK), SOY LECITHIN, GARLIC POWDER, PAPRIKA).", "CONTAINS: WHEAT, MILK, SOY.", None),
    # B6: Pretzel Bites artwork with only a design change (new net weight). Milk is still NOT declared.
    # The acceptance harness additionally injects a deliberately wrong reading that claims milk is declared.
    "B6-label-pretzel-netwt": ("SEASONED PRETZEL BITES", "10 oz (283g)", f"INGREDIENTS: WHEAT FLOUR, {SEAS_PLAIN}.", None, None),
}

if __name__ == "__main__":
    for k, (cond, c) in SPECS.items():
        img = r.apply(r.render_spec(c), cond, k)
        img.save(OUT / f"{k}.jpg", quality=88)
    for k, v in LABELS.items():
        dm.label_img(*v).save(OUT / f"{k}.png")
    print(sorted(p.name for p in OUT.iterdir() if p.name.startswith("B")))
