#!/usr/bin/env python3
"""Портрети банера сторінки пілота (4:5, 640 і 420 px WebP) з тих самих файлів Commons, що й аватари 96 px.

    python3 scripts/curated/driver_hero.py [--cache DIR] [--only hamilton,norris]

Для кожного пілота з портретом (src/data/curated/drivers.json і driver-portraits.json — поле credit.page):
imageinfo (Commons API, пакетами по 50, ліцензія звіряється з credit) → мініатюра 960 px від Wikimedia →
кадр 4:5 (по горизонталі — центр, по вертикалі — ближче до верху: обличчя на портретах там) →
public/img/drivers/<id>-420.webp / -640.webp → src/data/curated/driver-heroes.json ({id: [фактичні ширини]}).
Вузьке джерело: кадр < 520 px — лише малий файл; кадр < 300 px — без банера (сторінка покаже ініціали).
Окреме фото банера (не те, що в аватарі) — згодом адмінка (фаза 7). Потрібен Pillow.
"""
from __future__ import annotations

import io
import json
import sys
import urllib.parse
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import team_facts as tf  # noqa: E402 — клієнт з паузою, Retry-After і кешем
from hero_photos import fetch_bytes  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT_DIR = REPO / "public/img/drivers"
OUT = REPO / "src/data/curated/driver-heroes.json"
COMMONS = "https://commons.wikimedia.org/w/api.php"
SOURCE_WIDTH = 960  # стандартна ширина мініатюр Wikimedia (нестандартні — HTTP 429)
WIDTHS = (640, 420)
MIN_WIDTH = 300
QUALITY = 66
BIG_MIN = 520  # вужчий кадр — лише малий файл (великий був би тим самим зображенням)
NOMINAL = (420, 640)
FOCUS_Y = 0.2  # частка зайвої висоти, що зрізається зверху


def crop_4x5(img: Image.Image) -> Image.Image:
    w, h = img.size
    if w * 5 > h * 4:  # зашироке: центр по горизонталі
        cw = h * 4 // 5
        left = (w - cw) // 2
        return img.crop((left, 0, left + cw, h))
    ch = w * 5 // 4
    top = int((h - ch) * FOCUS_Y)
    return img.crop((0, top, w, top + ch))


def credits() -> dict[str, dict]:
    """id → credit показаного портрета (той самий порядок, що в src/lib/data/drivers.ts: кураторський → ручний → зібраний)."""
    out: dict[str, dict] = {}
    portraits = json.loads((REPO / "src/data/curated/driver-portraits.json").read_text(encoding="utf-8"))["drivers"]
    for ref, p in portraits.items():
        c = (p.get("manual") or {}).get("credit") or p.get("credit")
        if c:
            out[ref] = c
    for ref, d in json.loads((REPO / "src/data/curated/drivers.json").read_text(encoding="utf-8"))["drivers"].items():
        if d.get("avatar") and d.get("credit"):
            out[ref] = d["credit"]
    return out


def main() -> int:
    if "--cache" in sys.argv:
        tf.CACHE = Path(sys.argv[sys.argv.index("--cache") + 1])
        tf.CACHE.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    cr = {k: v for k, v in credits().items() if not only or k in only}
    files = {ref: urllib.parse.unquote(c["page"].split("/wiki/", 1)[1]).replace("_", " ") for ref, c in cr.items()}
    info: dict[str, dict] = {}
    for part in tf.chunks(sorted(set(files.values()))):
        q = {"action": "query", "format": "json", "formatversion": "2", "prop": "imageinfo", "titles": "|".join(part),
             "iiprop": "url|size|extmetadata", "iiurlwidth": str(SOURCE_WIDTH), "iiextmetadatafilter": "LicenseShortName"}
        d = tf.get(COMMONS + "?" + urllib.parse.urlencode(q))["query"]
        alias = {x["from"]: x["to"] for x in d.get("normalized", [])}
        for p in d["pages"]:
            ii = (p.get("imageinfo") or [None])[0]
            if ii:
                info[p["title"]] = ii
        for k, v in alias.items():
            if v in info:
                info[k] = info[v]
    result = json.loads(OUT.read_text(encoding="utf-8"))["drivers"] if OUT.exists() else {}
    problems: list[str] = []
    for n, (ref, c) in enumerate(sorted(cr.items()), 1):
        if ref in result and all((OUT_DIR / f"{ref}-{w}.webp").exists() for w in NOMINAL[: len(result[ref])]):
            continue  # повторний запуск не качає готове (ліміти Wikimedia)
        ii = info.get(files[ref])
        if not ii:
            problems.append(f"{ref}: файл не знайдено на Commons ({files[ref]})")
            continue
        lic = ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
        if lic.replace("-", " ").lower() != c["license"].replace("-", " ").lower():
            problems.append(f"{ref}: ліцензія на Commons «{lic}» ≠ «{c['license']}» — без банера")
            continue
        try:
            src = crop_4x5(Image.open(io.BytesIO(fetch_bytes(ii["thumburl"]))).convert("RGB"))
        except Exception as e:  # noqa: BLE001 — один збій не зупиняє решту; повторний запуск добере
            problems.append(f"{ref}: {type(e).__name__} {e}")
            continue
        if src.width < MIN_WIDTH:
            problems.append(f"{ref}: кадр {src.width} px < {MIN_WIDTH} — без банера")
            continue
        # Імена файлів — за номінальною шириною (640 / 420); фактична (вужче джерело) — у JSON, для srcset.
        actual = [min(WIDTHS[1], src.width)] + ([min(WIDTHS[0], src.width)] if src.width >= BIG_MIN else [])
        for nominal, tw in zip((WIDTHS[1], WIDTHS[0]), actual):
            img = src.resize((tw, tw * 5 // 4), Image.Resampling.LANCZOS) if src.width != tw else src
            path = OUT_DIR / f"{ref}-{nominal}.webp"
            tmp = path.with_suffix(".tmp.webp")  # атомарно: обрив не лишає битий WebP
            img.save(tmp, "WEBP", quality=QUALITY, method=6)
            tmp.replace(path)
        result[ref] = actual
        print(f"{n}/{len(cr)} {ref}: {src.width}×{src.height} → {result[ref]}", flush=True)
        OUT.write_text(json.dumps({"drivers": dict(sorted(result.items()))}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    OUT.write_text(json.dumps({"drivers": dict(sorted(result.items()))}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    total = sum((OUT_DIR / f"{ref}-{w}.webp").stat().st_size for ref, v in result.items() for w in NOMINAL[: len(v)])
    print(f"\nбанерів: {len(result)} з {len(cr)}; WebP разом {total / 1024 / 1024:.1f} МБ")
    for p in problems:
        print("  " + p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
