#!/usr/bin/env python3
"""Застосовує supabase/migrations/*.sql по порядку імен; журнал — f1.schema_migrations.

    DATABASE_URL=postgresql://... python3 scripts/db/apply_migrations.py [--dry-run]

Кожна міграція — в окремій транзакції разом із записом у журнал: збій лишає базу як до неї.
Схема public спільного проєкту Supabase (таблиці Predictor) не зачіпається — лише схема f1.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg

MIGRATIONS = Path(__file__).resolve().parents[2] / "supabase" / "migrations"

JOURNAL = """
create schema if not exists f1;
create table if not exists f1.schema_migrations (
  name        text primary key,
  applied_at  timestamptz not null default now()
);
alter table f1.schema_migrations enable row level security;
revoke all on f1.schema_migrations from anon, authenticated;
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="показати, що буде застосовано, без змін")
    args = ap.parse_args()
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL не задано", file=sys.stderr)
        return 2
    files = sorted(MIGRATIONS.glob("*.sql"))
    with psycopg.connect(dsn) as conn:
        with conn.transaction():
            conn.execute(JOURNAL)
        done = {r[0] for r in conn.execute("select name from f1.schema_migrations")}
        todo = [f for f in files if f.name not in done]
        for f in todo:
            print(("would apply " if args.dry_run else "apply ") + f.name)
            if args.dry_run:
                continue
            with conn.transaction():
                conn.execute(f.read_text(encoding="utf-8"))
                conn.execute("insert into f1.schema_migrations(name) values (%s)", (f.name,))
        if not todo:
            print("no pending migrations")
    return 0


if __name__ == "__main__":
    sys.exit(main())
