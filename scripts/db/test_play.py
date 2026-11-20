#!/usr/bin/env python3
"""Тести схеми play (фаза 9b): очки, дедлайн, права, видимість, чемпіони, паритет з еталоном на даних 2025.

    TEST_DATABASE_URL=postgresql://... python3 scripts/db/test_play.py

Порядок у CI (db.yml): міграції → … → rls_smoke → цей скрипт. Потрібна схема f1 (порожня теж підходить: сценарії самі
створюють синтетичний сезон 2099) і заглушка auth (scripts/db/supabase_stub.sql). Усе виконується в одній транзакції
й відкочується. Паритет з еталоном (scripts/db/play_reference.py) — лише якщо в базі є результати 2025 (повний дамп).
Код виходу 1, якщо хоч одна перевірка FAIL.
"""
from __future__ import annotations

import contextlib
import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any

import psycopg

DSN = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL") or sys.exit("TEST_DATABASE_URL не задано")
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "play_parity_2025.json"

failed = 0
conn = psycopg.connect(DSN, autocommit=False, prepare_threshold=None)
conn.execute("set lock_timeout = '10s'")


def check(label: str, ok: bool, detail: object = "") -> None:
    global failed
    failed += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'}  {label}" + (f" — {detail}" if not ok and detail != "" else ""))


def q(sql: str, *args) -> list[tuple]:
    cur = conn.execute(sql, args)
    return cur.fetchall() if cur.description else []


def one(sql: str, *args) -> Any:
    rows = q(sql, *args)
    return rows[0][0] if rows else None


def scalar(sql: str, *args) -> Any:
    """Як one, але рядок обов'язковий (insert … returning, агрегати): None — збій тесту, а не тихий null."""
    rows = q(sql, *args)
    assert rows, f"запит не повернув рядків: {sql[:60]}"
    return rows[0][0]


@contextlib.contextmanager
def role(name: str, uid: str | None = None):
    conn.execute(f"set local role {name}")
    # Клейми завжди перезаписуємо: інакше uid попереднього виклику «просочиться» в наступний (вхід відсутній ≠ чужий вхід).
    conn.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": uid}) if uid else "",))
    try:
        yield
    finally:
        # Після помилки транзакція «aborted» — reset role неможливий (його відкотить rollback to savepoint), оригінал не маскуємо.
        with contextlib.suppress(psycopg.Error):
            conn.execute("reset role")


def attempt(sql: str, *args, as_role: str | None = None, uid: str | None = None):
    """Виконує sql у точці збереження. Повертає (ok, помилка|рядки); транзакція лишається придатною."""
    conn.execute("savepoint attempt")
    try:
        if as_role:
            with role(as_role, uid):
                res = q(sql, *args)
        else:
            res = q(sql, *args)
        conn.execute("release savepoint attempt")
        return True, res
    except psycopg.Error as e:
        conn.execute("rollback to savepoint attempt")
        conn.execute("release savepoint attempt")
        return False, e


def denied(label: str, sql: str, *args, as_role: str, uid: str | None = None) -> None:
    ok, err = attempt(sql, *args, as_role=as_role, uid=uid)
    check(label, not ok and isinstance(err, psycopg.errors.InsufficientPrivilege), err if ok else type(err).__name__)


def fails(label: str, msg: str, sql: str, *args, as_role: str | None = None, uid: str | None = None) -> None:
    ok, err = attempt(sql, *args, as_role=as_role, uid=uid)
    check(label, not ok and msg in str(err), "виконалось" if ok else str(err).splitlines()[0])


# ---------------------------------------------------------------------------
# Синтетичний сезон 2099: 14 пілотів, 7 команд (по 2), етапи 1–7
# ---------------------------------------------------------------------------
YEAR = 2099
conn.execute("insert into f1.seasons(year) values (%s)", (YEAR,))
TEAM: dict[int, int] = {}
for t in range(1, 8):
    TEAM[t] = scalar("insert into f1.teams(ref, name) values (%s, %s) returning id", f"playt-team-{t}", f"Test team {t}")
DRV: dict[int, int] = {}
DRV_TEAM: dict[int, int] = {}
for d in range(1, 15):
    DRV[d] = scalar("insert into f1.drivers(ref, forename, surname) values (%s, 'Test', %s) returning id", f"playt-drv-{d}", f"Driver {d}")
    DRV_TEAM[d] = TEAM[(d + 1) // 2]
ROUND_ID: dict[int, int] = {}
for n in range(1, 8):
    ROUND_ID[n] = scalar("insert into f1.rounds(season_year, number, name) values (%s, %s, %s) returning id", YEAR, n, f"Test GP {n}")


def session(rnd: int, typ: str, starts_sql: str = "null") -> int:
    return scalar(f"insert into f1.sessions(round_id, type, starts_at) values (%s, %s, {starts_sql}) returning id", ROUND_ID[rnd], typ)


def result(sid: int, d: int, pos: int | None, classified: bool, status: int = 0) -> None:
    conn.execute(
        "insert into f1.results(session_id, driver_id, team_id, position, is_classified, status) values (%s,%s,%s,%s,%s,%s)",
        (sid, DRV[d], DRV_TEAM[d], pos, classified, status),
    )


# Дедлайни: 1 і 4 — Q1 попереду; 2 — минув; 3 — «не справжній» час (північ UTC); 5 — немає Q1.
session(1, "Q1", "now() + interval '2 days'")
session(2, "Q1", "now() - interval '2 days'")
session(3, "Q1", "date_trunc('day', now() + interval '10 days') at time zone 'UTC'")
session(4, "Q1", "now() + interval '3 days'")
session(5, "FP1", "now() + interval '3 days'")

# Кваліфікація етапу 1: Q3 — 4 пілоти, Q2 — 8, Q1 — усі 12 (d12 без часу). Місця — у межах своєї частини.
q3, q2, q1 = session(1, "Q3"), session(1, "Q2"), session(1, "Q1")
for pos, d in enumerate([3, 1, 2, 4], 1):
    result(q3, d, pos, True)
for pos, d in enumerate([1, 3, 2, 5, 4, 6, 7, 8], 1):
    result(q2, d, pos, True)
for pos, d in enumerate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 1):
    result(q1, d, pos, True)
result(q1, 12, 12, False, 11)
# (етап 1 уже має сесію Q1 з дедлайном — вище; результати Q1 додано до другої, без часу: дедлайн бере min(starts_at))
QUALI_EXPECTED = [3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]
got = [r[0] for r in q("select driver_id from play.qualifying_classification where season_year=%s and round=1 order by position", YEAR)]
check("класифікація кваліфікації: Q3 → Q2 → Q1, без часу — позаду всіх", got == [DRV[d] for d in QUALI_EXPECTED], got)
check("класифікація: позиції 1…12 без пропусків", [r[0] for r in q("select position from play.qualifying_classification where season_year=%s and round=1 order by position", YEAR)] == list(range(1, 13)))

# Гонка етапу 1: P1–P9 = d1…d9, P10 = d11 (класифікований, відстав на коло); d10 дискваліфікований, d12 зійшов.
rr = session(1, "R")
for d in range(1, 10):
    result(rr, d, d, True)
result(rr, 11, 10, True, 1)
result(rr, 10, 11, False, 20)   # у Ergast дискваліфікований має числову позицію в списку, але не класифікований
result(rr, 12, 12, False, 11)
got = [r[0] for r in q("select driver_id from play.race_classification where season_year=%s and round=1 order by position", YEAR)]
check("класифікація гонки: лише класифіковані (дискваліфікований і зійшов — поза нею)", got == [DRV[d] for d in [1, 2, 3, 4, 5, 6, 7, 8, 9, 11]], got)

# Гонка етапу 4: усі фінішували.
r4 = session(4, "R")
for d in range(1, 13):
    result(r4, d, d, True)

# Користувачі
U = {name: str(uuid.uuid4()) for name in ("a", "b", "c", "d", "e", "f", "g")}
for name, uid in U.items():
    conn.execute("insert into auth.users(id, email) values (%s, %s)", (uid, f"{name}@example.test"))


def drv(*idx):
    return [DRV[i] if i else None for i in idx]


def pad(*idx):
    return list(idx) + [0] * (10 - len(idx))


def save(user: str, rnd: int, kind: str, picks: list[int], dnf: int | None = None, all_finish: bool = False):
    return attempt("select play.save_prediction(%s, %s, %s, %s::bigint[], %s::bigint, %s)", YEAR, rnd, kind, drv(*picks),
                   TEAM[dnf] if dnf else None, all_finish, as_role="authenticated", uid=U[user])


def points(user: str, rnd: int, kind: str):
    return one("select s.points from play.predictions p join play.scores s on s.prediction_id=p.id where p.user_id=%s and p.season_year=%s and p.round=%s and p.kind=%s",
               U[user], YEAR, rnd, kind)


def breakdown(user: str, rnd: int, kind: str) -> dict:
    res = one("select s.breakdown from play.predictions p join play.scores s on s.prediction_id=p.id where p.user_id=%s and p.season_year=%s and p.round=%s and p.kind=%s",
               U[user], YEAR, rnd, kind)
    assert res is not None, f"немає очок: {user} етап {rnd} {kind}"
    return res


# ---------------------------------------------------------------------------
# Профілі (set_nick)
# ---------------------------------------------------------------------------
for name in U:
    ok, err = attempt("select play.set_nick(%s)", f"Player {name.upper()}", as_role="authenticated", uid=U[name])
    check(f"set_nick: профіль {name}", ok, err)
fails("нік: дубль без урахування регістру — відмова", "profiles_nick_key_idx", "select play.set_nick(%s)", "player a", as_role="authenticated", uid=U["b"])
fails("нік: занадто короткий — відмова", "profiles_nick_chk", "select play.set_nick(%s)", "ab", as_role="authenticated", uid=U["b"])
fails("нік: з @ (схоже на email) — відмова", "profiles_nick_chk", "select play.set_nick(%s)", "me@example.test", as_role="authenticated", uid=U["b"])
for label, bad in (("нульової ширини U+200B", "Max\u200b"), ("м'який перенос U+00AD", "Ma\u00adx"), ("напрям тексту U+202E", "Ma\u202ex"), ("BOM U+FEFF", "\ufeffMax")):
    fails(f"нік: невидимий/дивний символ ({label}) — відмова", "profiles_nick_chk", "select play.set_nick(%s)", bad, as_role="authenticated", uid=U["b"])
# Allowlist + NFKC + «скелет» (міграція 0016, рішення 20.11): підміна імені невидимими/схожими символами неможлива
for label, bad in (("emoji", "Max😀"), ("діакритична латиниця", "Räikkönen"), ("грецька", "Μαξ"), ("комбівний знак", "Ma\u0483x"), ("« ! »", "Max!"), ("подвійний пробіл", "Max  Two"), ("_ на краю", "_Maxx")):
    fails(f"нік: поза allowlist ({label}) — відмова", "profiles_nick_chk", "select play.set_nick(%s)", bad, as_role="authenticated", uid=U["b"])
SPOOFS = [("Admin", "ADMIN", "регістр"), ("Ad min", "AD_MIN", "роздільники й регістр"), ("Борис", "БОРИС", "регістр кирилиці"), ("Ben1", "BenI", "1 та велика I"), ("Benl", "Ben1", "мала L та 1"),
          ("Alex", "AIex", "велика I замість l"), ("Oleg", "0leg", "нуль замість O"), ("Max3", "Мах3", "повна кирилиця: М, а, х + цифра 3"), ("Max3", "МахЗ", "повна кирилиця, З замість 3"),
          ("Max6", "Махб", "б замість 6"), ("Max4", "Махч", "ч замість 4"), ("Pxa", "Рха", "повна кирилиця: Р, х, а"), ("Nah", "Пан", "п → n, н → h"), ("Rex", "Гех", "г → r")]
MIXED = ["Аdmin", "Рavel", "Cергій", "MaxЗ", "BenІ", "Гpавець", "Лев Tolstoy"]  # латиниця + кирилиця в літерах — відмова за одним скриптом (UTS #39)

def set_nick_as(name: str, nick: str):
    return attempt("select play.set_nick(%s)", nick, as_role="authenticated", uid=U[name])


for bad in MIXED:
    fails(f"нік: змішані скрипти «{bad}» — відмова (profiles_nick_chk)", "profiles_nick_chk", "select play.set_nick(%s)", bad, as_role="authenticated", uid=U["b"])
for first, spoof, why in SPOOFS:
    ok, err = set_nick_as("c", first)  # set_nick — upsert: профіль c лише змінює нік
    check(f"нік «{first}» (c) збережено", ok, err)
    fails(f"нік: «{spoof}» не займає «{first}» ({why})", "profiles_nick_key_idx", "select play.set_nick(%s)", spoof, as_role="authenticated", uid=U["b"])
ok, err = set_nick_as("b", "Ｍａｘ\u00a0Ｚed")
check("нік нормалізується NFKC на боці бази: «Ｍａｘ\u00a0Ｚed» → «Max Zed»", ok and one("select nick from play.profiles where user_id=%s", U["b"]) == "Max Zed", err)
for name in ("b", "c"):
    ok, err = set_nick_as(name, f"Player {name.upper()}")
    check(f"набір ніків відновлено ({name})", ok, err)
# Паритет JS↔SQL: та сама фікстура (scripts/db/gen_nick_fixture.mjs з src/lib/play/nick-rules.mjs), що її перевіряє vitest
NICK_FX = json.loads((Path(__file__).resolve().parent / "fixtures" / "nick_parity.json").read_text(encoding="utf-8"))
nick_bad = []
for row in NICK_FX:
    valid, skel = q("select play.nick_valid(normalize(%s, NFKC)), play.nick_skeleton(normalize(%s, NFKC))", row["input"], row["input"])[0]
    if valid != row["valid"] or skel != row["skeleton"]:
        nick_bad.append((row["input"], row["valid"], valid, row["skeleton"], skel))
check(f"паритет JS↔SQL: play.nick_valid і play.nick_skeleton збігаються з nick-rules.mjs на {len(NICK_FX)} зразках", not nick_bad, nick_bad[:5])
fails("нік: пробіл на краю — відмова", "profiles_nick_chk", "select play.set_nick(%s)", " Padded", as_role="authenticated", uid=U["b"])
fails("нік: «Гравець …» зарезервовано під приховані", "profiles_nick_chk", "select play.set_nick(%s)", "Гравець 1A2B", as_role="authenticated", uid=U["b"])
fails("set_nick без входу — відмова", "not_authenticated", "select play.set_nick(%s)", "Nobody", as_role="authenticated")

# ---------------------------------------------------------------------------
# Запис прогнозу: валідація й дедлайн (дедлайн рахує база)
# ---------------------------------------------------------------------------
ok, err = save("a", 1, "R", pad(1, 2, 3, 4, 5, 6, 7, 8, 9, 11), dnf=5)
check("прогноз до дедлайну зберігається", ok, err)
ok, err = save("a", 1, "R", pad(1, 2, 3, 4, 5, 6, 7, 8, 9, 11), dnf=5)
check("повторне збереження оновлює, а не дублює", ok and one("select count(*) from play.predictions where user_id=%s and round=1 and kind='R'", U["a"]) == 1, err)
fails("слот P3 порожній — відмова", "bad_picks", "select play.save_prediction(%s,1,'Q',%s::bigint[])", YEAR, drv(1, 2, 0, 4, 0, 0, 0, 0, 0, 0), as_role="authenticated", uid=U["b"])
fails("повтор пілота — відмова", "bad_picks", "select play.save_prediction(%s,1,'Q',%s::bigint[])", YEAR, drv(1, 1, 3, 0, 0, 0, 0, 0, 0, 0), as_role="authenticated", uid=U["b"])
fails("9 слотів замість 10 — відмова", "bad_picks", "select play.save_prediction(%s,1,'Q',%s::bigint[])", YEAR, drv(1, 2, 3, 4, 5, 6, 7, 8, 9), as_role="authenticated", uid=U["b"])
fails("невідомий пілот — відмова", "unknown_driver", "select play.save_prediction(%s,1,'Q',%s::bigint[])", YEAR, [DRV[1], DRV[2], -5] + [None] * 7, as_role="authenticated", uid=U["b"])
fails("невідомий етап — відмова", "unknown_round", "select play.save_prediction(%s,99,'Q',%s::bigint[])", YEAR, drv(*pad(1, 2, 3)), as_role="authenticated", uid=U["b"])
fails("кваліфікація з «яка команда не фінішує» — відмова", "bad_extras", "select play.save_prediction(%s,1,'Q',%s::bigint[],%s::bigint)", YEAR, drv(*pad(1, 2, 3)), TEAM[1], as_role="authenticated", uid=U["b"])
fails("без входу — відмова", "not_authenticated", "select play.save_prediction(%s,1,'Q',%s::bigint[])", YEAR, drv(*pad(1, 2, 3)), as_role="authenticated")
conn.execute("insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000aa')")
fails("без профілю — відмова", "no_profile", "select play.save_prediction(%s,1,'Q',%s::bigint[])", YEAR, drv(*pad(1, 2, 3)), as_role="authenticated", uid="00000000-0000-0000-0000-0000000000aa")
fails("дедлайн минув (Q1 два дні тому) — відмова", "prediction_closed", "select play.save_prediction(%s,2,'Q',%s::bigint[])", YEAR, drv(*pad(1, 2, 3)), as_role="authenticated", uid=U["b"])
fails("час «не справжній» (північ UTC) — закрито", "prediction_closed", "select play.save_prediction(%s,3,'Q',%s::bigint[])", YEAR, drv(*pad(1, 2, 3)), as_role="authenticated", uid=U["b"])
fails("немає сесії Q1 — закрито", "prediction_closed", "select play.save_prediction(%s,5,'Q',%s::bigint[])", YEAR, drv(*pad(1, 2, 3)), as_role="authenticated", uid=U["b"])
fails("тригер: пряма вставка після дедлайну (навіть ролі postgres) — відмова", "prediction_closed",
      "insert into play.predictions(user_id, season_year, round, kind, picks) values (%s,%s,2,'Q',%s::bigint[])", U["a"], YEAR, drv(*pad(1, 2, 3)))
check("дедлайн = старт Q1 − 5 хв",
      one("select play.deadline(%s, 1) = (select min(starts_at) from f1.sessions where round_id=%s and type='Q1') - interval '5 minutes'", YEAR, ROUND_ID[1]) is True)
conn.execute("savepoint dl")
conn.execute("update f1.sessions set starts_at = now() + interval '4 minutes' where round_id=%s and type='Q1' and starts_at is not null", (ROUND_ID[1],))
fails("за 4 хв до старту (дедлайн минув) — оновлення відхилено", "prediction_closed", "select play.save_prediction(%s,1,'R',%s::bigint[])", YEAR, drv(*pad(2, 1, 3)), as_role="authenticated", uid=U["a"])
conn.execute("rollback to savepoint dl")

# Прямий запис таблицями гравцеві закрито
denied("authenticated не вставляє в predictions напряму", "insert into play.predictions(user_id, season_year, round, kind, picks) values (%s,%s,1,'Q',%s::bigint[])", U["a"], YEAR, drv(*pad(1, 2, 3)), as_role="authenticated", uid=U["a"])
denied("authenticated не оновлює predictions напряму", "update play.predictions set kind='Q'", as_role="authenticated", uid=U["a"])
denied("authenticated не видаляє predictions напряму", "delete from play.predictions", as_role="authenticated", uid=U["a"])
denied("authenticated не пише в scores", "insert into play.scores(prediction_id, points, breakdown) values (1, 999, '{}')", as_role="authenticated", uid=U["a"])
denied("authenticated не змінює профіль напряму (нік/блокування)", "update play.profiles set nick_hidden = false", as_role="authenticated", uid=U["a"])
denied("authenticated не викликає score_round", "select play.score_round(%s, 1)", YEAR, as_role="authenticated", uid=U["a"])
denied("authenticated не викликає close_season", "select play.close_season(%s)", YEAR, as_role="authenticated", uid=U["a"])
denied("authenticated не викликає score_all", "select play.score_all()", as_role="authenticated", uid=U["a"])
denied("anon не викликає save_prediction", "select play.save_prediction(%s,1,'Q',%s::bigint[])", YEAR, drv(*pad(1, 2, 3)), as_role="anon")
denied("anon не читає predictions", "select * from play.predictions", as_role="anon")
denied("anon не читає profiles", "select * from play.profiles", as_role="anon")
denied("anon не читає scores", "select * from play.scores", as_role="anon")
denied("anon не читає службові класифікації", "select * from play.race_classification", as_role="anon")
denied("authenticated не читає службові класифікації", "select * from play.qualifying_classification", as_role="authenticated", uid=U["a"])

# ---------------------------------------------------------------------------
# Очки: кожне правило на етапі 1
# ---------------------------------------------------------------------------
# d13, d14 у результатах не беруть участі. a — ідеальна гонка (+ команда, що не фінішує: T5 має d10 дискваліфікованого); b — нуль; c — частковий; d — усе «близько»;
# e — лише подіум; f — «усі фінішують» на етапі з сходами (0); g — хибна команда.
cases = {
    "a": (pad(1, 2, 3, 4, 5, 6, 7, 8, 9, 11), 5, False),
    "b": (pad(12, 10, 13), None, False),
    "c": (pad(2, 1, 3), None, False),
    "d": (pad(2, 1, 4, 3, 6, 5, 8, 7, 11, 9), None, False),
    "e": (pad(1, 2, 3), None, False),
    "f": (pad(1, 2, 3), None, True),
    "g": (pad(1, 2, 3), 1, False),
}
for u, (picks, dnf, af) in cases.items():
    ok, err = save(u, 1, "R", picks, dnf, af)
    check(f"прогноз гонки {u} збережено", ok, err)
ok, err = save("a", 1, "Q", pad(3, 1, 2, 4, 5, 6, 7, 8, 9, 10))
check("прогноз кваліфікації a (ідеальний) збережено", ok, err)
ok, err = save("b", 1, "Q", pad(1, 2, 3, 4, 5, 6, 7, 8, 9, 10))
check("прогноз кваліфікації b збережено", ok, err)

check("score_round: оцінено 9 прогнозів етапу 1 (7 гонка + 2 кваліфікація)", one("select play.score_round(%s, 1)", YEAR) == 9)
check("гонка a: 10+8+6+3×7=45, +10 подіум, +30 десятка, +10 команда T5 = 95", points("a", 1, "R") == 95, points("a", 1, "R"))
check("гонка b: пілоти поза топ-10 → 0", points("b", 1, "R") == 0, points("b", 1, "R"))
check("гонка c: d2/d1 переставлені (+1+1), d3 точно (6) = 8, подіуму немає", points("c", 1, "R") == 8, points("c", 1, "R"))
check("гонка d: десять «близьких» = 10, точних 0", points("d", 1, "R") == 10 and breakdown("d", 1, "R")["exact"] == 0 and breakdown("d", 1, "R")["near"] == 10, breakdown("d", 1, "R"))
check("гонка e: лише подіум = 10+8+6+10 = 34, десятки немає (слоти порожні)", points("e", 1, "R") == 34 and breakdown("e", 1, "R")["top10_bonus"] == 0, breakdown("e", 1, "R"))
check("гонка f: «усі фінішують», а були сходи → 0 бонусу", breakdown("f", 1, "R")["dnf_bonus"] == 0 and points("f", 1, "R") == 34)
check("гонка g: хибна команда → 0 бонусу", breakdown("g", 1, "R")["dnf_bonus"] == 0)
check("кваліфікація a: ідеальна за класифікацією = 85", points("a", 1, "Q") == 85, points("a", 1, "Q"))
# b: слоти 1..10 = d1..d10; факт: d3,d1,d2,d4,d5,d6,d7,d8,d9,d10 → точні: слоти 4…10 (7×3=21); d1,d2,d3 у слотах 1–3 не на місці → +3.
check("кваліфікація b: 7 точних слотів (21) + 3 «близьких» = 24", points("b", 1, "Q") == 24, points("b", 1, "Q"))
bd = breakdown("a", 1, "R")
check("breakdown містить слоти з фактичними позиціями", len(bd["slots"]) == 10 and bd["slots"][9]["actual"] == 10 and bd["slots"][0]["points"] == 10, bd["slots"][:2])

# Гонка без сходів: «усі фінішують» +10
ok, err = save("a", 4, "R", pad(1, 2, 3), None, True)
check("прогноз на етап без сходів збережено", ok, err)
ok, err = save("b", 4, "R", pad(1, 2, 3), 2, False)
check("прогноз «команда не фінішує» на етап без сходів збережено", ok, err)
check("score_round етапу 4: 2 прогнози", one("select play.score_round(%s, 4)", YEAR) == 2)
check("етап 4: «усі фінішують» + подіум = 34 (+10)", points("a", 4, "R") == 34 + 10, points("a", 4, "R"))
check("етап 4: команда, що не відбулась, → 34", points("b", 4, "R") == 34, points("b", 4, "R"))

# Етап без результатів нічого не оцінює; етап без прогнозів — 0
check("score_round етапу без результатів = 0 і не створює очок", one("select play.score_round(%s, 2)", YEAR) == 0)

# Ідемпотентність і перерахунок
before = q("select prediction_id, points, scored_at from play.scores order by prediction_id")
check("повторний score_round: ті самі очки, scored_at не змінився", one("select play.score_round(%s, 1)", YEAR) == 9 and q("select prediction_id, points, scored_at from play.scores order by prediction_id") == before)
conn.execute("savepoint resc")
conn.execute("update f1.results set is_classified=false, status=20 where driver_id=%s and session_id=%s", (DRV[1], rr))   # штраф: d1 дискваліфікований
one("select play.score_round(%s, 1)", YEAR)
check("перерахунок після зміни результату: a втратив подіум і десятку", points("a", 1, "R") < 95 and breakdown("a", 1, "R")["top10_bonus"] == 0, breakdown("a", 1, "R"))
conn.execute("rollback to savepoint resc")
one("select play.score_round(%s, 1)", YEAR)
check("після відкату результатів очки повернулись до 95", points("a", 1, "R") == 95)

# ---------------------------------------------------------------------------
# Видимість: до дедлайну чужі прогнози не видно; після — видно; заблоковані й приховані
# ---------------------------------------------------------------------------
with role("authenticated", U["b"]):
    mine = q("select user_id from play.predictions where round = 1")
check("гравець бачить лише свої прогнози (RLS)", len(mine) == 2 and all(str(r[0]) == U["b"] for r in mine), mine)
with role("authenticated", U["b"]):
    sc = q("select count(*) from play.scores")[0][0]
check("гравець бачить лише свої очки (RLS)", sc == 3, sc)   # b: гонка е1, кваліфікація е1, гонка е4
with role("anon"):
    rev = q("select count(*) from play.revealed_predictions where season_year=%s", YEAR)[0][0]
check("до дедлайну (етапи 1, 4 попереду) revealed_predictions порожнє", rev == 0, rev)

conn.execute("alter table play.predictions disable trigger predictions_guard")
conn.execute("insert into play.predictions(user_id, season_year, round, kind, picks) values (%s,%s,2,'Q',%s::bigint[])", (U["a"], YEAR, drv(*pad(1, 2, 3))))
conn.execute("insert into play.predictions(user_id, season_year, round, kind, picks) values (%s,%s,2,'Q',%s::bigint[])", (U["g"], YEAR, drv(*pad(3, 2, 1))))
conn.execute("alter table play.predictions enable trigger predictions_guard")
with role("anon"):
    rev = [r[0] for r in q("select player from play.revealed_predictions where season_year=%s and round=2 order by player", YEAR)]
check("після дедлайну (етап 2) прогнози видно всім", rev == ["Player A", "Player G"], rev)
conn.execute("insert into play.blocked_users(user_id) values (%s)", (U["g"],))
with role("anon"):
    rev = [r[0] for r in q("select player from play.revealed_predictions where season_year=%s and round=2", YEAR)]
check("заблокований гравець зникає з публічних подань", rev == ["Player A"], rev)
fails("заблокований не зберігає прогноз", "blocked", "select play.save_prediction(%s,1,'Q',%s::bigint[])", YEAR, drv(*pad(1, 2, 3)), as_role="authenticated", uid=U["g"])
conn.execute("delete from play.blocked_users where user_id=%s", (U["g"],))
conn.execute("update play.profiles set nick_hidden = true where user_id=%s", (U["g"],))
with role("anon"):
    rev = [r[0] for r in q("select player from play.revealed_predictions where season_year=%s and round=2 order by player", YEAR)]
check("прихований нік замінено на «Гравець XXXX», прогноз лишився", len(rev) == 2 and "Player G" not in rev and sum(n.startswith("Гравець ") for n in rev) == 1, rev)
conn.execute("update play.profiles set nick_hidden = false where user_id=%s", (U["g"],))
conn.execute("delete from play.predictions where round = 2")

# ---------------------------------------------------------------------------
# Таблиця: однакова сума — однакове місце (1, 1, 3); публічні подання
# ---------------------------------------------------------------------------
conn.execute("alter table play.predictions disable trigger predictions_guard")
conn.execute("delete from play.scores")
conn.execute("delete from play.predictions")
conn.execute("delete from play.season_champions")
picks3 = drv(*pad(1, 2, 3))


def seed(user: str, rnd: int, pts: int) -> None:
    pid = scalar("insert into play.predictions(user_id, season_year, round, kind, picks) values (%s,%s,%s,'Q',%s::bigint[]) returning id", U[user], YEAR, rnd, picks3)
    conn.execute("insert into play.scores(prediction_id, points, breakdown) values (%s,%s,'{}')", (pid, pts))


# Етапи 1,4,6,7 — N = 4, мінімум участі 2. a: 50+50 (2 етапи) = 100; b: 60+40 = 100; c: 150 за один етап (не eligible);
# d: 20×4 = 80; e (заблокований): 500 за 4 етапи. g: 0 прогнозів.
for rnd, pts in ((1, 50), (4, 50)):
    seed("a", rnd, pts)
for rnd, pts in ((6, 60), (7, 40)):
    seed("b", rnd, pts)
seed("c", 1, 150)
for rnd in (1, 4, 6, 7):
    seed("d", rnd, 20)
    seed("e", rnd, 125)
conn.execute("insert into play.blocked_users(user_id) values (%s)", (U["e"],))
with role("anon"):
    st = q("select player, points, rounds, place, eligible, rounds_counted from play.season_standings where season_year=%s order by place, player", YEAR)
check("таблиця: c=150 (1), a=b=100 (2, 2), d=80 (4); заблокований e відсутній",
      [(r[0], r[1], r[3]) for r in st] == [("Player C", 150, 1), ("Player A", 100, 2), ("Player B", 100, 2), ("Player D", 80, 4)], st)
check("таблиця: eligible за половиною етапів (N=4 → мінімум 2); c — ні", {r[0]: r[4] for r in st} == {"Player C": False, "Player A": True, "Player B": True, "Player D": True}, st)
with role("anon"):
    rs = q("select player, points, place from play.round_standings where season_year=%s and round=1 order by place, player", YEAR)
check("таблиця етапу 1: c 150, a 50, d 20 (місця 1, 2, 3; заблокований e прихований)", [(r[0], r[1], r[2]) for r in rs] == [("Player C", 150, 1), ("Player A", 50, 2), ("Player D", 20, 3)], rs)

# close_season
fails("close_season: сезон без оцінених прогнозів — відмова", "no_scored_rounds", "select play.close_season(2098)")
check("close_season: чемпіони — a і b (нічия), c без мінімуму участі, e заблокований", one("select play.close_season(%s)", YEAR) == 2)
champs = q("select player, points, rounds_played, rounds_counted from play.champions where season_year=%s order by player", YEAR)
check("champions: Player A і Player B по 100, етапів 2 з 4", champs == [("Player A", 100, 2, 4), ("Player B", 100, 2, 4)], champs)
check("season_closures: N=4, мінімум 2, 2 чемпіони", q("select rounds_counted, min_rounds, champions from play.season_closures where season_year=%s", YEAR) == [(4, 2, 2)])
conn.execute("update play.scores set points = 120 where prediction_id = (select p.id from play.predictions p where p.user_id=%s and p.round=6)", (U["b"],))
check("повторне закриття замінює чемпіонів: тепер лише b (120+40 = 160)", one("select play.close_season(%s)", YEAR) == 1
      and q("select player from play.champions where season_year=%s", YEAR) == [("Player B",)])
with role("anon"):
    denied_champs = q("select count(*) from play.champions")[0][0]
check("anon читає champions", denied_champs >= 1)
denied("anon не читає season_champions напряму", "select * from play.season_champions", as_role="anon")
denied("authenticated не читає season_closures", "select * from play.season_closures", as_role="authenticated", uid=U["a"])

# Неоцінені прогнози блокують закриття
pid = scalar("insert into play.predictions(user_id, season_year, round, kind, picks) values (%s,%s,1,'R',%s::bigint[]) returning id", U["d"], YEAR, picks3)
fails("close_season: є неоцінений прогноз на етап із результатами — відмова", "season_not_scored", "select play.close_season(%s)", YEAR)
conn.execute("alter table play.predictions enable trigger predictions_guard")

# Видалення даних гравця — каскадом
check("титул b є перед видаленням", one("select count(*) from play.season_champions where user_id=%s", U["b"]) == 1)
ok, err = attempt("select play.delete_my_profile()", as_role="authenticated", uid=U["b"])
check("delete_my_profile виконується", ok, err)
check("видалення профілю прибрало прогнози, очки й титули",
      one("select count(*) from play.profiles where user_id=%s", U["b"]) == 0
      and one("select count(*) from play.predictions where user_id=%s", U["b"]) == 0
      and one("select count(*) from play.season_champions where user_id=%s", U["b"]) == 0)
# Блокування переживає видалення профілю: block → delete_my_profile → set_nick / save_prediction відхиляються (рев'ю безпеки)
conn.execute("insert into play.blocked_users(user_id) values (%s)", (U["f"],))
ok, err = attempt("select play.delete_my_profile()", as_role="authenticated", uid=U["f"])
check("заблокований може видалити свої дані (право на видалення)", ok and one("select count(*) from play.profiles where user_id=%s", U["f"]) == 0
      and one("select count(*) from play.predictions where user_id=%s", U["f"]) == 0, err)
check("…а запис блокування лишається (лише службовий uid, без ніка й прогнозів)", one("select count(*) from play.blocked_users where user_id=%s", U["f"]) == 1)
fails("block → видалення профілю → set_nick відхилено", "blocked", "select play.set_nick(%s)", "Fresh Start", as_role="authenticated", uid=U["f"])
fails("block → видалення профілю → save_prediction відхилено", "blocked", "select play.save_prediction(%s,1,'Q',%s::bigint[])", YEAR, drv(*pad(1, 2, 3)), as_role="authenticated", uid=U["f"])
check("після відхилення профіль не створився", one("select count(*) from play.profiles where user_id=%s", U["f"]) == 0)
denied("authenticated не читає й не знімає блокування", "delete from play.blocked_users", as_role="authenticated", uid=U["f"])
conn.execute("delete from play.blocked_users where user_id=%s", (U["f"],))
ok, err = attempt("select play.set_nick(%s)", "Fresh Start", as_role="authenticated", uid=U["f"])
check("після зняття блокування модератором set_nick знову працює", ok, err)

# Повне видалення акаунта (0016): користувач auth + дані гри; заблокований — лише дані гри, auth лишається (блок за поштою)
ok, err = attempt("select play.delete_my_account()", as_role="authenticated", uid=U["f"])
check("delete_my_account: звичайний гравець — користувач auth і профіль зникли", ok and one("select count(*) from auth.users where id=%s", U["f"]) == 0
      and one("select count(*) from play.profiles where user_id=%s", U["f"]) == 0, err)
fails("delete_my_account без входу — відмова", "not_authenticated", "select play.delete_my_account()", as_role="authenticated")
denied("anon не викликає delete_my_account", "select play.delete_my_account()", as_role="anon")
conn.execute("insert into auth.users(id, email) values (%s, 'blocked@example.test')", (U["f"],))
ok, err = attempt("select play.set_nick(%s)", "Blocked Soon", as_role="authenticated", uid=U["f"])
conn.execute("insert into play.blocked_users(user_id) values (%s)", (U["f"],))
res = None
with role("authenticated", U["f"]):
    res = one("select play.delete_my_account()")
check("delete_my_account: заблокований — відповідь data_only_blocked", res == "data_only_blocked", res)
check("…дані гри видалено, а auth.users і блокування ЛИШИЛИСЬ (блок не знімається видаленням)",
      one("select count(*) from play.profiles where user_id=%s", U["f"]) == 0
      and one("select count(*) from auth.users where id=%s", U["f"]) == 1
      and one("select count(*) from play.blocked_users where user_id=%s", U["f"]) == 1)
conn.execute("delete from play.blocked_users where user_id=%s", (U["f"],))

conn.execute("delete from auth.users where id=%s", (U["c"],))
check("видалення користувача auth каскадом прибирає профіль і прогнози", one("select count(*) from play.profiles where user_id=%s", U["c"]) == 0 and one("select count(*) from play.predictions where user_id=%s", U["c"]) == 0)

# ---------------------------------------------------------------------------
# Паритет з еталоном (Python) на даних 2025 з повного дампу
# ---------------------------------------------------------------------------
conn.execute("rollback")
conn.execute("set lock_timeout = '10s'")
have_2025 = one("select count(*) from play.race_classification where season_year = 2025") or 0
if have_2025 >= 400 and FIXTURE.exists():
    fx = json.loads(FIXTURE.read_text(encoding="utf-8"))
    conn.execute("alter table play.predictions disable trigger predictions_guard")
    users = {k: str(uuid.uuid4()) for k in ("Q_stand", "R_stand", "R_grid")}
    for k, uid in users.items():
        conn.execute("insert into auth.users(id) values (%s)", (uid,))
        conn.execute("insert into play.profiles(user_id, nick) values (%s, %s)", (uid, f"parity {k}"))
    refs = {r[0]: r[1] for r in q("select ref, id from f1.drivers")}
    missing = {d for r in fx["rounds"].values() for k in ("stand", "grid") for d in r[k] if d not in refs}
    check("паритет: усі пілоти фікстури є в f1.drivers", not missing, sorted(missing))
    for rnd, r in fx["rounds"].items():
        for k, uid in users.items():
            kind = "Q" if k.startswith("Q") else "R"
            picks = [refs[d] for d in (r["grid"] if k == "R_grid" else r["stand"])]
            conn.execute("insert into play.predictions(user_id, season_year, round, kind, picks) values (%s,2025,%s,%s,%s::bigint[])", (uid, int(rnd), kind, picks))
        one("select play.score_round(2025, %s)", int(rnd))
    got_total = {k: one("select coalesce(sum(s.points),0) from play.predictions p join play.scores s on s.prediction_id=p.id where p.user_id=%s", uid) for k, uid in users.items()}
    check(f"паритет 2025: сума очок за сезон збігається з еталоном {fx['totals']}", got_total == fx["totals"], got_total)
    bad = []
    for rnd, r in fx["rounds"].items():
        for k, uid in users.items():
            p = one("select s.points from play.predictions p join play.scores s on s.prediction_id=p.id where p.user_id=%s and p.round=%s", uid, int(rnd))
            if p != r["expected"][k]:
                bad.append((rnd, k, p, r["expected"][k]))
    check("паритет 2025: очки кожного з 23 етапів × 3 прогнозів збігаються з еталоном", not bad, bad[:8])
else:
    print(f"SKIP  паритет 2025: у базі {have_2025} класифікованих результатів (потрібен повний дамп)")

conn.execute("rollback")
conn.close()
sys.exit(1 if failed else 0)
