#!/usr/bin/env python3
"""Короткі назви трас для заголовка картки (фаза 3h, рішення користувача 13.11: «Яс-Марина», а не «Абу-Дабі»).

    python3 scripts/curated/circuit_short_names.py [--cache DIR]

Джерело: назва статті траси в українській Вікіпедії (міжмовне посилання зі статті enwiki — поле `wiki` у
src/data/curated/circuits.json) і назва статті enwiki. Правило (однакове для обох мов):
- без уточнення в дужках («Монца (автодром)» → «Монца»);
- українська: до трьох слів (дефіс не розділяє) і без загальних слів («Автодром», «Міжнародний», «імені», «Траса»…)
  — береться, інакше — місце етапу з circuits.json: «Автодром Енцо та Діно Феррарі» → «Імола»;
- англійська йде за українською (одна траса — одна назва в обох мовах): якщо взято назву статті — назва траси в
  Jolpica (f1.circuit_index, як у переліку трас) без загальних слів («Yas Marina Circuit» → «Yas Marina»,
  «Mosport International Raceway» → «Mosport»), інакше — місце (`en`). Назви статей enwiki для цього гірші
  (замір 13.11: «Long Beach, California», «Canadian Tire Park», «Zeltweg Air Base»).
Ручні рішення — OVERRIDE (з причиною). Результат — поле "short" у circuits.json; звіт — у консоль.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import team_facts as tf  # noqa: E402 — клієнт з паузою, Retry-After і кешем

REPO = Path(__file__).resolve().parents[2]
CIRCUITS = REPO / "src/data/curated/circuits.json"
INDEX = REPO / "e2e/fixtures/db/circuit_index.json"  # назви Jolpica (фікстура з db.yml)
GENERIC_UK = re.compile(r"\b(автодром\w*|міжнародн\w*|імені|траса|траси|формула|мотор|спідвей)\b", re.I)
GENERIC_EN = re.compile(
    r"\b(circuit|circuito|circuit\w*|autodromo|autódromo|autodrom|international|internacional|internazionale|nazionale|raceway|speedway|"
    r"motor|street|racing|course|motorsport|grand prix)\b",
    re.I,
)
# Англійська — ручне рішення: назва Jolpica не відповідає українській («Scandinavian Raceway» — це Андерсторп).
EN_OVERRIDE = {"anderstorp": "Anderstorp", "monsanto": "Monsanto"}
# Ручні рішення: місце зрозуміліше за назву статті.
OVERRIDE = {
    "lemans": "місце — F1 1967 їздила трасою Бугатті в Ле-Мані; «Сарт» уболівальникам F1 не відомий",
    "magny_cours": "місце — «Маньї-Кур» (стаття ukwiki — «Невер (автодром)»)",
    "monaco": "місце — «Монако» (стаття ukwiki — «Монте-Карло (траса)»; Гран-прі — Монако)",
}


def strip(title: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*$", "", title).strip()


def short_ok(name: str, generic: re.Pattern) -> bool:
    return 0 < len(name.split()) <= 3 and not generic.search(name)


def en_clean(title: str) -> str:
    """Назва статті enwiki без загальних слів і службових слів по краях: «Yas Marina Circuit» → «Yas Marina»."""
    words = [w for w in GENERIC_EN.sub(" ", strip(title)).split() if w]
    while words and words[0].lower() in ("de", "del", "di", "do", "da", "la", "of", "the", "park"):  # «Circuit Park Zandvoort»
        words.pop(0)
    while words and words[-1].lower() in ("de", "del", "di", "do", "da", "la", "of", "the"):
        words.pop()
    return " ".join(words)


def main() -> int:
    if "--cache" in sys.argv:
        tf.CACHE = Path(sys.argv[sys.argv.index("--cache") + 1])
        tf.CACHE.mkdir(parents=True, exist_ok=True)
    data = json.loads(CIRCUITS.read_text())
    places = data["places"]
    jolpica = {r["ref"]: r["name"] for r in json.loads(INDEX.read_text())}
    titles = {p["wiki"]: ref for ref, p in places.items() if p.get("wiki")}
    uk_title: dict[str, str | None] = {}
    en_title: dict[str, str] = {}
    for part in tf.chunks(sorted(titles), 40):
        q = {"action": "query", "prop": "langlinks", "lllang": "uk", "lllimit": "max", "redirects": "1", "format": "json",
             "formatversion": "2", "titles": "|".join(part)}
        d = tf.get(tf.WP_API + "?" + urllib.parse.urlencode(q))["query"]
        alias = {x["from"]: x["to"] for k in ("normalized", "redirects") for x in d.get(k, [])}
        pages = {p["title"]: p for p in d["pages"]}
        for t in part:
            final = t
            while final in alias:
                final = alias[final]
            ll = pages.get(final, {}).get("langlinks")
            uk_title[titles[t]] = ll[0]["title"] if ll else None
            en_title[titles[t]] = final
    report = []
    for ref in sorted(places):
        p = places[ref]
        title = uk_title.get(ref)
        cand = strip(title) if title else ""
        if ref in OVERRIDE or not short_ok(cand, GENERIC_UK):
            out = {"uk": p["uk"], "en": p["en"]}
            why = OVERRIDE.get(ref) or (f"«{title}» — довга або загальна назва" if title else "статті немає")
            report.append(f"{ref}: місце «{p['uk']}» ({why})")
        else:
            en = en_clean(jolpica.get(ref, ""))
            out = {"uk": cand, "en": EN_OVERRIDE.get(ref) or (en if 0 < len(en.split()) <= 3 else p["en"])}
        p["short"] = out
    data["_about"] = data["_about"].split(" Коротка назва")[0] + (
        " Коротка назва траси (\"short\", заголовок картки) — scripts/curated/circuit_short_names.py: назва статті ukwiki/enwiki"
        " без уточнення в дужках, якщо до двох слів і без загальних слів, інакше — місце."
    )
    CIRCUITS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    for ref in sorted(places):
        print(f"  {ref:15} {places[ref]['short']['uk']:22} {places[ref]['short']['en']}")
    print("Місце замість назви статті:")
    for r in report:
        print("  - " + r)
    return 0


if __name__ == "__main__":
    sys.exit(main())
