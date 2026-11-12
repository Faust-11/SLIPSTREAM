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
        c.execute("insert into f1.subject_texts(subject_type, subject_id, lang, status) values ('team', -1, 'uk', 'draft') on conflict do nothing")
        c.execute("insert into f1.facts(subject_type, subject_id, status, text_uk, publish) values ('team', -1, 'confirmed', 'rls-smoke-draft', 'draft')")
        c.execute(f"set local role {role}")
        try:
            cur = c.execute(sql)
            rows = cur.fetchall() if cur.description else []
            ok = True
            res = rows
        except psycopg.errors.InsufficientPrivilege as e:
            ok, res = False, type(e).__name__
        except psycopg.Error as e:
            # Інша помилка (немає таблиці, синтаксис) — не «доступ заборонено»: інакше перевірка проходила б упусту.
            ok, res = None, f"{type(e).__name__}: {str(e).splitlines()[0]}"
        c.execute("rollback")
    passed = ok == expect_ok and (expect_rows is None or (ok and len(res) == expect_rows))
    failed += 0 if passed else 1
    print(f"{'PASS' if passed else 'FAIL'}  {label}: {'ok' if ok else 'blocked' if ok is False else 'error'} -> {res if not ok else len(res)}")


def structure(label: str, sql: str) -> None:
    """Структурна перевірка каталогу: запит повертає порушення; PASS — жодного."""
    global failed
    with psycopg.connect(DSN) as c:
        bad = [r[0] for r in c.execute(sql).fetchall()]
    failed += 1 if bad else 0
    print(f"{'FAIL' if bad else 'PASS'}  {label}" + (f": {bad}" if bad else ""))


# Нові об'єкти не мають ставати публічними мовчки (0004): ці перевірки ловлять пропуск у майбутній міграції.
# Подання без RLS, які anon читає навмисно (0002 — список команд, 0005 — сторінка команди).
PUBLIC_VIEWS = ("team_index", "site_meta", "team_seasons", "team_champions", "team_wins", "team_totals", "team_pairing")
PUBLIC_FUNCTIONS = ("result_started",)        # чиста функція з 0002, використовується в team_index
structure("RLS увімкнено на кожній таблиці f1", """
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'f1' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1""")
structure(f"без RLS anon читає лише {', '.join(PUBLIC_VIEWS)}", f"""
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'f1' and c.relkind in ('v', 'm', 'f') and has_table_privilege('anon', c.oid, 'select')
      and c.relname not in ({', '.join(f"'{v}'" for v in PUBLIC_VIEWS)}) order by 1""")
structure(f"anon виконує лише функції {', '.join(PUBLIC_FUNCTIONS)}", f"""
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'f1' and has_function_privilege('anon', p.oid, 'execute')
      and p.proname not in ({', '.join(f"'{f}'" for f in PUBLIC_FUNCTIONS)}) order by 1""")
structure("немає прав «за замовчуванням» для anon/authenticated у f1", """
    select d.defaclobjtype::text from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname = 'f1' and array_to_string(d.defaclacl, ',') ~ '(^|,)(anon|authenticated)='""")


for role in ("anon", "authenticated"):
    check(f"{role} reads f1.teams", role, "select id from f1.teams limit 1")
    check(f"{role} reads f1.team_index", role, "select id from f1.team_index limit 1")
    check(f"{role} reads f1.site_meta", role, "select current_season from f1.site_meta")
    check(f"{role} reads f1.team_totals", role, "select id from f1.team_totals limit 1")
    check(f"{role} cannot read f1.v_team_race (службове)", role, "select 1 from f1.v_team_race limit 1", expect_ok=False)
    check(f"{role} cannot refresh derived data", role, "select f1.refresh_derived()", expect_ok=False)
    check(f"{role} cannot write f1.team_families", role, "delete from f1.team_families", expect_ok=False)
    check(f"{role} cannot insert f1.teams", role, "insert into f1.teams(ref, name) values ('rls-x', 'x')", expect_ok=False)
    check(f"{role} cannot update f1.results", role, "update f1.results set points = 0", expect_ok=False)
    check(f"{role} cannot delete f1.rounds", role, "delete from f1.rounds", expect_ok=False)
    check(f"{role} cannot read f1.data_loads", role, "select * from f1.data_loads", expect_ok=False)
    check(f"{role} cannot read f1.schema_migrations", role, "select * from f1.schema_migrations", expect_ok=False)
    check(f"{role} does not see draft stories", role, "select slug from f1.stories where slug = 'rls-smoke-draft'", expect_rows=0)
    check(f"{role} does not see draft subject texts", role, "select subject_id from f1.subject_texts where subject_id = -1", expect_rows=0)
    check(f"{role} does not see unpublished facts", role, "select id from f1.facts where text_uk = 'rls-smoke-draft'", expect_rows=0)

sys.exit(1 if failed else 0)
