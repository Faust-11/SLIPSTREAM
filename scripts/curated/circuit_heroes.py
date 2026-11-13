#!/usr/bin/env python3
"""Банери трас для сторінки гонки (1280, 800, 480 px WebP): зображення статті англійської Вікіпедії або P18 Вікіданих.

    python3 scripts/curated/circuit_heroes.py [--cache DIR] [--only monza,spa]

Фаза 3g (docs/plans/2026-11-13-phase3g-race-page.md, рішення за прецедентом №4): одне фото на трасу. Стаття — поле
`wiki` у src/data/curated/circuits.json (з дампу Jolpica). Зображення статті (API pageimages, лише вільні — pilicense=free)
→ SVG (схеми трас) не беремо → перевірка ліцензії на Commons (is_free: без NC/ND) і автор з Commons → мініатюра 1280 px
(менші — локально) → public/img/circuits/<ref>-hero-*.webp → поля "hero" і "credit" траси в circuits.json.
Вужчі за 960 px — без банера (на сторінці — темний банер). Ручні правки зберігаються: "hero.focusY", "rejected" (відкинуті переглядом файли), "manual"
(фото, яке вибрав користувач, — скрипт його не перезаписує). ОДИН процес (ліміти Wikimedia).
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
from driver_portraits import COMMONS, is_free  # noqa: E402
from hero_photos import QUALITY, SOURCE_WIDTH, WIDTHS, fetch_bytes  # noqa: E402
from season_photos import clean_author  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "public/img/circuits"
CIRCUITS = REPO / "src/data/curated/circuits.json"
ENWIKI = "https://en.wikipedia.org/w/api.php"
MIN_WIDTH = 960


def canonical(titles: list[str]) -> dict[str, str]:
    """Наша назва статті → канонічна (перенаправлення й нормалізація enwiki)."""
    out: dict[str, str] = {}
    for part in tf.chunks(sorted(set(titles))):
        q = {"action": "query", "format": "json", "formatversion": "2", "redirects": "1", "titles": "|".join(part)}
        d = tf.get(ENWIKI + "?" + urllib.parse.urlencode(q))["query"]
        step = {x["from"]: x["to"] for x in d.get("normalized", []) + d.get("redirects", [])}
        for t in part:
            c = t
            while c in step:
                c = step[c]
            out[t] = c
    return out


def wikidata_images(titles: list[str]) -> dict[str, str]:
    """Стаття (канонічна) → файл P18 (зображення) елемента Вікіданих — зазвичай фото, а не схема."""
    out: dict[str, str] = {}
    for t, ent in tf.wd_by_titles(titles).items():
        imgs = tf.claim_ids(ent, "P18")
        if imgs:
            out[t] = imgs[0]
    return out


def page_images(titles: list[str]) -> dict[str, str]:
    """Стаття → файл головного зображення (лише вільні ліцензії за даними Вікіпедії)."""
    out: dict[str, str] = {}
    for part in tf.chunks(sorted(set(titles))):
        q = {"action": "query", "format": "json", "formatversion": "2", "prop": "pageimages", "piprop": "name",
             "pilicense": "free", "redirects": "1", "titles": "|".join(part)}
        d = tf.get(ENWIKI + "?" + urllib.parse.urlencode(q))["query"]
        back = {x["to"]: x["from"] for x in d.get("redirects", []) + d.get("normalized", [])}
        for p in d["pages"]:
            if p.get("pageimage"):
                t = p["title"]
                out[back.get(back.get(t, t), back.get(t, t))] = p["pageimage"]
    return out


def main() -> int:
    if "--cache" in sys.argv:
        tf.CACHE = Path(sys.argv[sys.argv.index("--cache") + 1])
        tf.CACHE.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads(CIRCUITS.read_text(encoding="utf-8"))
    places = {k: v for k, v in data["places"].items() if v.get("wiki") and not v.get("manual") and (not only or k in only)}
    canon = canonical([v["wiki"] for v in places.values()])
    pageimg = page_images([v["wiki"] for v in places.values()])
    p18 = wikidata_images(sorted(set(canon.values())))
    # Кандидати по черзі: зображення статті, потім P18 Вікіданих (замір 13.11: зображення статей — здебільшого SVG-схеми).
    # "rejected" — файли, відкинуті переглядом контрольного листа (схеми, інший вид спорту, без траси): не беремо знову.
    norm = lambda f: f.replace("_", " ").strip()  # noqa: E731 — pageimages віддає «_», P18 — пробіли
    rej = {ref: {norm(r["file"]) for r in v.get("rejected", [])} for ref, v in places.items()}
    cands = {ref: [f for f in (pageimg.get(v["wiki"]), p18.get(canon[v["wiki"]])) if f and norm(f) not in rej[ref]] for ref, v in places.items()}
    info: dict[str, dict] = {}
    for part in tf.chunks(sorted({f for fs in cands.values() for f in fs if not f.lower().endswith(".svg")})):
        q = {"action": "query", "format": "json", "formatversion": "2", "prop": "imageinfo",
             "titles": "|".join("File:" + f for f in part), "iiprop": "url|size|extmetadata", "iiurlwidth": str(SOURCE_WIDTH),
             "iiextmetadatafilter": "LicenseShortName|Artist"}
        d = tf.get(COMMONS + "?" + urllib.parse.urlencode(q))["query"]
        alias = {x["to"]: x["from"] for x in d.get("normalized", [])}
        for p in d["pages"]:
            ii = (p.get("imageinfo") or [None])[0]
            if ii:
                info[alias.get(p["title"], p["title"]).removeprefix("File:")] = ii
    total = 0
    skipped: list[str] = []
    for ref, v in sorted(places.items()):
        f, ii, reason, reasons = None, None, None, []
        for cand in cands[ref] or [None]:
            ci = info.get(cand or "")
            if not cand:
                r = "без вільного зображення"
            elif cand.lower().endswith(".svg"):
                r = f"схема (SVG): {cand}"
            elif not ci:
                r = f"немає на Commons: {cand}"
            else:
                lic = ci.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
                r = f"ліцензія «{lic}»: {cand}" if not is_free(lic) else (
                    f"вужче {MIN_WIDTH} px ({ci.get('width')}): {cand}" if (ci.get("width") or 0) < MIN_WIDTH else None)
            if r is None:
                f, ii = cand, ci
                break
            reasons.append(r)
        if f is None or ii is None:
            reason = "; ".join(reasons)
        if reason:
            v.pop("hero", None)
            v.pop("credit", None)
            skipped.append(f"{ref}: {reason}")
            continue
        big = OUT / f"{ref}-hero-{SOURCE_WIDTH}.webp"
        try:
            src = Image.open(big) if big.exists() else Image.open(io.BytesIO(fetch_bytes(ii["thumburl"])))
        except Exception as e:  # noqa: BLE001 — ліміт Wikimedia чи збій мережі: траса без банера, решта йде далі
            skipped.append(f"{ref}: не завантажено ({e})")
            continue
        src = src.convert("RGB")
        srcset, size = [], None
        for w in WIDTHS:
            img = src.resize((w, round(src.height * w / src.width)), Image.Resampling.LANCZOS) if src.width > w else src
            path = OUT / f"{ref}-hero-{w}.webp"
            if not (path == big and big.exists()):
                tmp = path.with_suffix(".tmp.webp")
                img.save(tmp, "WEBP", quality=QUALITY, method=6)
                tmp.replace(path)
            total += path.stat().st_size
            srcset.append(f"/img/circuits/{path.name} {img.width}w")
            if w == WIDTHS[0]:
                size = (img.width, img.height)
        assert size
        focus = (v.get("hero") or {}).get("focusY")
        v["hero"] = {"src": f"/img/circuits/{ref}-hero-{WIDTHS[0]}.webp", "srcSet": ", ".join(srcset),
                     "width": size[0], "height": size[1], **({"focusY": focus} if focus is not None else {})}
        v["credit"] = {"page": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(f.replace(" ", "_")),
                       "author": clean_author(ii.get("extmetadata", {}).get("Artist", {}).get("value", "")),
                       "license": ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")}
        print(f"{ref}: {size[0]}×{size[1]} {f}", flush=True)
    CIRCUITS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\nбанерів: {sum(1 for v in places.values() if 'hero' in v)} з {len(places)}; WebP разом {total / 1024 / 1024:.1f} МБ")
    for s in skipped:
        print("  без банера — " + s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
