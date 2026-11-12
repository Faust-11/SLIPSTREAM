#!/usr/bin/env python3
"""Факти пілотів (Instagram, дата смерті) → src/data/curated/driver-facts.json.

    python3 scripts/curated/driver_facts.py [--cache DIR]

Джерело — Wikidata елемента статті англійської Вікіпедії пілота (адреса статті — з фікстури f1.driver_index,
без запитів до Jolpica): Instagram P2003, дата смерті P570, дата народження P569 (лише для звірки з базою —
розбіжності йдуть у звіт, на сайті показується дата з бази).
Запис пілота: {"wikidata": "Q…", "instagram"?, "died"?, "alive"?}. «alive» = елемент знайдено, людина (P31 = Q5),
дати смерті немає — лише тоді сайт показує вік. Немає елемента — запису немає (вік не показуємо).
Ручні правки — поле "manual" (instagram / died; null — свідомо «немає»; born — дата народження замість дати бази,
з джерелами bornSources; bornChecked — дату перевірено вручну): скрипт його зберігає, на сайті воно має перевагу.
"""
from __future__ import annotations

import json
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import team_facts as tf  # noqa: E402 — клієнт з паузою, Retry-After і кешем

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "src/data/curated/driver-facts.json"
FIXTURE = REPO / "e2e/fixtures/db"


def day(v: object) -> str | None:
    """Значення часу Wikidata → «YYYY-MM-DD», лише з точністю до дня (precision 11)."""
    if not isinstance(v, dict) or v.get("precision", 0) < 11:
        return None
    t = str(v.get("time", ""))
    return t[1:11] if len(t) >= 11 and t[0] == "+" else None


def main() -> int:
    if "--cache" in sys.argv:
        tf.CACHE = Path(sys.argv[sys.argv.index("--cache") + 1])
        tf.CACHE.mkdir(parents=True, exist_ok=True)
    index = json.loads((FIXTURE / "driver_index.json").read_text(encoding="utf-8"))
    totals_path = FIXTURE / "driver_totals.json"
    dob = {r["id"]: r["date_of_birth"] for r in json.loads(totals_path.read_text(encoding="utf-8"))} if totals_path.exists() else {}
    old = json.loads(OUT.read_text(encoding="utf-8")).get("drivers", {}) if OUT.exists() else {}
    titles = {}
    for r in index:
        url = r.get("wikipedia_en") or ""
        if "wikipedia.org/wiki/" in url:
            titles[r["id"]] = urllib.parse.unquote(url.split("/wiki/", 1)[1].split("#")[0]).replace("_", " ")
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
    out: dict[str, dict] = {}
    report = {"no_item": [], "not_human": [], "dob_diff": [], "dob_missing": [], "multi_ig": []}
    for r in index:
        ref = r["id"]
        ent = items.get(final.get(titles.get(ref, ""), ""))
        entry: dict = {}
        if not ent:
            report["no_item"].append(ref)
        elif "Q5" not in [v.get("id") for v in tf.claim_ids(ent, "P31") if isinstance(v, dict)]:
            report["not_human"].append(f"{ref} ({ent.get('id')})")  # стаття про щось інше (перенаправлення) — не беремо
        else:
            entry["wikidata"] = ent["id"]
            ig = [v for v in tf.claim_ids(ent, "P2003") if isinstance(v, str)]
            if len(ig) > 1:
                report["multi_ig"].append(f"{ref}: {ig}")
            if ig:
                entry["instagram"] = ig[0]
            died = [day(v) for v in tf.claim_ids(ent, "P570")]
            if tf.claim_ids(ent, "P570") or ent.get("claims", {}).get("P570"):
                # Дата смерті є (навіть без точності до дня) — не «alive»; точна — у поле died.
                if died and died[0]:
                    entry["died"] = died[0]
            else:
                entry["alive"] = True
            born = [day(v) for v in tf.claim_ids(ent, "P569")]
            if ref in dob:
                if dob[ref] is None:
                    report["dob_missing"].append(f"{ref}: у базі немає, Wikidata {born[:1]}")
                elif born and born[0] and born[0] != dob[ref]:
                    report["dob_diff"].append(f"{ref}: база {dob[ref]}, Wikidata {born[0]}")
                    # Інша дата народження — ознака, що стаття веде на тезку: факти не беремо, доки особу не
                    # перевірено вручну (manual.bornChecked — дату звірено з незалежними джерелами, це та сама людина).
                    if not old.get(ref, {}).get("manual", {}).get("bornChecked"):
                        entry = {}
        if "manual" in old.get(ref, {}):
            entry["manual"] = old[ref]["manual"]
        if entry:
            out[ref] = entry
    OUT.write_text(json.dumps({"source": "Wikidata (P2003, P570) через статті Вікіпедії з f1.drivers.wikipedia_en",
                               "drivers": dict(sorted(out.items()))}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n = len(index)
    print(f"пілотів: {n}; елемент Wikidata: {sum(1 for v in out.values() if 'wikidata' in v)}; Instagram: "
          f"{sum(1 for v in out.values() if 'instagram' in v)}; дата смерті: {sum(1 for v in out.values() if 'died' in v)}; "
          f"живі: {sum(1 for v in out.values() if v.get('alive'))}")
    for k, v in report.items():
        print(f"  {k}: {len(v)}", *(["— " + "; ".join(v[:12])] if v else []))
    return 0


if __name__ == "__main__":
    sys.exit(main())
