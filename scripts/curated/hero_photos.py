#!/usr/bin/env python3
"""Широкі фото банера сторінки команди (1280 і 640 px WebP) з тих самих файлів Commons, що й у картках.

    python3 scripts/curated/hero_photos.py [--cache DIR] [--only mclaren,ferrari]

Для кожної команди з photo.credit.page (сторінка файлу Commons) у src/data/curated/teams.json:
imageinfo (Commons API, пакетами по 50, з перевіркою ліцензії — та сама, що в credit) → мініатюри 1280 і 640 px
від Wikimedia → public/img/cars/<id>-hero-1280.webp / -640.webp → поле "hero" команди в teams.json.
Нове фото (команда без фото) додається не тут, а в адмінці (фаза 7): поле photo + credit, потім цей скрипт.
Потрібен Pillow (pip install pillow); нових npm-залежностей немає.
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

REPO = Path(__file__).resolve().parents[2]
TEAMS = REPO / "src/data/curated/teams.json"
OUT = REPO / "public/img/cars"
COMMONS = "https://commons.wikimedia.org/w/api.php"
# Wikimedia віддає мініатюри лише стандартних ширин (mediawiki.org «Common thumbnail sizes»: …, 960, 1280, 1920):
# нестандартна (640) — HTTP 429. Тому з Commons — лише 1280, 640 — зменшуємо самі.
SOURCE_WIDTH = 1280
WIDTHS = (1280, 640)
QUALITY = 72


def fetch_bytes(url: str) -> bytes:
    import time
    import urllib.error
    import urllib.request

    for attempt in range(6):
        wait = 1.5 - (time.time() - tf._last)
        if wait > 0:
            time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": tf.UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                tf._last = time.time()
                return r.read()
        except urllib.error.HTTPError as e:
            tf._last = time.time()
            if e.code in (429, 503) and attempt < 5:
                time.sleep(int(e.headers.get("Retry-After") or 0) or 10 * 2 ** attempt)
                continue
            raise
    raise RuntimeError(url)


def main() -> int:
    if "--cache" in sys.argv:
        tf.CACHE = Path(sys.argv[sys.argv.index("--cache") + 1])
        tf.CACHE.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    data = json.loads(TEAMS.read_text(encoding="utf-8"))
    teams = [t for t in data["teams"] if t.get("photo") and (not only or t["id"] in only)]
    files = {t["id"]: urllib.parse.unquote(t["photo"]["credit"]["page"].split("/wiki/", 1)[1]).replace("_", " ") for t in teams}
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
    problems = []
    for t in teams:
        ii = info.get(files[t["id"]])
        if not ii:
            problems.append(f"{t['id']}: файл не знайдено на Commons ({files[t['id']]})")
            continue
        lic = ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
        if lic.replace("-", " ").lower() != t["photo"]["credit"]["license"].replace("-", " ").lower():
            problems.append(f"{t['id']}: ліцензія на Commons «{lic}» ≠ «{t['photo']['credit']['license']}» — пропущено")
            continue
        srcset = []
        size = None
        big = OUT / f"{t['id']}-hero-{SOURCE_WIDTH}.webp"
        # Повторний запуск не качає вже готові файли (ліміти Wikimedia).
        src = Image.open(big) if big.exists() else Image.open(io.BytesIO(fetch_bytes(ii["thumburl"])))
        src = src.convert("RGB")
        for w in WIDTHS:
            img = src.resize((w, round(src.height * w / src.width)), Image.Resampling.LANCZOS) if src.width > w else src
            path = OUT / f"{t['id']}-hero-{w}.webp"
            if not (path == big and big.exists()):
                img.save(path, "WEBP", quality=QUALITY, method=6)
            total += path.stat().st_size
            srcset.append(f"/img/cars/{path.name} {img.width}w")
            if w == WIDTHS[0]:
                size = (img.width, img.height)
        assert size
        t["hero"] = {"src": f"/img/cars/{t['id']}-hero-{WIDTHS[0]}.webp", "srcSet": ", ".join(srcset),
                     "width": size[0], "height": size[1]}
        print(f"{t['id']}: {size[0]}×{size[1]}", flush=True)
    TEAMS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\nбанерів: {sum(1 for t in teams if 'hero' in t)} з {len(teams)}; WebP разом {total / 1024 / 1024:.1f} МБ")
    for p in problems:
        print("  " + p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
