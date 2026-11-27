"""Fresh acceptance-check documents (Nov 26). Integration check only, NOT a benchmark. Synthetic."""
import importlib.util, json
from pathlib import Path
HERE = Path(__file__).parent
OUT = HERE.parent / "public" / "acceptance"; OUT.mkdir(parents=True, exist_ok=True)
def load(name, path):
    s = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
r = load("r", HERE.parent / "bench" / "specproof" / "render.py")
dm = load("dm", HERE / "render_demo.py")
SEAS = "SEASONING (SALT, MALTODEXTRIN, ONION POWDER, GARLIC POWDER, SPICES, YEAST EXTRACT, NATURAL FLAVOR, SILICON DIOXIDE)"
SEAS_MILK = SEAS.replace("NATURAL FLAVOR,", "NATURAL FLAVOR (MILK),")
BASE = "INGREDIENTS: ENRICHED WHEAT FLOUR (WHEAT FLOUR, NIACIN, REDUCED IRON, THIAMINE MONONITRATE, RIBOFLAVIN, FOLIC ACID), SUNFLOWER OIL, "
LABELS = {  # id: (product, net, ingredient text, contains, may)
  "A4-contains-inline": ("CRISPY GARDEN CRACKERS", "6 oz (170g)", BASE + SEAS + ". CONTAINS: WHEAT, MILK.", None, None),
  "A5-contains-split": ("CRISPY GARDEN CRACKERS", "6 oz (170g)", BASE + SEAS + ".", "CONTAINS: WHEAT,", "MILK."),
  "A6-maycontain-only": ("CRISPY GARDEN CRACKERS", "6 oz (170g)", BASE + SEAS + ".", None, "MAY CONTAIN MILK."),
  "A7-parenthetical-only": ("CRISPY GARDEN CRACKERS", "6 oz (170g)", BASE + SEAS_MILK + ".", None, None),
}
for k, (p, n, ing, c, m) in LABELS.items():
    img = dm.label_img(p, n, ing, c, m)
    img.save(OUT / f"{k}.png")
# A8: unreadable copy of the Spanish demo spec
base = r.render_spec(dm.SPEC)
r.stress(base, "A8").save(OUT / "A8-spec-unreadable.png")
# A9: Japanese version of the same supplier revision, with a "該当なし" line that must not become an ingredient
JA = {"id": "SEAS-01", "kind": "spec", "language": "ja", "supplier": "Northfield Flavor Co.", "product": "調味料ミックス SB-200 · 改訂2 (2026-11-20)",
      "ingredients": [{"printed": p} for p in ["食塩", "マルトデキストリン", "たまねぎ粉末", "にんにく粉末", "香辛料", "酵母エキス", "香料（乳由来の担体を含む）", "二酸化ケイ素", "その他: 該当なし"]],
      "allergen_statement_printed": "アレルゲン: 乳成分"}
r.apply(r.render_spec(JA), "clear", "A9").save(OUT / "A9-spec-ja-placeholder.png")
print(sorted(p.name for p in OUT.iterdir()))
