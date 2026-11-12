#!/usr/bin/env python3
"""Фото сезонів → public/img/seasons/<рік>-560.webp / -320.webp і src/data/curated/seasons.json.

    python3 scripts/curated/season_photos.py --mockup DIR [--cache DIR]

DIR — файли опублікованого макета «Сезони» (index.html + img/<рік>.jpg, 560 px): фото чемпіона кожного сезону,
точка кадрування (object-position), колір команди чемпіона того сезону і перелік авторів (у порядку карток).
Кожен файл звіряємо з Commons (imageinfo, LicenseShortName): невільна ліцензія (або NC/ND) — фото не беремо;
ліцензія макета розходиться з Commons — беремо ліцензію Commons і повідомляємо. Колір і пілот лишаються в JSON
і без фото. Нові фото — згодом адмінка (фаза 7): поле "manual" сезону скрипт зберігає.
"""
from __future__ import annotations

import html
import json
import re
import sys
import urllib.parse
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import team_facts as tf  # noqa: E402 — клієнт з паузою, Retry-After і кешем
from driver_portraits import commons_info, is_free  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT_DIR = REPO / "public/img/seasons"
OUT = REPO / "src/data/curated/seasons.json"
WIDTHS = (560, 320)
QUALITY = 70


def arg(name: str) -> str | None:
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None


def main() -> int:
    if arg("--cache"):
        tf.CACHE = Path(arg("--cache"))
        tf.CACHE.mkdir(parents=True, exist_ok=True)
    mockup = Path(arg("--mockup") or sys.exit("--mockup DIR"))
    page = (mockup / "index.html").read_text(encoding="utf-8")
    slots = re.findall(
        r'<li class="slot[^"]*" style="--team:(#[0-9A-Fa-f]{6})">\s*<a class="car"[^>]*aria-label="(\d{4}): ([^"]+)">'
        r'.*?<img src="img/\d{4}\.jpg"[^>]*style="object-position:([^"]+)"', page, flags=re.S)
    i = page.index('class="avc"')
    credits = re.findall(r'<a href="(https://commons\.wikimedia\.org/wiki/File:[^"]+)"[^>]*>[^<]*</a>:\s*([^·<]*?)\s*(?:·|</p>)',
                         page[i:page.index("</details>", i)])
    if len(slots) != len(credits):
        sys.exit(f"карток {len(slots)}, авторів {len(credits)} — перелік не збігається з картками")
    old = json.loads(OUT.read_text(encoding="utf-8")).get("seasons", {}) if OUT.exists() else {}
    files = [urllib.parse.unquote(u.split("/wiki/File:", 1)[1]).replace("_", " ") for u, _ in credits]
    info = commons_info(files)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    result: dict[str, dict] = {}
    problems: list[str] = []
    total = 0
    for (color, year, driver, focus), (url, text), file in zip(slots, credits, files):
        entry: dict = {"driver": html.unescape(driver), "color": color.lower()}
        author, _, lic = html.unescape(text).rpartition(", ")
        ci = info.get(file)
        src = mockup / "img" / f"{year}.jpg"
        if not ci or not is_free(ci["license"]):
            problems.append(f"{year}: ліцензія на Commons «{ci and ci['license']}» — без фото ({file})")
        elif not src.exists():
            problems.append(f"{year}: немає файлу макета")
        else:
            if ci["license"].replace("-", " ").lower() != lic.replace("-", " ").lower():
                problems.append(f"{year}: ліцензія в макеті «{lic}», на Commons «{ci['license']}» — взято Commons")
            img = Image.open(src).convert("RGB")
            srcset = []
            for w in WIDTHS:
                tw = min(w, img.width)
                im = img.resize((tw, round(img.height * tw / img.width)), Image.Resampling.LANCZOS) if tw != img.width else img
                path = OUT_DIR / f"{year}-{w}.webp"
                tmp = path.with_suffix(".tmp.webp")
                im.save(tmp, "WEBP", quality=QUALITY, method=6)
                tmp.replace(path)
                total += path.stat().st_size
                srcset.append(f"/img/seasons/{path.name} {tw}w")
            entry["photo"] = {"src": f"/img/seasons/{year}-{WIDTHS[0]}.webp", "srcSet": ", ".join(srcset),
                              "width": img.width, "height": img.height, "focus": focus.strip()}
            entry["credit"] = {"page": url, "author": author.strip() or "Unknown", "license": ci["license"]}
        if "manual" in old.get(year, {}):
            entry["manual"] = old[year]["manual"]
        result[year] = entry
    OUT.write_text(json.dumps({"source": "макет «Сезони» (12.11.2026), ліцензії звірено з Commons",
                               "seasons": dict(sorted(result.items()))}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"сезонів: {len(result)}; з фото: {sum(1 for v in result.values() if 'photo' in v)}; WebP разом {total / 1024 / 1024:.1f} МБ")
    for p in problems:
        print("  " + p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
