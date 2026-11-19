#!/usr/bin/env python3
"""Знак Outlap — роундел з літерою «O» як колом траси (коло, яке виїжджає з піту і замикається лінією старт/фініш).

Єдине джерело геометрії. Запуск (з кореня репо):  python3 scripts/assets/roundel_gen.py
Пише:
  - scripts/assets/roundel.svg            — повний знак з жовтим колом (джерело для scripts/assets/favicons.mjs);
  - src/components/site/roundel-svg.ts    — лише внутрішня група (коло в шапці малює CSS .roundel / .ad-roundel).
Після запуску: node scripts/assets/favicons.mjs (PNG, ICO, favicon.svg) і node scripts/og/build.mjs (картки прев'ю).

Правила, на які спирається favicons.mjs: «спрощений» знак отримується викиданням контурів із stroke-width="2" і
шляхів із fill #E0301E / #F3F4F1 (поребрики, лінія старт/фініш); шлях кільця — єдиний зі stroke-width="9.2".
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DARK, RED, WHITE, YELLOW = "#16181D", "#E0301E", "#F3F4F1", "#FFC400"
CX = CY = 32.0
RX, RY = 12.4, 19.0        # серединна лінія кільця
TRACK = 9.2                # ширина «траси» (stroke)
KERB = 2.5                 # ширина поребрика
SEG = 7.5                  # кут одного поребрика, градуси
STEP = 2.5                 # крок дискретизації дуги, градуси


def pt(d: float, deg: float) -> tuple[float, float]:
    """Точка на відстані d від серединної лінії кільця (по нормалі — справжній офсет, не масштаб еліпса)."""
    a = math.radians(deg)
    nx, ny = math.cos(a) / RX, math.sin(a) / RY
    k = math.hypot(nx, ny)
    return CX + RX * math.cos(a) + d * nx / k, CY + RY * math.sin(a) + d * ny / k


def fmt(p: tuple[float, float]) -> str:
    return f"{p[0]:.2f} {p[1]:.2f}"


def arc(d: float, a0: float, a1: float) -> list[tuple[float, float]]:
    n = max(2, round(abs(a1 - a0) / STEP) + 1)
    return [pt(d, a0 + (a1 - a0) * i / (n - 1)) for i in range(n)]


EDGE = TRACK / 2           # зовнішній край траси
KEDGE = EDGE + KERB        # зовнішній край поребрика

# Поребрики з зовнішнього боку: вгорі ліворуч і внизу праворуч (як у попереднього знака — динаміка, не симетрія).
KERB_RANGES = [(190.0, 265.0), (10.0, 85.0)]

parts: list[str] = []
for start, end in KERB_RANGES:
    n = round((end - start) / SEG)
    for i in range(n):
        a0, a1 = start + i * SEG, start + (i + 1) * SEG
        outer = arc(EDGE, a0, a1)
        inner = arc(KEDGE, a1, a0)
        d = "M" + "L".join(fmt(p) for p in outer + inner) + "Z"
        parts.append(f'<path d="{d}" fill="{RED if i % 2 == 0 else WHITE}"/>')
    edge = arc(KEDGE, start, end)
    parts.append(
        f'<path d="M{"L".join(fmt(p) for p in edge)}" fill="none" stroke="{DARK}" stroke-width="2" '
        'stroke-linejoin="round" stroke-linecap="butt"/>'
    )

# Лінія старт/фініш: шашки поперек траси вгорі (напрямок руху там горизонтальний, лінія — вертикальна).
top = CY - RY
cols, rows = 2, 4
cw, rh = 1.6, TRACK / rows
for r in range(rows):
    for c in range(cols):
        if (r + c) % 2 == 0:
            x, y = CX - cw * cols / 2 + c * cw, top - TRACK / 2 + r * rh
            parts.append(f'<path d="M{x:.2f} {y:.2f}h{cw}v{rh:.2f}h-{cw}Z" fill="{WHITE}"/>')

# Кільце траси — останнім (зверху поребриків), єдиний шлях зі stroke-width 9.2.
ring = (
    f'<path d="M{CX + RX:.2f} {CY:.2f}A{RX} {RY} 0 1 1 {CX - RX:.2f} {CY:.2f}A{RX} {RY} 0 1 1 {CX + RX:.2f} {CY:.2f}Z" '
    f'fill="none" stroke="{DARK}" stroke-width="{TRACK}"/>'
)
# Кільце під поребриками й шашками: спершу кільце, потім усе інше — поребрики лежать поза кільцем, шашки — на ньому.
inner_group = ring + "".join(parts)
group = f'<g transform="translate(32 32) skewX(-13) translate(-32 -32)">{inner_group}</g>'

full = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    f'<circle cx="32" cy="32" r="29.5" fill="{YELLOW}" stroke="{DARK}" stroke-width="4"/>{group}</svg>\n'
)
(ROOT / "scripts/assets/roundel.svg").write_text(full)

ts = (
    "// Згенеровано scripts/assets/roundel_gen.py: знак Outlap — «O» як коло траси з бордюрами й лінією старт/фініш.\n"
    f"export const ROUNDEL_SVG = {json.dumps(group, ensure_ascii=False)};\n"
)
(ROOT / "src/components/site/roundel-svg.ts").write_text(ts)
print("ok", len(full), "B svg;", len(ts), "B ts")
