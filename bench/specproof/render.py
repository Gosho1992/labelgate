"""Render the frozen Spec-to-Proof cases (specproof-v1.json) to images.
Specs look like a supplier specification sheet section; labels look like a retail label artwork panel.
Image conditions are assigned deterministically (not chosen after seeing model output):
  clear / rotated (3-4 deg) / blurred (Gaussian r=1.2) / photo (rotation + perspective-ish shear + noise + lighting).
Two extra STRESS images (U01, U02) are heavily degraded copies; expected outcome there is NEEDS REVIEW.
"""
import json, random, sys, hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

HERE = Path(__file__).parent
OUT = HERE / "images"
OUT.mkdir(exist_ok=True)
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SANS_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
CJK = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
CJK_B = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

CONDITIONS = {  # fixed before any model run
    "S01": "clear", "S02": "rotated", "S03": "blurred", "S04": "photo",
    "S05": "clear", "S06": "rotated", "S07": "photo",
    "S08": "clear", "S09": "blurred", "S10": "photo",
    "L01": "clear", "L02": "rotated", "L03": "clear", "L04": "photo", "L05": "blurred",
    "L06": "clear", "L07": "photo", "L08": "rotated", "L09": "clear", "L10": "blurred",
}


def font(lang, size, bold=False):
    if lang == "ja":
        return ImageFont.truetype(CJK_B if bold else CJK, size, index=0)
    return ImageFont.truetype(SANS_B if bold else SANS, size)


def wrap(draw, text, f, width):
    """Greedy wrap; for Japanese wrap per character."""
    lines, cur = [], ""
    units = list(text) if any("぀" <= ch <= "鿿" for ch in text) else text.split(" ")
    sep = "" if units and len(units[0]) == 1 and any("぀" <= ch <= "鿿" for ch in text) else " "
    for u in units:
        cand = (cur + sep + u) if cur else u
        if draw.textlength(cand, font=f) <= width:
            cur = cand
        else:
            if cur:
                lines.append(cur)
            cur = u
    if cur:
        lines.append(cur)
    return lines


HEAD = {
    "en": ("PRODUCT SPECIFICATION", "Supplier", "Product", "Ingredients (in descending order by weight)", "Allergen statement"),
    "es": ("FICHA TÉCNICA DE PRODUCTO", "Proveedor", "Producto", "Ingredientes (en orden decreciente de peso)", "Declaración de alérgenos"),
    "ja": ("製品規格書", "供給者", "製品名", "原材料（重量順）", "アレルゲン表示"),
}


def render_spec(c):
    lang = c["language"]
    W, H = 1100, 1000
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    h, ls, lp, li, la = HEAD[lang]
    d.rectangle([0, 0, W, 90], fill=(30, 60, 110))
    d.text((40, 25), h, font=font(lang, 34, True), fill="white")
    y = 120
    d.text((40, y), f"{ls}: {c['supplier']}", font=font(lang, 26), fill="black"); y += 45
    d.text((40, y), f"{lp}: {c['product']}", font=font(lang, 26), fill="black"); y += 60
    d.line([40, y, W - 40, y], fill=(120, 120, 120), width=2); y += 20
    d.text((40, y), li, font=font(lang, 26, True), fill="black"); y += 50
    f = font(lang, 26)
    for i, ing in enumerate(c["ingredients"], 1):
        for k, line in enumerate(wrap(d, ing["printed"], f, W - 140)):
            d.text((70, y), (f"{i}. " if k == 0 else "    ") + line, font=f, fill="black"); y += 40
    if c.get("allergen_statement_printed"):
        y += 20
        d.line([40, y, W - 40, y], fill=(120, 120, 120), width=2); y += 20
        d.text((40, y), la, font=font(lang, 26, True), fill="black"); y += 45
        for line in wrap(d, c["allergen_statement_printed"], f, W - 120):
            d.text((70, y), line, font=f, fill=(150, 0, 0)); y += 40
    return img.crop((0, 0, W, min(H, y + 50)))


def render_label(c):
    W = 1000
    img = Image.new("RGB", (W, 1400), (252, 248, 236))
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, W - 20, 150], fill=(180, 40, 40))
    d.text((50, 50), c["product"], font=font("en", 40, True), fill="white")
    y = 180
    d.text((50, y), f"NET WT {c['net_weight']}", font=font("en", 24, True), fill="black"); y += 60
    f = font("en", 24)
    for line in wrap(d, c["ingredient_list_printed"], f, W - 110):
        d.text((50, y), line, font=f, fill="black"); y += 34
    if c.get("contains_printed"):
        y += 14
        d.text((50, y), c["contains_printed"], font=font("en", 26, True), fill="black"); y += 40
    y += 30
    d.text((50, y), "Distributed by Example Foods Co. (synthetic test label)", font=font("en", 18), fill=(90, 90, 90)); y += 40
    d.rectangle([20, 20, W - 20, y], outline=(0, 0, 0), width=3)
    return img.crop((0, 0, W, y + 20))


def apply(img, cond, seed):
    rnd = random.Random(seed)
    if cond == "rotated":
        img = img.rotate(rnd.choice([-4, -3, 3, 4]), expand=True, fillcolor="white", resample=Image.BICUBIC)
    elif cond == "blurred":
        img = img.filter(ImageFilter.GaussianBlur(1.2))
    elif cond == "photo":
        img = img.rotate(rnd.choice([-2.5, 2.5]), expand=True, fillcolor=(205, 200, 190), resample=Image.BICUBIC)
        w, h = img.size
        img = img.transform((w, h), Image.AFFINE, (1, 0.03, -0.015 * h, 0.01, 1, 0), resample=Image.BICUBIC, fillcolor=(205, 200, 190))
        img = ImageEnhance.Brightness(img).enhance(0.92)
        px = img.load()
        for _ in range(w * h // 60):
            x, y = rnd.randrange(w), rnd.randrange(h)
            v = rnd.randint(-35, 35)
            r, g, b = px[x, y]
            px[x, y] = (max(0, min(255, r + v)), max(0, min(255, g + v)), max(0, min(255, b + v)))
        img = img.filter(ImageFilter.GaussianBlur(0.6))
    return img


def stress(img, seed):
    rnd = random.Random(seed)
    img = img.rotate(rnd.choice([-9, 9]), expand=True, fillcolor=(160, 160, 160))
    img = img.resize((img.width // 3, img.height // 3)).resize((img.width, img.height))
    img = img.filter(ImageFilter.GaussianBlur(3.5))
    return ImageEnhance.Contrast(img).enhance(0.45)


def main():
    data = json.loads((HERE / "specproof-v1.json").read_text(encoding="utf-8"))
    manifest = []
    for c in data["specs"] + data["labels"]:
        base = render_spec(c) if c["kind"] == "spec" else render_label(c)
        cond = CONDITIONS[c["id"]]
        img = apply(base, cond, c["id"])
        ext = "jpg" if cond == "photo" else "png"
        p = OUT / f"{c['id']}.{ext}"
        img.save(p, quality=88) if ext == "jpg" else img.save(p)
        manifest.append({"id": c["id"], "file": p.name, "condition": cond, "kind": c["kind"]})
        if c["id"] in ("S07", "L09"):  # stress copies (fixed choice: one spec, one label)
            sid = "U01" if c["kind"] == "spec" else "U02"
            q = OUT / f"{sid}.png"
            stress(base, sid).save(q)
            manifest.append({"id": sid, "file": q.name, "condition": "stress", "kind": c["kind"], "copy_of": c["id"], "expected": "NEEDS_REVIEW"})
    for m in manifest:
        m["sha256"] = hashlib.sha256((OUT / m["file"]).read_bytes()).hexdigest()
    (HERE / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")
    print(len(manifest), "images")


if __name__ == "__main__":
    main()
