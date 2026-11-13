#!/usr/bin/env python3
"""Знімок похідних даних бази → JSON-фікстура для unit/e2e (сайт збирається без живого Supabase).

    TEST_DATABASE_URL=… python3 scripts/db/export_fixture.py e2e/fixtures/db

Пише team_index, site_meta і подання сторінки команди (team_*) у форматі відповіді PostgREST (масив об'єктів).
У CI (db.yml) — артефакт; у репозиторії фікстура оновлюється вручну, коли потрібні свіжі дані.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import psycopg

DSN = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL") or sys.exit("TEST_DATABASE_URL не задано")
out = Path(sys.argv[1] if len(sys.argv) > 1 else "e2e/fixtures/db")
out.mkdir(parents=True, exist_ok=True)
QUERIES = {
    "team_index": "select id, seasons, grands_prix, wins, titles, current_position, current_drivers from f1.team_index order by id",
    "site_meta": "select current_season, last_round, last_race_date::text as last_race_date from f1.site_meta",
    # Сторінка команди (0005); дати — текстом, як їх віддає PostgREST.
    "team_totals": "select id, grands_prix, wins, podiums, poles, one_twos, constructors_titles, drivers_titles, "
                   "debut_year, debut_name, debut_date::text as debut_date, last_year, last_name, last_date::text as last_date "
                   "from f1.team_totals order by id",
    "team_seasons": "select id, year, entries, grands_prix, wins, podiums, position, points, excluded, champion, in_progress, season_races "
                    "from f1.team_seasons order by id, year",
    "team_wins": "select id, n, year, round, name, date::text as date, drivers from f1.team_wins order by id, n",
    "team_champions": "select id, driver, forename, surname, years from f1.team_champions order by id, years[1]",
    "driver_index": "select id, forename, surname, code, country_code, nationality, wikipedia_en, starts, wins, podiums, poles, titles, "
                    "title_years, y0, y1, seasons, main_team, current_team, current_number, current_position, current_points "
                    "from f1.driver_index order by id",
    "team_pairing": "select id, driver, forename, surname, ord, races, points, in_last_race, race_ahead, quali_ahead "
                    "from f1.team_pairing order by id, ord",
    "season_index": "select year, races, rounds, in_progress, driver, forename, surname, points, driver_decided, teams, wins, "
                    "cup_team, cup_decided from f1.season_index order by year",
    "season_rules": "select year, driver_best_results, driver_season_split from f1.season_rules order by year",
    "season_rounds": "select year, round, name, date::text as date, cancelled, circuit, locality, country, sprint, winners, "
                     "winner_points, poles, sprint_winners, disqualified from f1.season_rounds order by year, round nulls last, name",
    "season_points": "select year, round, driver, race_points, sprint_points, place, standing, standing_points "
                     "from f1.season_points order by year, round, driver",
    # Сторінка пілота (0008).
    "driver_totals": "select id, date_of_birth::text as date_of_birth, permanent_number, points, fastest_laps, fastest_laps_known, "
                     "debut, last_race, first_podium, first_pole from f1.driver_totals order by id",
    "driver_seasons": "select id, year, teams, numbers, races, wins, podiums, poles, points, position, excluded, champion, in_progress "
                      "from f1.driver_seasons order by id, year",
    "driver_wins": "select id, n, year, round, name, date::text as date, team, grid from f1.driver_wins order by id, n",
    "driver_teammates": "select id, team, mate, forename, surname, years, races, race_ahead, race_behind, quali_races, quali_ahead, "
                        "quali_behind from f1.driver_teammates order by id, team, mate",
}
with psycopg.connect(DSN) as conn:
    for name, sql in QUERIES.items():
        cur = conn.execute(sql)
        cols = [d.name for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        (out / f"{name}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{name}: {len(rows)}")
