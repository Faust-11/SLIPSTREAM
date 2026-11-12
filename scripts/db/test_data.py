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
    check("166 команд у f1.team_index (усі кураторські)", len(idx) == 166 and set(idx) == {t["id"] for t in curated},
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

    # Паритет зі знімком фази 3a (для всіх, крім розділених Lotus і ATS).
    snap = {t["id"]: t for t in json.loads((REPO / "src/data/snapshot/teams.json").read_text(encoding="utf-8"))["teams"]}
    diffs = []
    for team_id, s in snap.items():
        if team_id in ("lotus", "ats"):
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
    check(f"паритет зі знімком 3a: {len(snap) - 2} команд", not diffs, diffs[:10])
    check("Lotus: перемоги й Кубки як у знімку (Lotus Racing не перемагала)", (lotus["w"], lotus["t"]) == (snap["lotus"]["wins"], snap["lotus"]["titles"]))
    check("Lotus + Lotus Racing = Гран-прі знімка", lotus["gp"] + racing["gp"] == snap["lotus"]["grandsPrix"], (lotus["gp"], racing["gp"]))
    # ATS (рішення користувача 12.11): 1963 — італійська A.T.S., 1978–84 — німецька; разом = знімок 3a.
    ats, ats_it = idx["ats"], idx["ats-italy"]
    check("ATS розділено: італійська 1963, німецька 1978–1984", ats_it["seasons"] == [[1963, 1963]] and ats["seasons"] == [[1978, 1984]],
          (ats_it["seasons"], ats["seasons"]))
    check("ATS + A.T.S. = Гран-прі знімка", ats["gp"] + ats_it["gp"] == snap["ats"]["grandsPrix"], (ats["gp"], ats_it["gp"]))
    larr = conn.execute("select position, excluded from f1.team_seasons where id = 'larrousse' and year = 1990").fetchone()
    excl = any(e["year"] == 1990 for t in curated if t["id"] == "larrousse" for e in t.get("exclusions", []))
    check("виправлення джерела: Larrousse 1990 виключена, якщо є в curated exclusions", (larr == (None, True)) == excl, (larr, excl))

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

    # --- Сторінка команди (0005): узгодженість зі списком і інваріанти історії ---
    tot = {r[0]: r[1:] for r in conn.execute(
        "select id, grands_prix, wins, podiums, poles, one_twos, constructors_titles, drivers_titles from f1.team_totals")}
    check("team_totals — усі команди списку", set(tot) == set(idx), sorted(set(tot) ^ set(idx))[:10])
    mism = [(k, idx[k]["gp"], idx[k]["w"], idx[k]["t"], tot[k][:2], tot[k][5]) for k in idx if k in tot
            and (tot[k][0], tot[k][1], tot[k][5]) != (idx[k]["gp"], idx[k]["w"], idx[k]["t"])]
    check("Гран-прі, перемоги, Кубки = список команд (для всіх)", not mism, mism[:10])
    cs_year = meta[0][0]
    n_titles = conn.execute("select count(*) from f1.team_seasons where champion").fetchone()[0]
    decided_now = conn.execute("select count(*) from f1.team_seasons where champion and year = %s", (cs_year,)).fetchone()[0]
    check(f"Кубків конструкторів = сезонів 1958–{cs_year - 1} (+ вирішений поточний)", n_titles == cs_year - 1958 + decided_now,
          (n_titles, decided_now))
    n_dt = conn.execute("select coalesce(sum(cardinality(years)), 0) from f1.team_champions").fetchone()[0]
    dup = conn.execute("select y, count(*) from (select unnest(years) y from f1.team_champions) x group by y having count(*) > 1").fetchall()
    check(f"титулів пілотів ≥ сезонів 1950–{cs_year - 1}, по одному на сезон", n_dt >= cs_year - 1950 and not dup, (n_dt, dup))
    races = conn.execute("""select count(distinct ro.id) from f1.rounds ro join f1.sessions s on s.round_id = ro.id and s.type = 'R'
                            join f1.results r on r.session_id = s.id and r.position = 1 and r.is_classified""").fetchone()[0]
    wins_sum = conn.execute("select count(*) from f1.team_wins").fetchone()[0]
    check("перемог у team_wins = гонок з переможцем (спільні машини — одна перемога)", wins_sum == races, (wins_sum, races))
    gaps = conn.execute("select id from f1.team_wins group by id having max(n) <> count(*) or min(n) <> 1").fetchall()
    check("номери перемог 1..N без пропусків", not gaps, gaps[:5])
    over = [k for k, v in tot.items() if v[3] > v[0] or v[4] > v[0] or v[2] > 3 * v[0]]
    check("поули й дублі ≤ Гран-прі, подіуми ≤ 3 × Гран-прі", not over, over[:5])
    rb21 = conn.execute("select points from f1.team_seasons where id = 'red-bull' and year = 2021").fetchone()
    check("очки не округлюються: Red Bull 2021 = 585,5", rb21 is not None and float(rb21[0]) == 585.5, rb21)
    mcl07 = conn.execute("select position, excluded from f1.team_seasons where id = 'mclaren' and year = 2007").fetchone()
    check("McLaren 2007 — виключена з заліку, без місця", mcl07 == (None, True), mcl07)
    running = conn.execute("select bool_and(in_progress), count(*) from f1.team_seasons where year = %s", (cs_year,)).fetchone()
    left = conn.execute("select team_points_left from f1.v_current_season").fetchone()[0]
    check("поточний сезон «триває», поки лишились етапи (навіть якщо Кубок вирішено)", running[0] == (left > 0) and running[1] >= 10, (running, left))
    pre = conn.execute("select count(*) from f1.team_seasons where year < 1958 and position is not null").fetchone()[0]
    check("до 1958 Кубка не було — місць немає", pre == 0, pre)
    pair = conn.execute("select driver, races, points, race_ahead, quali_ahead from f1.team_pairing where id = 'mclaren' order by ord").fetchall()
    check("пара McLaren поточного сезону — 2 пілоти, «попереду» ≤ гонок", len(pair) == 2 and all(r[3] <= r[1] for r in pair), pair)
    haas = conn.execute("select driver, ord, races, in_last_race from f1.team_pairing where id = 'haas' order by ord").fetchall()
    check("Haas: пара — двоє з найбільшою кількістю гонок; Камара (1 гонка) — не в парі, але в останній гонці",
          [r[0] for r in haas[:2]] != ["bearman", "rafael_camara"] and any(r[0] == "rafael_camara" and r[1] > 2 and r[3] for r in haas), haas)
    over = conn.execute("select id, driver from f1.team_pairing where race_ahead > races or quali_ahead > races").fetchall()
    check("«попереду» ніколи не більше за кількість гонок (кваліфікація — лише за цю команду)", not over, over)
    # Довідкові числа для звірки з Вікіпедією (docs/decisions.md) — друк, не перевірка.
    for k in ("mclaren", "ferrari", "williams", "brabham", "lotus", "mercedes", "red-bull", "tyrrell"):
        ch = conn.execute("select driver, years from f1.team_champions where id = %s order by years[1]", (k,)).fetchall()
        print(f"INFO  {k}: GP/W/pod/pole/1-2/КК/ТП = {tot.get(k)}; чемпіони {[(d, y) for d, y in ch]}")
    print("INFO  McLaren пара:", pair)
    print(f"Lotus: {lotus['gp']} Гран-прі; Lotus Racing: {racing['gp']}; site_meta {meta}")

sys.exit(1 if failed else 0)
