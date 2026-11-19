#!/usr/bin/env python3
"""Векторизація логотипа Outlap (растр від користувача, 19.11.2026) у SVG-контури.

Запуск (з кореня репо):
    python3 scripts/assets/logo_trace.py scripts/assets/source/outlap-logo-source.jpg

Вихід:
  - src/components/site/logo-paths.ts          — контури для компонента <Logo> (шапка, підвал, адмінка);
  - public/brand/*.svg                         — готові SVG: логотип для світлого й темного тла, знак, повний (з підписом);
  - scripts/assets/logo-meta.json              — viewBox і виміряні кольори (читає favicons.mjs і og/build.mjs).

Як працює: піксельні поля «темне» і «червоне» (з кольору, без маски по яскравості — тож без білого ореолу на краях JPEG),
зв'язні компоненти (8-зв'язність) і розподіл їх по частинах:
  - знак: темні компоненти заввишки > половини логотипа (дорога й тонкі лінії бордюру) і червоні блоки зліва;
  - напис «OUTLAP»: решта компонентів; підпис «THE F1 HUB»: дрібні темні компоненти (літери низької висоти).
«Папір» — світлі смуги бордюру між червоними блоками: світлі пікселі, замкнені темними лініями й дотичні до червоних блоків
знака. Літера «O» стоїть усередині вигину дуги, тож ділити знак і напис вертикальною межею не можна — лише за компонентами.
Контури — contourpy на рівні з піднятого вдвічі зображення (субпіксельно), спрощення shapely; fill-rule=evenodd
(отвори літер O, A, P — дірки контурів).
"""
import json
import sys
from pathlib import Path

import contourpy
import numpy as np
from PIL import Image, ImageFilter
from shapely.geometry import LinearRing

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "scripts/assets/source/outlap-logo-source.jpg"
UP = 2          # у скільки разів піднімаємо перед контуруванням
TOL = 0.22      # допуск спрощення, px вихідного зображення

im = Image.open(SRC).convert("RGB")
W, H = im.size
big = im.resize((W * UP, H * UP), Image.Resampling.LANCZOS)
rgb = np.asarray(big).astype(float)
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
L = 0.299 * R + 0.587 * G + 0.114 * B
HH, WW = L.shape

# Виміряні кольори (медіана по «чистих» пікселях).
red_raw = np.clip((R - np.maximum(G, B)) / 194.0, 0, 1)
INK = np.median(rgb[(L < 70) & (red_raw < 0.05)], axis=0).round().astype(int)
RED = np.median(rgb[red_raw > 0.9], axis=0).round().astype(int)
hexc = lambda c: "#%02X%02X%02X" % tuple(int(v) for v in c)
ink_l = float(0.299 * INK[0] + 0.587 * INK[1] + 0.114 * INK[2])
red_cov = np.clip((R - np.maximum(G, B)) / float(RED[0] - max(RED[1], RED[2])), 0, 1)
dark_cov = np.clip((255 - L) / (255 - ink_l), 0, 1) * (1 - np.clip(red_cov * 1.1, 0, 1))

dark_bin = dark_cov > 0.45
red_bin = red_cov > 0.42


def label(mask: np.ndarray):
    """8-зв'язні компоненти. Повертає (мітки, [(x0, y0, x1, y1)])."""
    lab = np.zeros(mask.shape, np.int32)
    boxes = []
    n = 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]:
            continue
        n += 1
        lab[y0, x0] = n
        stack = [(y0, x0)]
        bx0 = bx1 = x0
        by0 = by1 = y0
        while stack:
            y, x = stack.pop()
            if x < bx0: bx0 = x
            if x > bx1: bx1 = x
            if y < by0: by0 = y
            if y > by1: by1 = y
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < HH and 0 <= nx < WW and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        stack.append((ny, nx))
        boxes.append((bx0, by0, bx1, by1))
    return lab, boxes


def grow(mask: np.ndarray, size: int) -> np.ndarray:
    return np.asarray(Image.fromarray((mask * 255).astype("uint8")).filter(ImageFilter.MaxFilter(size))) > 127


dlab, dboxes = label(dark_bin)
rlab, rboxes = label(red_bin)

big_h = 0.5 * HH
# Знак: дорога й тонкі лінії (висота > половини логотипа) + дрібні уламки кінчика дуги, що лежать вище рядка літер.
mark_dark = [i + 1 for i, (x0, y0, x1, y1) in enumerate(dboxes) if (y1 - y0) > big_h or y1 < 0.2 * HH]
tag_dark = [i + 1 for i, (x0, y0, x1, y1) in enumerate(dboxes) if (y1 - y0) < 0.12 * HH and (y1 - y0) > 4]
word_dark = [i + 1 for i, (x0, y0, x1, y1) in enumerate(dboxes)
             if (i + 1) not in mark_dark and (i + 1) not in tag_dark and (y1 - y0) > 0.12 * HH]
mark_red = [i + 1 for i, (x0, y0, x1, y1) in enumerate(rboxes) if (x0 + x1) / 2 < 0.45 * WW and (y1 - y0) > 4]
word_red = [i + 1 for i, (x0, y0, x1, y1) in enumerate(rboxes) if (i + 1) not in mark_red and (y1 - y0) > 4]
print("dark comps: mark", len(mark_dark), "word", len(word_dark), "tag", len(tag_dark), "| red: mark", len(mark_red), "word", len(word_red))

# «Папір»: світлі пікселі, замкнені (не пов'язані з тлом), дотичні до червоних блоків знака.
light = (dark_cov < 0.5) & (red_cov < 0.5)
bg = np.zeros(light.shape, bool)
stack = [(0, 0)]
bg[0, 0] = True
while stack:
    y, x = stack.pop()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            ny, nx = y + dy, x + dx
            if 0 <= ny < HH and 0 <= nx < WW and light[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                stack.append((ny, nx))
enclosed = light & ~bg
elab, eboxes = label(enclosed)
mark_red_zone = grow(np.isin(rlab, mark_red), 15)
paper_ids = [i + 1 for i in range(len(eboxes)) if (mark_red_zone & (elab == i + 1)).any()]
print("paper comps:", len(paper_ids))


def trace(field: np.ndarray, sel: np.ndarray, level: float, blur: float = 0.8):
    """Контури поля field на рівні level, лише всередині маски sel (розширеної на 2 px — щоб зберегти край)."""
    f = field * grow(sel, 5)
    img = Image.fromarray((np.clip(f, 0, 1) * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(blur))
    z = np.pad(np.asarray(img).astype(float) / 255.0, 1)
    gen = contourpy.contour_generator(z=z, line_type=contourpy.LineType.Separate)
    rings = []
    for line in gen.lines(level):
        pts = (np.asarray(line) - 1) / UP
        if len(pts) < 4:
            continue
        ring = LinearRing(pts)
        if ring.length < 2.5:
            continue
        c = np.asarray(ring.simplify(TOL, preserve_topology=True).coords)[:-1]
        if len(c) >= 3:
            rings.append(c)
    return rings


def to_path(rings, nd: int) -> str:
    """nd — знаків після коми: 1 для окремих SVG (великі розміри), 0 для вбудованих у сторінку (менший HTML)."""
    fmt = (lambda v: f"{v:.1f}".removesuffix(".0")) if nd else (lambda v: f"{v:.0f}")
    return "".join("M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in c) + "Z" for c in rings)


sel = lambda lab, ids: np.isin(lab, ids)
paper_field = grow(np.isin(elab, paper_ids), 3).astype(float)
rings = {
    "mark": {
        "paper": trace(paper_field, sel(elab, paper_ids), 0.5, 0.6),
        "red": trace(red_cov, sel(rlab, mark_red), 0.42),
        "ink": trace(dark_cov, sel(dlab, mark_dark), 0.45),
    },
    "word": {"red": trace(red_cov, sel(rlab, word_red), 0.42), "ink": trace(dark_cov, sel(dlab, word_dark), 0.45)},
    "tag": {"ink": trace(dark_cov, sel(dlab, tag_dark), 0.45, 0.7)},
}
# Напис «OUTLAP» збільшено (побажання користувача 19.11: «літери трохи більші»): масштаб S відносно лівого краю «O» і
# вертикального центру напису; знак-дуга лишається як є. Підпис «THE F1 HUB» не масштабуємо, лише опускаємо на приріст
# нижньої половини напису. viewBox розширюється праворуч на приріст ширини.
WORD_SCALE = float(__import__("os").environ.get("OUTLAP_WORD_SCALE", "1.22"))
wb = [dboxes[i - 1] for i in word_dark] + [rboxes[i - 1] for i in word_red]
wx0 = min(b[0] for b in wb) / UP
wx1 = max(b[2] for b in wb) / UP
wy0 = min(b[1] for b in wb) / UP
wy1 = max(b[3] for b in wb) / UP
wcy = (wy0 + wy1) / 2
S = WORD_SCALE
for name, rs in rings["word"].items():
    rings["word"][name] = [np.column_stack((S * c[:, 0] + wx0 * (1 - S), S * c[:, 1] + wcy * (1 - S))) for c in rs]
tag_dy = (S - 1) * (wy1 - wcy)
for name, rs in rings["tag"].items():
    rings["tag"][name] = [c + np.array([0.0, tag_dy]) for c in rs]
new_x1 = S * wx1 + wx0 * (1 - S)
W0 = W
W = int(np.ceil(new_x1 + (W0 - wx1)))                # правий відступ — як був
print(f"напис ×{S}: x {wx0:.0f}..{wx1:.0f} → ..{new_x1:.0f}, y {wy0:.0f}..{wy1:.0f} (центр {wcy:.0f}); підпис ↓{tag_dy:.1f}; ширина {W0} → {W}")

layers = {k: {n: to_path(r, 1) for n, r in v.items()} for k, v in rings.items()}      # для public/brand/*.svg
inline = {k: {n: to_path(r, 0) for n, r in v.items()} for k, v in rings.items()}       # для компонента (менший HTML)
for k, v in layers.items():
    print(k, {n: len(s) for n, s in v.items()}, "| inline", {n: len(s) for n, s in inline[k].items()})

# Габарит знака (для favicon/OG): обгортка компонентів знака, у px вихідного зображення.
big_marks = [i for i in mark_dark if (dboxes[i - 1][3] - dboxes[i - 1][1]) > big_h]   # без дрібних уламків кінчика
mx0 = min(dboxes[i - 1][0] for i in big_marks) / UP
mx1 = max(dboxes[i - 1][2] for i in big_marks) / UP
vb = f"0 0 {W} {H}"
meta = {
    "viewBox": [0, 0, W, H],
    "ink": hexc(INK),
    "red": hexc(RED),
    "light": "#F3F4F1",
    "markBox": [round(float(mx0), 1), 0, round(float(mx1), 1), H],
}
(ROOT / "scripts/assets/logo-meta.json").write_text(json.dumps(meta, indent=2) + "\n")

ts = (
    "// Згенеровано scripts/assets/logo_trace.py з логотипа Outlap (растр користувача → вектор). Не редагувати вручну.\n"
    f"export const LOGO_VIEWBOX = \"{vb}\";\n"
    f"export const LOGO_ASPECT = {W / H:.4f};\n"
    f"export const LOGO_INK = \"{hexc(INK)}\";\n"
    f"export const LOGO_RED = \"{hexc(RED)}\";\n"
    f"export const LOGO_MARK = {json.dumps(inline['mark'])};\n"
    f"export const LOGO_WORD = {json.dumps(inline['word'])};\n"
    f"export const LOGO_TAG = {json.dumps(inline['tag'])};\n"
)
(ROOT / "src/components/site/logo-paths.ts").write_text(ts)

brand = ROOT / "public/brand"
brand.mkdir(exist_ok=True)


def svg(parts, ink, paper, red, vbox=vb, label=""):
    body = "".join(f'<path fill="{paper}" fill-rule="evenodd" d="{p["paper"]}"/>' for p in parts if p.get("paper"))
    body += "".join(f'<path fill="{red}" fill-rule="evenodd" d="{p["red"]}"/>' for p in parts if p.get("red"))
    body += "".join(f'<path fill="{ink}" fill-rule="evenodd" d="{p["ink"]}"/>' for p in parts if p.get("ink"))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vbox}" role="img" aria-label="{label}">{body}</svg>\n'


m, w, t = layers["mark"], layers["word"], layers["tag"]
LIGHT = "#F3F4F1"
mark_vb = f"{meta['markBox'][0]:.1f} 0 {meta['markBox'][2] - meta['markBox'][0]:.1f} {H}"
(brand / "outlap-logo.svg").write_text(svg([m, w, t], hexc(INK), "#FFFFFF", hexc(RED), label="Outlap — The F1 Hub"))
(brand / "outlap-logo-for-dark.svg").write_text(svg([m, w, t], LIGHT, LIGHT, hexc(RED), label="Outlap — The F1 Hub"))
(brand / "outlap-wordmark.svg").write_text(svg([m, w], hexc(INK), "#FFFFFF", hexc(RED), label="Outlap"))
(brand / "outlap-wordmark-for-dark.svg").write_text(svg([m, w], LIGHT, LIGHT, hexc(RED), label="Outlap"))
(brand / "outlap-mark.svg").write_text(svg([m], hexc(INK), "#FFFFFF", hexc(RED), vbox=mark_vb, label="Outlap"))
(brand / "outlap-mark-for-dark.svg").write_text(svg([m], LIGHT, LIGHT, hexc(RED), vbox=mark_vb, label="Outlap"))
print("ok:", meta)
