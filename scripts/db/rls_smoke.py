#!/usr/bin/env python3
"""Перевірка прав доступу схеми f1 (локальна/CI база або Supabase з роллю postgres).

    TEST_DATABASE_URL=postgresql://... python3 scripts/db/rls_smoke.py

anon/authenticated: читають опубліковані дані f1, не пишуть, не бачать службових таблиць і чернеток.
Код виходу 1, якщо хоч одна перевірка FAIL. Тестові рядки створюються в транзакції й відкочуються.
"""
from __future__ import annotations

import os
import sys

import psycopg

DSN = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
if not DSN:
    sys.exit("TEST_DATABASE_URL не задано")

failed = 0


def check(label: str, role: str, sql: str, expect_ok: bool = True, expect_rows: int | None = None) -> None:
    global failed
    with psycopg.connect(DSN, autocommit=True) as c:
        c.execute("begin")
        # Чернетка історії — щоб перевірити, що її не видно.
        c.execute("insert into f1.stories(slug, status) values ('rls-smoke-draft', 'draft') on conflict do nothing")
        c.execute(f"set local role {role}")
        try:
            cur = c.execute(sql)
            rows = cur.fetchall() if cur.description else []
            ok = True
            res = rows
        except psycopg.Error as e:
            ok, res = False, type(e).__name__
        c.execute("rollback")
    passed = ok == expect_ok and (expect_rows is None or (ok and len(res) == expect_rows))
    failed += 0 if passed else 1
    print(f"{'PASS' if passed else 'FAIL'}  {label}: {'ok' if ok else 'blocked'} -> {res if not ok else len(res)}")


for role in ("anon", "authenticated"):
    check(f"{role} reads f1.teams", role, "select id from f1.teams limit 1")
    check(f"{role} reads f1.team_index", role, "select id from f1.team_index limit 1")
    check(f"{role} cannot refresh derived data", role, "select f1.refresh_derived()", expect_ok=False)
    check(f"{role} cannot write f1.team_families", role, "delete from f1.team_families", expect_ok=False)
    check(f"{role} cannot insert f1.teams", role, "insert into f1.teams(ref, name) values ('rls-x', 'x')", expect_ok=False)
    check(f"{role} cannot update f1.results", role, "update f1.results set points = 0", expect_ok=False)
    check(f"{role} cannot delete f1.rounds", role, "delete from f1.rounds", expect_ok=False)
    check(f"{role} cannot read f1.data_loads", role, "select * from f1.data_loads", expect_ok=False)
    check(f"{role} cannot read f1.schema_migrations", role, "select * from f1.schema_migrations", expect_ok=False)
    check(f"{role} does not see draft stories", role, "select slug from f1.stories where slug = 'rls-smoke-draft'", expect_rows=0)

sys.exit(1 if failed else 0)
