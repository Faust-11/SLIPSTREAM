#!/usr/bin/env python3
"""Заміри бойової бази до й після синхронізації (data-sync.yml): розмір, схеми, таблиці Predictor.

    DATABASE_URL=… python3 scripts/db/measure_live.py before state.json   # до міграцій
    DATABASE_URL=… python3 scripts/db/measure_live.py after  state.json   # після синхронізації

before: розмір бази й схем, кількість рядків у кожній таблиці public (Predictor) → state.json;
        код 1, якщо схема f1 уже існує без журналу f1.schema_migrations (чужа схема — не чіпаємо).
after:  ті самі заміри; порівняння рядків public з before (Outlap їх не змінює) і розмір проти ліміту
        Supabase Free (500 МБ на весь проєкт). Код 1 — розмір понад ліміт.
Різниця рядків public лише друкується: Predictor — живий сайт, його користувачі можуть писати під час прогону.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import psycopg
from psycopg import sql

LIMIT_MB = 500
DSN = os.environ.get("DATABASE_URL") or sys.exit("DATABASE_URL не задано")
if len(sys.argv) != 3 or sys.argv[1] not in ("before", "after"):
    sys.exit(__doc__)
mode, state_path = sys.argv[1], Path(sys.argv[2])


def mb(n: int) -> str:
    return f"{n / 1024 / 1024:.1f} МБ"


with psycopg.connect(DSN) as conn:
    db_size = conn.execute("select pg_database_size(current_database())").fetchone()[0]
    schemas = conn.execute("""
        select n.nspname, coalesce(sum(pg_total_relation_size(c.oid)), 0)::bigint
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'm', 'p') and n.nspname not in ('pg_catalog', 'information_schema')
        group by n.nspname order by 2 desc
    """).fetchall()
    public = {
        t: conn.execute(sql.SQL("select count(*) from public.{}").format(sql.Identifier(t))).fetchone()[0]
        for (t,) in conn.execute(
            "select tablename from pg_tables where schemaname = 'public' order by tablename").fetchall()
    }
    f1_tables = [t for (t,) in conn.execute(
        "select tablename from pg_tables where schemaname = 'f1' order by tablename").fetchall()]

print(f"[{mode}] база: {mb(db_size)} з {LIMIT_MB} МБ ({db_size / (LIMIT_MB * 1024 * 1024):.0%})")
for name, size in schemas:
    if size >= 1024 * 1024 or name in ("f1", "public"):
        print(f"  схема {name}: {mb(size)}")
print(f"  public (Predictor): {len(public)} таблиць, {sum(public.values())} рядків")
print(f"  f1: {len(f1_tables)} таблиць")

if mode == "before":
    if f1_tables and "schema_migrations" not in f1_tables:
        sys.exit(f"СТОП: схема f1 уже існує без журналу міграцій ({', '.join(f1_tables[:8])}…) — "
                 "не наша, міграції не застосовуємо")
    state_path.write_text(json.dumps({"db_size": db_size, "public": public}, ensure_ascii=False), encoding="utf-8")
    sys.exit(0)

before = json.loads(state_path.read_text(encoding="utf-8"))
print(f"  приріст бази: {mb(db_size - before['db_size'])}")
changed = {t: (before["public"].get(t), public.get(t)) for t in set(before["public"]) | set(public)
           if before["public"].get(t) != public.get(t)}
print("PASS  таблиці Predictor (public): кількість рядків без змін" if not changed
      else f"WARN  public змінилась під час прогону (Outlap public не пише — перевірити): {changed}")
if db_size > LIMIT_MB * 1024 * 1024:
    sys.exit(f"FAIL  база {mb(db_size)} > {LIMIT_MB} МБ (Supabase Free)")
print(f"PASS  розмір бази в межах {LIMIT_MB} МБ")
