#!/usr/bin/env python3
"""Фото сезонів → public/img/seasons/<рік>-560.webp / -320.webp і src/data/curated/seasons.json.

    python3 scripts/curated/season_photos.py --mockup DIR [--cache DIR]

DIR — файли опублікованого макета «Сезони» (index.html + img/<рік>.jpg, 560 px): фото чемпіона кожного сезону,
точка кадрування (object-position), колір команди чемпіона того сезону і перелік файлів Commons (у порядку карток).
Кожен файл звіряємо з Commons (imageinfo): невільна ліцензія (або NC/ND) — фото не беремо; автор і ліцензія —
з Commons (Artist, LicenseShortName), а не з тексту макета (там до автора додано підпис і він буває обрізаний).
Картка квадратна, тому фото кадруємо у квадрат навколо точки кадрування: вибір файлу за шириною тоді чесний
(широке фото 560×225 інакше розтягувалось у 2,5 раза). Пілот сезону (id бази) — з фікстури f1.season_index:
сайт показує фото, лише якщо це той самий пілот. Колір і пілот лишаються в JSON і без фото.
Код виходу 1, якщо хоч одне фото відкинуто або пари «картка — файл» не сходяться. Нові фото — згодом адмінка (фаза 7).
Сезон з полем "manual" (ручна заміна фото: файл Commons, кадр, дата рішення) скрипт не чіпає — лишає запис як є.
"""
from __future__ import annotations

import html
import io
import json
import re
import sys
import urllib.parse
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import team_facts as tf  # noqa: E402 — клієнт з паузою, Retry-After і кешем
from driver_portraits import commons_info, is_free  # noqa: E402
from hero_photos import fetch_bytes  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT_DIR = REPO / "public/img/seasons"
OUT = REPO / "src/data/curated/seasons.json"
SMALL = 280  # ширина картки в решітці
FULL = 560  # для екранів з подвійною щільністю
SOURCE_WIDTH = 960  # стандартна ширина мініатюр Wikimedia
CACHE_IMG: Path | None = None
QUALITY = 72


def square(img: Image.Image, focus: str) -> Image.Image:
    """Квадрат зі стороною = менша сторона, зсунутий до точки кадрування (як object-position: X% Y%)."""
    fx, fy = (float(v.strip().rstrip("%")) / 100 for v in focus.split())
    w, h = img.size
    side = min(w, h)
    left, top = round((w - side) * fx), round((h - side) * fy)
    return img.crop((left, top, left + side, top + side))


# Автор, якого не вдається чисто дістати з розмітки Commons (перевірено вручну на сторінці файлу).
AUTHOR_FIX = {"1980": "Anefo (Nationaal Archief) / derivative work: Danyele"}


def clean_author(artist: str) -> str:
    """Автор з Commons без розмітки й архівних шифрів; довгий — до 140 знаків по межі слова."""
    text = html.unescape(re.sub(r"<[^>]+>", "", artist))
    text = re.sub(r"\s+", " ", text).strip()
    half = len(text) // 2
    if len(text) % 2 == 0 and text[:half] == text[half:]:  # Commons інколи віддає підпис двічі («Unknown authorUnknown author»)
        text = text[:half]
    text = re.sub(r"\s*[/;]?\s*(NL-HaNA, ANEFO\s*/\s*)?neg\. stroken[^/;]*", "", text)  # шифр Nationaal Archief
    text = re.sub(r"\s*Minor restoration by .*$", "", text)  # реставратор сам просить не згадувати
    if len(text) > 140:
        text = text[:140].rsplit(" ", 1)[0]
    return text.strip(" ,;:/") or "Unknown author"


def source_image(ci: dict, fallback: Path) -> Image.Image:
    """Файл з Commons шириною 960 px (кадр макета — лише 560 px, після квадрата лишалось 225–400 px); збій — файл макета."""
    thumb = ci.get("thumb") or ""
    url = re.sub(r"/\d+px-", f"/{SOURCE_WIDTH}px-", thumb)
    cached = CACHE_IMG / (fallback.stem + ".bin") if CACHE_IMG else None
    try:
        if cached and cached.exists():
            data = cached.read_bytes()
        else:
            data = fetch_bytes(url)
            if cached:
                cached.write_bytes(data)
        return Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as e:  # noqa: BLE001 — оригінал вужчий за 960 px або ліміт Wikimedia: беремо файл макета
        print(f"  {fallback.stem}: Commons {type(e).__name__} — узято файл макета", flush=True)
        return Image.open(fallback).convert("RGB")


def arg(name: str) -> str | None:
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None


def main() -> int:
    if arg("--cache"):
        tf.CACHE = Path(arg("--cache"))
        tf.CACHE.mkdir(parents=True, exist_ok=True)
        global CACHE_IMG
        CACHE_IMG = tf.CACHE / "season-src"
        CACHE_IMG.mkdir(exist_ok=True)
    mockup = Path(arg("--mockup") or sys.exit("--mockup DIR"))
    page = (mockup / "index.html").read_text(encoding="utf-8")
    slots = [(c, y, d, f) for c, y, d, iy, f in re.findall(
        r'<li class="slot[^"]*" style="--team:(#[0-9A-Fa-f]{6})">\s*<a class="car"[^>]*aria-label="(\d{4}): ([^"]+)">'
        r'(?:(?!</li>).)*?<img src="img/(\d{4})\.jpg"[^>]*style="object-position:([^"]+)"', page, flags=re.S) if y == iy]
    i = page.index('class="avc"')
    credits = re.findall(r'<a href="(https://commons\.wikimedia\.org/wiki/File:[^"]+)"[^>]*>[^<]*</a>:\s*([^·<]*?)\s*(?:·|</p>)',
                         page[i:page.index("</details>", i)])
    n_slots = len(re.findall(r'<li class="slot', page))
    if not (len(slots) == len(credits) == n_slots):
        sys.exit(f"карток {n_slots}, з фото свого року {len(slots)}, файлів у переліку {len(credits)} — пари не сходяться")
    # Пілот сезону з бази: фото прив'язуємо до id пілота; прізвище з макета має збігатися з базою.
    index = {str(r["year"]): r for r in json.loads((REPO / "e2e/fixtures/db/season_index.json").read_text(encoding="utf-8"))}
    old = json.loads(OUT.read_text(encoding="utf-8")).get("seasons", {}) if OUT.exists() else {}
    files = [urllib.parse.unquote(u.split("/wiki/File:", 1)[1]).replace("_", " ") for u, _ in credits]
    info = commons_info(files)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    result: dict[str, dict] = {}
    problems: list[str] = []
    notes: list[str] = []
    total = 0
    for (color, year, driver, focus), (url, text), file in zip(slots, credits, files):
        if "manual" in old.get(year, {}):
            # Ручна заміна фото (рішення користувача; поле manual — файл Commons, кадр і дата): фото, автор і банер
            # лишаються як є, макет їх не перезаписує.
            result[year] = old[year]
            continue
        entry: dict = {"driver": html.unescape(driver), "color": color.lower()}
        row = index.get(year)
        if row and row["surname"] and entry["driver"].lower().endswith(row["surname"].lower()):
            entry["driverRef"] = row["driver"]
        else:
            problems.append(f"{year}: пілот макета «{entry['driver']}» ≠ чемпіон бази «{row and row['surname']}» — фото не прив'язано")
        lic = html.unescape(text).rpartition(", ")[2]
        ci = info.get(file)
        src = mockup / "img" / f"{year}.jpg"
        if not ci or not is_free(ci["license"]) or not src.exists() or "driverRef" not in entry:
            if "driverRef" in entry:
                problems.append(f"{year}: ліцензія на Commons «{ci and ci['license']}» або немає файлу макета — без фото ({file})")
            for old_file in OUT_DIR.glob(f"{year}-*.webp"):
                old_file.unlink()  # відкинуте фото не лишається на диску
        else:
            if ci["license"].replace("-", " ").lower() != lic.replace("-", " ").lower():
                notes.append(f"{year}: ліцензія в макеті «{lic}», на Commons «{ci['license']}» — взято Commons")
            img = square(source_image(ci, src), focus)
            if img.width > FULL:
                img = img.resize((FULL, FULL), Image.Resampling.LANCZOS)
            print(f"{year}: {img.width} px", flush=True)
            for old_file in OUT_DIR.glob(f"{year}-*.webp"):
                old_file.unlink()
            srcset = []
            sizes = [("full", img.width)] + ([("small", SMALL)] if img.width > SMALL else [])  # мале джерело — один файл
            for nominal, tw in sizes:
                im = img.resize((tw, tw), Image.Resampling.LANCZOS) if tw != img.width else img
                path = OUT_DIR / f"{year}-{nominal}.webp"
                tmp = path.with_suffix(".tmp.webp")
                im.save(tmp, "WEBP", quality=QUALITY, method=6)
                tmp.replace(path)
                total += path.stat().st_size
                srcset.append(f"/img/seasons/{path.name} {tw}w")
            entry["photo"] = {"src": f"/img/seasons/{year}-full.webp", "srcSet": ", ".join(srcset),
                              "width": img.width, "height": img.height}
            entry["credit"] = {"page": url, "author": AUTHOR_FIX.get(year) or clean_author(ci["artist"]), "license": ci["license"]}
        if "manual" in old.get(year, {}):
            entry["manual"] = old[year]["manual"]
        result[year] = entry
    OUT.write_text(json.dumps({"source": "макет «Сезони» (12.11.2026); автор і ліцензія — з Commons",
                               "seasons": dict(sorted(result.items()))}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"сезонів: {len(result)}; з фото: {sum(1 for v in result.values() if 'photo' in v)}; WebP разом {total / 1024 / 1024:.1f} МБ")
    for p in notes + problems:
        print("  " + p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
