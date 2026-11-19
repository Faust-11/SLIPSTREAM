#!/usr/bin/env python3
"""Еталонна (незалежна від SQL) реалізація очків «Прогнозів» і генератор фікстури паритету (фаза 9b).

    python3 scripts/db/play_reference.py --fetch 2025 --out scripts/db/fixtures/play_parity_2025.json   # потрібна мережа (Jolpica)

Фікстура: для кожного етапу сезону — три «ледачі» прогнози топ-10 (кваліфікація за заліком пілотів перед етапом, гонка за
заліком, гонка за стартовою решіткою) і очки, які за ними мусить дати play.score_round. Очки тут порахував Python з
відповідей API (Ergast-формат Jolpica); SQL-тест (scripts/db/test_play.py) порівнює їх з очками з бази, завантаженої з дампу.
Схема очків — як у supabase/migrations/0015_play_schema.sql: 10/8/6/3×7; +10 подіум; +30 десятка; +1 близько.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request

BASE_POINTS = {1: 10, 2: 8, 3: 6}


def score(pred: list[str | None], actual: dict[int, str]) -> int:
    """pred — 10 слотів (id пілота або None); actual — позиція → пілот (класифіковані; для кваліфікації — усі)."""
    top10 = {actual[p] for p in range(1, 11) if p in actual}
    pts = hits = 0
    for slot, d in enumerate(pred, 1):
        if d is None:
            continue
        if actual.get(slot) == d:
            pts += BASE_POINTS.get(slot, 3)
            hits += 1
        elif d in top10:
            pts += 1
    if all(pred[i] is not None and actual.get(i + 1) == pred[i] for i in range(3)):
        pts += 10
    if hits == 10:
        pts += 30
    return pts


def _get(season: int, path: str) -> dict:
    for _ in range(5):
        try:
            req = urllib.request.Request(f"https://api.jolpi.ca/ergast/f1/{season}{path}", headers={"User-Agent": "slipstream-research"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)["MRData"]
        except Exception:
            time.sleep(3)
    raise SystemExit(f"не вдалося: {path}")


def fetch(season: int) -> dict:
    out = {}
    for rnd in range(1, int(_get(season, "/races.json")["total"]) + 1):
        res = _get(season, f"/{rnd}/results.json")["RaceTable"]["Races"]
        qual = _get(season, f"/{rnd}/qualifying.json")["RaceTable"]["Races"]
        st = _get(season, f"/{rnd - 1}/driverstandings.json")["StandingsTable"]["StandingsLists"] if rnd > 1 else []
        out[rnd] = {
            "race": {int(x["position"]): x["Driver"]["driverId"] for x in res[0]["Results"] if x["positionText"].isdigit()} if res else None,
            "quali": {int(x["position"]): x["Driver"]["driverId"] for x in qual[0]["QualifyingResults"]} if qual else None,
            "stand": [x["Driver"]["driverId"] for x in st[0]["DriverStandings"]] if st else None,
        }
        time.sleep(0.5)
    return out


def build(raw: dict, season: int) -> dict:
    rounds = {}
    for rnd, d in raw.items():
        if not d["stand"] or not d["race"] or not d["quali"]:
            continue
        stand = d["stand"][:10]
        grid = [d["quali"][p] for p in range(1, 11)]
        rounds[str(rnd)] = {
            "stand": stand, "grid": grid,
            "expected": {"Q_stand": score(stand, d["quali"]), "R_stand": score(stand, d["race"]), "R_grid": score(grid, d["race"])},
        }
    totals = {k: sum(r["expected"][k] for r in rounds.values()) for k in ("Q_stand", "R_stand", "R_grid")}
    return {"season": season, "totals": totals, "rounds": rounds}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fetch", type=int, required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    fx = build(fetch(a.fetch), a.fetch)
    json.dump(fx, open(a.out, "w"), ensure_ascii=False, indent=1)
    print("totals", fx["totals"])
