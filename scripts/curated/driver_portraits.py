#!/usr/bin/env python3
"""Портрети пілотів → public/img/drivers/<ref>-96.webp і src/data/curated/driver-portraits.json.

    python3 scripts/curated/driver_portraits.py --mockup DIR --credits FILE [--cache DIR]

Джерела:
  1. 419 вільних портретів з опублікованого макета «Пілоти» (рішення користувача 12.11): уже обрізані
     112×112 JPEG (DIR/img/d/<ref>.jpg) + атрибуція з переліку макета (FILE: {ref: {page, author, license}}).
  2. Пошук відсутніх: зображення Wikidata (P18) елемента статті пілота (Jolpica → Вікіпедія → Wikidata);
     обрізка — квадрат по центру верхньої третини (обличчя на портретах зазвичай там).
Для кожного файлу ліцензію перевіряємо на Commons (imageinfo extmetadata LicenseShortName); не вільна або
розходиться з атрибуцією — не беремо. Кураторські фото з src/data/curated/drivers.json мають перевагу.
Нові фото — згодом адмінка (фаза 7): той самий JSON (поле «manual»).
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
OUT = REPO / "src/data/curated/driver-portraits.json"
COMMONS = "https://commons.wikimedia.org/w/api.php"
FREE = ("CC0", "Public domain", "PD", "CC BY", "CC BY-SA", "Attribution", "OGL", "GFDL", "FAL", "Copyrighted free use")
SIZE = 96


def arg(name: str) -> str | None:
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None


def commons_info(files: list[str]) -> dict[str, dict]:
    """Назва файлу Commons (без «File:») → {license, artist, url (мініатюра 250 px)}."""
    out = {}
    for part in tf.chunks(sorted(set(files))):
        q = {"action": "query", "format": "json", "formatversion": "2", "prop": "imageinfo",
             "titles": "|".join("File:" + f for f in part), "iiprop": "url|extmetadata", "iiurlwidth": "250",
             "iiextmetadatafilter": "LicenseShortName|Artist"}
        d = tf.get(COMMONS + "?" + urllib.parse.urlencode(q))["query"]
        alias = {x["to"]: x["from"] for x in d.get("normalized", [])}
        for p in d["pages"]:
            ii = (p.get("imageinfo") or [None])[0]
            if not ii:
                continue
            meta = ii.get("extmetadata", {})
            name = alias.get(p["title"], p["title"]).removeprefix("File:")
            out[name] = {"license": meta.get("LicenseShortName", {}).get("value", ""),
                         "artist": meta.get("Artist", {}).get("value", ""), "thumb": ii.get("thumburl")}
    return out


def is_free(lic: str) -> bool:
    return any(lic.replace("-", " ").lower().startswith(f.replace("-", " ").lower()) for f in FREE)


def save(img: Image.Image, ref: str) -> str:
    img = img.convert("RGB").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    path = OUT_DIR / f"{ref}-{SIZE}.webp"
    tmp = path.with_suffix(".tmp.webp")
    img.save(tmp, "WEBP", quality=80, method=6)
    tmp.replace(path)
    return f"/img/drivers/{path.name}"


def square_top(img: Image.Image) -> Image.Image:
    w, h = img.size
    s = min(w, h)
    top = 0 if h > w else 0
    left = (w - s) // 2
    if h > w:  # портрет: квадрат з верхньої частини (обличчя), трохи нижче краю
        top = min(int(h * 0.05), h - s)
    return img.crop((left, top, left + s, top + s))


def main() -> int:
    if arg("--cache"):
        tf.CACHE = Path(arg("--cache"))
        tf.CACHE.mkdir(parents=True, exist_ok=True)
    mockup = Path(arg("--mockup") or "")
    credits = json.loads(Path(arg("--credits") or "").read_text(encoding="utf-8"))
    curated = json.loads((REPO / "src/data/curated/drivers.json").read_text(encoding="utf-8"))["drivers"]
    index = json.loads((REPO / "e2e/fixtures/db/driver_index.json").read_text(encoding="utf-8"))
    prev = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    old = prev.get("drivers", {})
    # Переглянуті й відкинуті вручну (не портрет: машина, надгробок, статуя) — не повертати.
    rejected = set(prev.get("rejected", []))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    result: dict[str, dict] = {}
    report = {"mockup": 0, "wikidata": 0, "rejected": []}
    # 1. Портрети макета з перевіркою ліцензії.
    files = {ref: urllib.parse.unquote(c["page"].split("/wiki/File:", 1)[1]).replace("_", " ") for ref, c in credits.items()}
    info = commons_info(list(files.values()))
    for ref, c in credits.items():
        if ref in curated:
            continue
        i = info.get(files[ref])
        if not i or not is_free(i["license"]):
            report["rejected"].append(f"{ref}: ліцензія на Commons «{i and i['license']}»")
            continue
        src = mockup / "img/d" / f"{ref}.jpg"
        if not src.exists():
            report["rejected"].append(f"{ref}: немає файлу макета")
            continue
        result[ref] = {"avatar": save(Image.open(src), ref),
                       "credit": {"page": c["page"], "author": c["author"], "license": i["license"]}, "source": "mockup"}
        report["mockup"] += 1
    # 2. Відсутні — Wikidata P18.
    missing = [r["id"] for r in index if r["id"] not in curated and r["id"] not in result]
    titles = {}
    for ref in missing:
        rows = tf.get(f"https://api.jolpi.ca/ergast/f1/drivers/{urllib.parse.quote(ref)}.json")["MRData"]["DriverTable"]["Drivers"]
        url = rows[0].get("url", "") if rows else ""
        if "wikipedia.org/wiki/" in url:
            titles[ref] = urllib.parse.unquote(url.split("/wiki/", 1)[1].split("#")[0]).replace("_", " ")
    final = {}
    for part in tf.chunks(sorted(set(titles.values()))):
        q = {"action": "query", "format": "json", "formatversion": "2", "redirects": "1", "titles": "|".join(part)}
        d = tf.get(tf.WP_API + "?" + urllib.parse.urlencode(q))["query"]
        alias = {x["from"]: x["to"] for k in ("normalized", "redirects") for x in d.get(k, [])}
        for t in part:
            f = t
            while f in alias:
                f = alias[f]
            final[t] = f
    items = tf.wd_by_titles(list(final.values()))
    p18 = {}
    for ref, t in titles.items():
        ent = items.get(final.get(t, ""), {})
        imgs = [v for v in tf.claim_ids(ent, "P18") if isinstance(v, str)]
        if imgs:
            p18[ref] = imgs[0]
    info2 = commons_info(list(p18.values()))
    for ref, f in p18.items():
        if ref in rejected:
            continue
        i = info2.get(f.replace("_", " ")) or info2.get(f)
        if not i or not is_free(i["license"]) or not i["thumb"]:
            report["rejected"].append(f"{ref}: P18 «{f}» — ліцензія «{i and i['license']}»")
            continue
        img = square_top(Image.open(io.BytesIO(fetch_bytes(i["thumb"]))))
        author = tf.re.sub(r"<[^>]+>", "", i["artist"]).strip() or "Unknown"
        result[ref] = {"avatar": save(img, ref), "credit": {
            "page": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(f.replace(" ", "_")),
            "author": author[:120], "license": i["license"]}, "source": "wikidata-p18", "checked": False}
        report["wikidata"] += 1
    for ref, v in old.items():
        if "manual" in v:
            result.setdefault(ref, {})["manual"] = v["manual"]
    OUT.write_text(json.dumps({"drivers": dict(sorted(result.items())), "rejected": sorted(rejected)}, ensure_ascii=False, indent=1)
                   + "\n", encoding="utf-8")
    total = len(index)
    have = len(result) + sum(1 for r in index if r["id"] in curated)
    print(f"пілотів: {total}; з портретом: {have} (макет {report['mockup']}, Wikidata {report['wikidata']}, кураторські "
          f"{sum(1 for r in index if r['id'] in curated)}); без портрета: {total - have}")
    for x in report["rejected"][:40]:
        print("  відкинуто:", x)
    return 0


if __name__ == "__main__":
    sys.exit(main())
