#!/usr/bin/env python3
"""Кураторські дані → база: f1.team_families (ref Jolpica → id команди) з src/data/curated/teams.json,
виправлення помилок Jolpica в результатах (src/data/curated/result-fixes.json, з джерелами),
потім f1.refresh_derived(). Усе в одній транзакції.

    DATABASE_URL=postgresql://... python3 scripts/db/seed_curated.py

Попереджає (код 1 з --strict), якщо в базі є конструктор зі стартами, не віднесений до жодної команди
(новий учасник чемпіонату — додати в curated/teams.json).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg

CURATED = Path(__file__).resolve().parents[2] / "src" / "data" / "curated" / "teams.json"
RESULT_FIXES = CURATED.with_name("result-fixes.json")
# Поля, які дозволено виправляти (назва поля не підставляється в SQL з файлу — лише з цього переліку).
FIX_SQL = {
    "grid": """update f1.results r set grid = %(to)s
               from f1.sessions s, f1.rounds ro, f1.drivers d
               where s.id = r.session_id and ro.id = s.round_id and d.id = r.driver_id
                 and ro.season_year = %(year)s and ro.number = %(round)s and s.type = %(session)s
                 and d.ref = %(driver)s and r.grid = %(from)s""",
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--strict", action="store_true", help="код 1, якщо є невіднесені конструктори зі стартами")
    args = ap.parse_args()
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL не задано", file=sys.stderr)
        return 2
    teams = json.loads(CURATED.read_text(encoding="utf-8"))["teams"]
    # ref Jolpica → команда, з роками (refYears): одна ref може належати різним командам у різні роки
    # (ATS: 1963 — італійська, 1978–84 — німецька; міграція 0006).
    pairs = [(ref, t["id"], *t.get("refYears", {}).get(ref, [0, 9999])) for t in teams for ref in t["refs"]]
    exclusions = [(t["id"], e["year"]) for t in teams for e in t.get("exclusions", [])]
    with psycopg.connect(dsn) as conn, conn.transaction():
        conn.execute("delete from f1.team_families")
        conn.execute("delete from f1.team_season_exclusions")
        with conn.cursor() as cur:
            cur.executemany("insert into f1.team_families(ref, family_id, from_year, to_year) values (%s, %s, %s, %s)", pairs)
            if exclusions:
                cur.executemany("insert into f1.team_season_exclusions(family_id, season_year) values (%s, %s)", exclusions)
        # Виправлення помилок даних Jolpica (result-fixes.json): лише якщо значення досі хибне — Jolpica могла виправити сама.
        for fx in json.loads(RESULT_FIXES.read_text(encoding="utf-8"))["fixes"]:
            if fx["field"] not in FIX_SQL:
                raise SystemExit(f"result-fixes.json: поле {fx['field']!r} не підтримується")
            n = conn.execute(FIX_SQL[fx["field"]], fx).rowcount
            print(f"result-fix {fx['year']}/{fx['round']} {fx['driver']} {fx['field']} {fx['from']}→{fx['to']}: "
                  + ("застосовано" if n else "не застосовано (у даних уже інше значення)"))
        unmapped = conn.execute(
            """
            select distinct t.ref from f1.results r
            join f1.sessions s on s.id = r.session_id and s.type = 'R'
            join f1.rounds ro on ro.id = s.round_id
            join f1.teams t on t.id = r.team_id
            left join f1.team_families tf on tf.ref = t.ref and ro.season_year between tf.from_year and tf.to_year
            where tf.ref is null and f1.result_started(r.detail, r.position, r.laps_completed, r.grid, r.status)
            order by 1
            """
        ).fetchall()
        if os.environ.get("F1_DEFER_REFRESH") != "1":  # бойова синхронізація: оновлює check_live.py --publish
            conn.execute("select f1.refresh_derived()")
    print(f"team_families: {len(pairs)} refs → {len(teams)} команд")
    if unmapped:
        print("УВАГА: конструктори зі стартами без команди: " + ", ".join(r[0] for r in unmapped))
        return 1 if args.strict else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
