#!/usr/bin/env python3
"""Широкі фото банера сторінки сезону (1280, 800 і 480 px WebP) з тих самих файлів Commons, що й у картках сезонів.

    python3 scripts/curated/season_heroes.py [--cache DIR] [--only 1988,2025]

Рішення користувача 13.11 (фаза 3f): банер — той самий файл Commons, що на картці сезону, широким кадром (кадрування —
CSS object-position, точка `focusY` — ручна, як у банерах команд). imageinfo (Commons API, пакетами по 50) → перевірка
ліцензії (має збігатися з атрибуцією в seasons.json, інакше банер прибираємо) → мініатюра 1280 px (менші — локально:
Wikimedia віддає лише стандартні ширини) → public/img/seasons/<рік>-hero-1280.webp / -800 / -480.webp → поле "hero"
сезону в src/data/curated/seasons.json. Повторний запуск не качає вже готові файли. ОДИН процес (ліміти Wikimedia).
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
from hero_photos import COMMONS, QUALITY, SOURCE_WIDTH, WIDTHS, fetch_bytes  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "public/img/seasons"
SEASONS = REPO / "src/data/curated/seasons.json"
MIN_WIDTH = 960  # = HERO_MIN_WIDTH у src/lib/data/season-page.ts


def main() -> int:
    if "--cache" in sys.argv:
        tf.CACHE = Path(sys.argv[sys.argv.index("--cache") + 1])
        tf.CACHE.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    data = json.loads(SEASONS.read_text(encoding="utf-8"))
    seasons = {y: s for y, s in data["seasons"].items() if s.get("credit") and (not only or y in only)}
    files = {y: urllib.parse.unquote(s["credit"]["page"].split("/wiki/", 1)[1]).replace("_", " ") for y, s in seasons.items()}
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
    total = 0
    problems: list[str] = []
    narrow: list[str] = []
    for y, s in sorted(seasons.items()):
        ii = info.get(files[y])
        if not ii:
            problems.append(f"{y}: файл не знайдено на Commons ({files[y]})")
            continue
        lic = ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
        if lic.replace("-", " ").lower() != s["credit"]["license"].replace("-", " ").lower():
            problems.append(f"{y}: ліцензія на Commons «{lic}» ≠ «{s['credit']['license']}» — банер прибрано")
            s.pop("hero", None)
            continue
        big = OUT / f"{y}-hero-{SOURCE_WIDTH}.webp"
        try:
            src = Image.open(big) if big.exists() else Image.open(io.BytesIO(fetch_bytes(ii["thumburl"])))
        except Exception as e:  # noqa: BLE001 — ліміт Wikimedia чи збій мережі: сезон без банера, решта йде далі
            problems.append(f"{y}: не завантажено ({e})")
            continue
        src = src.convert("RGB")
        if src.width < MIN_WIDTH:
            # Вужче за 960 px банер на всю ширину розтягувався б — сторінка покаже темний банер; файлів не лишаємо.
            for w in WIDTHS:
                (OUT / f"{y}-hero-{w}.webp").unlink(missing_ok=True)
            s.pop("hero", None)
            narrow.append(f"{y}: {src.width}×{src.height}")
            continue
        srcset = []
        size = None
        for w in WIDTHS:
            img = src.resize((w, round(src.height * w / src.width)), Image.Resampling.LANCZOS) if src.width > w else src
            path = OUT / f"{y}-hero-{w}.webp"
            if not (path == big and big.exists()):
                tmp = path.with_suffix(".tmp.webp")  # атомарно: обрив не лишає битий WebP
                img.save(tmp, "WEBP", quality=QUALITY, method=6)
                tmp.replace(path)
            total += path.stat().st_size
            srcset.append(f"/img/seasons/{path.name} {img.width}w")
            if w == WIDTHS[0]:
                size = (img.width, img.height)
        assert size
        focus = (s.get("hero") or {}).get("focusY")  # ручна точка кадрування — зберегти
        s["hero"] = {"src": f"/img/seasons/{y}-hero-{WIDTHS[0]}.webp", "srcSet": ", ".join(srcset),
                     "width": size[0], "height": size[1], **({"focusY": focus} if focus is not None else {})}
        print(f"{y}: {size[0]}×{size[1]}", flush=True)
    SEASONS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\nбанерів: {sum(1 for s in seasons.values() if 'hero' in s)} з {len(seasons)}; WebP разом {total / 1024 / 1024:.1f} МБ")
    if narrow:
        print(f"вужчі за {MIN_WIDTH} px — темний банер, потрібні інші фото (адмінка): " + ", ".join(narrow))
    for p in problems:
        print("  " + p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
