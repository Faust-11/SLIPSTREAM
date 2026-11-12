#!/usr/bin/env python3
"""Імена пілотів українською для сторінок команд → src/data/curated/driver-names.json.

    python3 scripts/curated/driver_names.py [--cache DIR]

Які пілоти: усі, хто трапляється у фікстурі подань сторінки команди (e2e/fixtures/db: team_wins, team_champions,
team_pairing) і кого немає в src/data/curated/drivers.json (там — імена з фото, вони мають перевагу).
Ланцюжок: ref → стаття англійської Вікіпедії з API Jolpica (/drivers/<ref>) → підпис Wikidata українською.
Немає українського підпису — ім'я лишається латиницею (у звіті). Ручні правки — поле "manual", скрипт його зберігає.
Нові пілоти в базі без запису тут — на сайті латиницею з бази (не помилка збірки), звіт — тест driver-names.test.ts.
"""
from __future__ import annotations

import json
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import team_facts as tf  # noqa: E402 — той самий клієнт: пауза, Retry-After, кеш

REPO = Path(__file__).resolve().parents[2]
FIX = REPO / "e2e/fixtures/db"
OUT = REPO / "src/data/curated/driver-names.json"
JOLPICA = "https://api.jolpi.ca/ergast/f1/drivers/{}.json"
WIKI: dict[str, str] = {}


def needed() -> dict[str, str]:
    names: dict[str, str] = {}
    # Усі пілоти списку (0007) — разом із ними посилання на Вікіпедію з дампу (без запитів до API Jolpica).
    idx = FIX / "driver_index.json"
    if idx.exists():
        for r in json.loads(idx.read_text(encoding="utf-8")):
            names[r["id"]] = f"{r['forename']} {r['surname']}"
            if r.get("wikipedia_en"):
                WIKI[r["id"]] = r["wikipedia_en"]
    for w in json.loads((FIX / "team_wins.json").read_text(encoding="utf-8")):
        for d in w["drivers"]:
            names[d["ref"]] = f"{d['forename']} {d['surname']}"
    for f in ("team_champions", "team_pairing"):
        for r in json.loads((FIX / f"{f}.json").read_text(encoding="utf-8")):
            names[r["driver"]] = f"{r['forename']} {r['surname']}"
    curated = json.loads((REPO / "src/data/curated/drivers.json").read_text(encoding="utf-8"))["drivers"]
    return {k: v for k, v in sorted(names.items()) if k not in curated}


def main() -> int:
    if "--cache" in sys.argv:
        tf.CACHE = Path(sys.argv[sys.argv.index("--cache") + 1])
        tf.CACHE.mkdir(parents=True, exist_ok=True)
    old = json.loads(OUT.read_text(encoding="utf-8")).get("drivers", {}) if OUT.exists() else {}
    refs = needed()
    titles: dict[str, str] = {}
    for i, ref in enumerate(refs, 1):
        if ref in WIKI:
            url = WIKI[ref]
        else:
            rows = tf.get(JOLPICA.format(urllib.parse.quote(ref)))["MRData"]["DriverTable"]["Drivers"]
            url = rows[0].get("url", "") if rows else ""
        if "wikipedia.org/wiki/" in url:
            titles[ref] = urllib.parse.unquote(url.split("/wiki/", 1)[1].split("#")[0]).replace("_", " ")
        print(f"[{i}/{len(refs)}] {ref} → {titles.get(ref)}", flush=True)
    # Перенаправлення Вікіпедії: wbgetentities з normalize=1 приймає й старі назви не завжди — тому спершу
    # кінцеві заголовки через query&redirects.
    final: dict[str, str] = {}
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
    out: dict[str, dict] = {}
    no_uk = []
    for ref, latin in refs.items():
        ent = items.get(final.get(titles.get(ref, ""), ""), {})
        uk = ent.get("labels", {}).get("uk", {}).get("value")
        entry = {"en": latin, "uk": uk or latin, **({"wikidata": ent["id"]} if ent else {})}
        if not uk:
            no_uk.append(ref)
        if "manual" in old.get(ref, {}):
            entry["manual"] = old[ref]["manual"]
        out[ref] = entry
    OUT.write_text(json.dumps({"source": "Wikidata (підписи uk) через статті Вікіпедії з API Jolpica", "drivers": out},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\nпілотів: {len(out)}; без українського підпису: {len(no_uk)}: {', '.join(no_uk)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
