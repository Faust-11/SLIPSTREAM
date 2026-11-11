#!/usr/bin/env python3
"""Знімок похідних даних бази → JSON-фікстура для unit/e2e (сайт збирається без живого Supabase).

    TEST_DATABASE_URL=… python3 scripts/db/export_fixture.py e2e/fixtures/db

Пише team_index.json і site_meta.json у форматі відповіді PostgREST (масив об'єктів).
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
}
with psycopg.connect(DSN) as conn:
    for name, sql in QUERIES.items():
        cur = conn.execute(sql)
        cols = [d.name for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        (out / f"{name}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{name}: {len(rows)}")
