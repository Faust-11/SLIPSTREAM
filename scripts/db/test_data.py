#!/usr/bin/env python3
"""Тести бази на повному дампі (CI, db.yml): синхронізація й похідні дані команд.

    TEST_DATABASE_URL=… DUMP_ZIP=dump_csv.zip python3 scripts/db/test_data.py

Порядок у CI: міграції → load_dump → seed_curated → topup_api → цей скрипт.
Код виходу 1, якщо хоч одна перевірка FAIL.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import psycopg

REPO = Path(__file__).resolve().parents[2]
DSN = os.environ.get("TEST_DATABASE_URL") or sys.exit("TEST_DATABASE_URL не задано")
DUMP = os.environ.get("DUMP_ZIP", "dump_csv.zip")
ENV = {**os.environ, "DATABASE_URL": DSN}
TABLES = ["seasons", "circuits", "drivers", "teams", "rounds", "team_drivers", "sessions", "results",
          "laps", "pit_stops", "driver_standings", "team_standings"]

failed = 0


def check(label: str, ok: bool, detail: object = "") -> None:
    global failed
    failed += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'}  {label}" + (f" — {detail}" if detail != "" and not ok else ""))


def counts(conn: psycopg.Connection) -> dict[str, int]:
    return {t: conn.execute(f"select count(*) from f1.{t}").fetchone()[0] for t in TABLES}


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, *args], env=ENV, capture_output=True, text=True)


def index(conn: psycopg.Connection) -> dict[str, dict]:
    rows = conn.execute(
        "select id, seasons, grands_prix, wins, titles, current_position, current_drivers from f1.team_index"
    ).fetchall()
    return {r[0]: {"seasons": r[1], "gp": r[2], "w": r[3], "t": r[4], "pos": r[5], "crew": r[6]} for r in rows}


with psycopg.connect(DSN, autocommit=True) as conn:
    # ---------- Task 2: синхронізація ----------
    before = counts(conn)
    loads = conn.execute("select count(*) from f1.data_loads").fetchone()[0]

    r = run("scripts/jolpica/load_dump.py", "--zip", DUMP, "--skip-if-loaded")
    check("повторний дамп з --skip-if-loaded нічого не робить", r.returncode == 0 and "already loaded" in r.stdout, r.stdout[-300:])
    check("…і не додає запис у data_loads", conn.execute("select count(*) from f1.data_loads").fetchone()[0] == loads)

    r = run("scripts/jolpica/load_dump.py", "--zip", DUMP)
    check("повторне повне завантаження того самого дампу — успіх", r.returncode == 0, r.stderr[-400:])
    # Дамп замінює сесійні дані цілком (і доливку з API) — доливаємо знову й порівнюємо.
    r = run("scripts/jolpica/topup_api.py")
    check("…доливка після повторного дампу — успіх", r.returncode == 0, r.stderr[-400:])
    check("…кількості рядків не змінились (без дублікатів)", counts(conn) == before, counts(conn))

    # Зіпсований дамп: нечислове значення в числовій колонці результатів → помилка, база як була.
    with zipfile.ZipFile(DUMP) as src, tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        with zipfile.ZipFile(tmp, "w") as dst:
            for item in src.infolist():
                data = src.read(item)
                if item.filename == "formula_one_sessionentry.csv":
                    lines = data.decode("utf-8").split("\n")
                    header = lines[0].split(",")
                    col = header.index("laps_completed")
                    cells = lines[1].split(",")
                    cells[col] = "not-a-number"
                    lines[1] = ",".join(cells)
                    data = "\n".join(lines).encode("utf-8")
                dst.writestr(item, data)
        broken = tmp.name
    r = run("scripts/jolpica/load_dump.py", "--zip", broken)
    check("зіпсований дамп — помилка", r.returncode != 0)
    check("…база без змін (одна транзакція)", counts(conn) == before, counts(conn))

    after_topup = counts(conn)
    r = run("scripts/jolpica/topup_api.py", "--dry-run")
    check("topup --dry-run — без змін", r.returncode == 0 and counts(conn) == after_topup, r.stderr[-300:])
    r = run("scripts/jolpica/topup_api.py")
    check("повторний topup — без дублікатів", r.returncode == 0 and counts(conn) == after_topup, r.stdout[-300:])

    # ---------- Task 3: похідні дані команд ----------
    idx = index(conn)
    curated = json.loads((REPO / "src/data/curated/teams.json").read_text(encoding="utf-8"))["teams"]
    check("165 команд у f1.team_index (усі кураторські)", len(idx) == 165 and set(idx) == {t["id"] for t in curated},
          sorted(set(t["id"] for t in curated) ^ set(idx)))

    reference = {  # фаза 3a, docs/audits/phase3a-data.md
        "ferrari": (1143, 250, 16), "alfa-romeo": (216, 10, 0), "vanwall": (28, 9, 1), "tyrrell": (430, 23, 1),
        "brm": (197, 17, 1), "andrea-moda": (1, 0, 0), "mercedes": (361, 143, 9), "red-bull": (437, 133, 6),
    }
    for team_id, (gp, w, t) in reference.items():
        got = (idx[team_id]["gp"], idx[team_id]["w"], idx[team_id]["t"])
        check(f"еталон {team_id} = {gp}/{w}/{t}", got == (gp, w, t), got)

    current = {k: v for k, v in idx.items() if v["pos"] is not None}
    check("11 команд поточного сезону, місця 1..11", sorted(v["pos"] for v in current.values()) == list(range(1, 12)),
          sorted((v["pos"], k) for k, v in current.items()))
    check("Haas — склад останньої гонки: Бермен, Камара", idx["haas"]["crew"] == ["bearman", "rafael_camara"], idx["haas"]["crew"])

    lotus, racing = idx["lotus"], idx["lotus-racing"]
    check("Lotus окремо від Lotus Racing: роки Lotus 1958–1994", lotus["seasons"] == [[1958, 1994]], lotus["seasons"])
    check("Lotus Racing: 2010–2011, без перемог", racing["seasons"] == [[2010, 2011]] and racing["w"] == 0, racing)

    # Паритет зі знімком фази 3a (для всіх, крім розділеного Lotus).
    snap = {t["id"]: t for t in json.loads((REPO / "src/data/snapshot/teams.json").read_text(encoding="utf-8"))["teams"]}
    diffs = []
    for team_id, s in snap.items():
        if team_id == "lotus":
            continue
        d = idx[team_id]
        exp = {
            "seasons": s["seasons"], "gp": s["grandsPrix"], "w": s["wins"], "t": s["titles"],
            "pos": s["current"]["position"] if s["current"] else None,
            "crew": [x["id"] for x in s["current"]["drivers"]] if s["current"] else [],
        }
        got = {k: d[k] for k in exp}
        if got != exp:
            diffs.append((team_id, {k: (exp[k], got[k]) for k in exp if exp[k] != got[k]}))
    check(f"паритет зі знімком 3a: {len(snap) - 1} команд", not diffs, diffs[:10])
    check("Lotus: перемоги й Кубки як у знімку (Lotus Racing не перемагала)", (lotus["w"], lotus["t"]) == (snap["lotus"]["wins"], snap["lotus"]["titles"]))
    check("Lotus + Lotus Racing = Гран-прі знімка", lotus["gp"] + racing["gp"] == snap["lotus"]["grandsPrix"], (lotus["gp"], racing["gp"]))

    # Сезон у процесі, титул не вирішено: без двох останніх гонок 2026 Mercedes має 8 Кубків.
    with conn.transaction():
        conn.execute("""
            delete from f1.results where session_id in (
              select s.id from f1.sessions s join f1.rounds ro on ro.id = s.round_id
              where ro.season_year = 2026 and ro.number >= 19)
        """)
        conn.execute("""
            delete from f1.team_standings where season_year = 2026 and round_number >= 19
        """)
        conn.execute("select f1.refresh_derived()")
        merc = conn.execute("select titles from f1.team_index where id = 'mercedes'").fetchone()[0]
        check("титул 2026 ще не вирішено після 18-го етапу → Mercedes 8", merc == 8, merc)
        raise psycopg.Rollback()

    meta = conn.execute("select current_season, last_round, last_race_date from f1.site_meta").fetchall()
    check("site_meta: один рядок, сезон 2026, останній етап ≥ 20", len(meta) == 1 and meta[0][0] == 2026 and meta[0][1] >= 20, meta)
    print(f"Lotus: {lotus['gp']} Гран-прі; Lotus Racing: {racing['gp']}; site_meta {meta}")

sys.exit(1 if failed else 0)
