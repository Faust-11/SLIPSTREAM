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
    # --- Список пілотів (0007) ---
    drv = {r[0]: r[1:] for r in conn.execute("select id, starts, wins, podiums, poles, titles from f1.driver_index")}
    # Еталони — історичні числа, що вже не змінюються (Вікіпедія 12.11): старти / перемоги / подіуми / титули.
    # Шумахер: Вікіпедія — 306 стартів, у нас 308 (гіпотеза: 2 сходи на прогрівальному колі в даних Jolpica не
    # відрізнити від сходу на 1-му колі; та сама різниця 2 у Ferrari: 1143 проти 1141). Перемоги/подіуми/титули — збіг.
    for ref, exp in {"michael_schumacher": (308, 91, 155, 7), "senna": (161, 41, 80, 3), "prost": (199, 51, 106, 4),
                     "fangio": (51, 24, 35, 5), "clark": (72, 25, 32, 2)}.items():
        got = drv.get(ref)
        check(f"еталон пілота {ref} = {exp}", got is not None and (got[0], got[1], got[2], got[4]) == exp, got)
    champs = sum(1 for v in drv.values() if v[4] > 0)
    titles_sum = sum(v[4] for v in drv.values())
    check("титулів пілотів у списку = титулів у командах", titles_sum == n_dt, (titles_sum, n_dt))
    winners = sum(1 for v in drv.values() if v[1] > 0)
    print(f"INFO  пілотів зі стартом: {len(drv)}; чемпіонів: {champs}; переможців гонок: {winners}")
    for ref in ("hamilton", "max_verstappen", "michael_schumacher", "senna", "fangio", "antonelli"):
        print("INFO  pilot", ref, conn.execute("select starts, wins, podiums, poles, titles, title_years, y0, y1, main_team, current_team, current_number, current_position, current_points from f1.driver_index where id = %s", (ref,)).fetchone())
    # --- Сторінка пілота (0008) ---
    q = lambda sql, *a: conn.execute(sql, a or None).fetchall()
    tot_d = {r[0]: r[1:] for r in q("select id, points, fastest_laps, fastest_laps_known, debut, last_race, first_podium, first_pole, date_of_birth from f1.driver_totals")}
    check("driver_totals — ті самі пілоти, що в списку", set(tot_d) == set(drv), sorted(set(tot_d) ^ set(drv))[:10])
    sums = {r[0]: r[1:] for r in q("select id, sum(races)::int, sum(wins)::int, sum(podiums)::int, sum(poles)::int, count(*)::int, min(year), max(year) from f1.driver_seasons group by id")}
    idx_d = {r[0]: r[1:] for r in q("select id, starts, wins, podiums, poles, seasons, y0, y1 from f1.driver_index")}
    bad = [(k, idx_d[k], sums.get(k)) for k in idx_d if sums.get(k) != idx_d[k]]
    check("сума сезонів пілота = рядок списку (старти, перемоги, подіуми, поули, сезони, роки) — для всіх", not bad, bad[:5])
    wn = dict(q("select id, count(*)::int from f1.driver_wins group by id"))
    bad = [(k, v[1], wn.get(k, 0)) for k, v in idx_d.items() if wn.get(k, 0) != v[1]]
    check("перемог у driver_wins = перемог у списку — для всіх", not bad, bad[:5])
    gaps = q("select id from f1.driver_wins group by id having max(n) <> count(*) or min(n) <> 1")
    check("номери перемог пілота 1..N без пропусків", not gaps, gaps[:5])
    champ_rows = q("select id, array_agg(year order by year) from f1.driver_seasons where champion group by id")
    bad = [(i, y) for i, y in champ_rows if y != conn.execute("select title_years from f1.driver_index where id = %s", (i,)).fetchone()[0]]
    check("чемпіонські сезони пілота = роки титулів у списку", not bad and len(champ_rows) == champs, (bad[:5], len(champ_rows), champs))
    multi = q("select count(*) from f1.driver_seasons where jsonb_array_length(teams) > 1")[0][0]
    bad = q("select id, year from f1.driver_seasons s where (select sum((t->>'races')::int) from jsonb_array_elements(s.teams) t) <> s.races limit 5")
    check("гонки за командами сезону в сумі = гонки сезону", not bad and multi > 0, (bad, multi))
    # Гамілтон і Норріс: місце й очки сезонів (Вікіпедія; завершені сезони — не змінюються).
    ham = {r[0]: (r[1], r[2]) for r in q("select year, position, points from f1.driver_seasons where id = 'hamilton'")}
    exp = {2007: (2, 109), 2008: (1, 98), 2009: (5, 49), 2010: (4, 240), 2011: (5, 227), 2012: (4, 190), 2013: (4, 189),
           2014: (1, 384), 2015: (1, 381), 2016: (2, 380), 2017: (1, 363), 2018: (1, 408), 2019: (1, 413), 2020: (1, 347),
           2021: (2, 387.5), 2022: (6, 240), 2023: (3, 234), 2024: (7, 223)}
    check("Гамілтон 2007–2024: місце й очки кожного сезону", all(ham.get(y) == v for y, v in exp.items()), {y: ham.get(y) for y, v in exp.items() if ham.get(y) != v})
    nor = {r[0]: (r[1], r[2]) for r in q("select year, position, points from f1.driver_seasons where id = 'norris'")}
    exp = {2019: (11, 49), 2020: (9, 97), 2021: (6, 160), 2022: (7, 122), 2023: (6, 205), 2024: (2, 374)}
    check("Норріс 2019–2024: місце й очки кожного сезону", all(nor.get(y) == v for y, v in exp.items()), {y: nor.get(y) for y in exp if nor.get(y) != exp[y]})
    h = tot_d["hamilton"]
    check("Гамілтон: дебют і перший подіум — Австралія 2007 (P3), перший поул — Канада 2007",
          (h[3]["year"], h[3]["name"], h[5]["name"], h[5]["position"], h[6]["year"], h[6]["name"]) ==
          (2007, "Australian Grand Prix", "Australian Grand Prix", 3, 2007, "Canadian Grand Prix"), (h[3], h[5], h[6]))
    w1 = q("select year, name, team, grid from f1.driver_wins where id = 'hamilton' and n = 1")[0]
    check("Гамілтон: перша перемога — Канада 2007, McLaren, з поулу", w1 == (2007, "Canadian Grand Prix", "mclaren", 1), w1)
    # Найшвидші кола: у Jolpica лише з 2004 (замір API 12.11) — повні лише в пілотів, що дебютували не раніше.
    fl_cov = q("""select ro.season_year, count(distinct ro.id) filter (where r.fastest_lap_rank = 1), count(distinct ro.id)
                  from f1.results r join f1.sessions s on s.id = r.session_id and s.type = 'R' join f1.rounds ro on ro.id = s.round_id
                  group by 1 order by 1""")
    fl_year = max([y for y, a, b in fl_cov if a < 0.9 * b and y < cs_year], default=0) + 1
    print("INFO  найшвидші кола — сезони з неповними даними (рік, гонок з колом, гонок):", [(y, a, b) for y, a, b in fl_cov if 0 < a < b], "; перший повний:", fl_year)
    known = sum(1 for v in tot_d.values() if v[2])
    check("найшвидші кола: дані з 2004; Гамілтон і Норріс — відомі, Шумахер і Сенна — ні",
          fl_year == 2004 and h[2] and tot_d["norris"][2] and not tot_d["michael_schumacher"][2] and not tot_d["senna"][2], (fl_year, known))
    bad = [k for k, v in tot_d.items() if not v[2] and conn.execute("select y0 from f1.driver_index where id = %s", (k,)).fetchone()[0] >= fl_year]
    check("…«відомі» = дебют не раніше першого сезону з даними", not bad, bad[:5])
    # Очки за кар'єру — зараховані (Вікіпедія: Сенна 610 (614), Прост 768,5 (798,5), Фанхіо 245 (277 9/14), Кларк 255 (274)).
    for ref, pts in {"senna": 610, "prost": 768.5, "fangio": 245, "clark": 255, "michael_schumacher": 1566}.items():
        check(f"еталон очок {ref} = {pts}", tot_d[ref][0] == pts, tot_d[ref][0])
    # Напарники: симетрія й межі.
    tm = {(r[0], r[1], r[2]): r[3:] for r in q("select id, team, mate, years, races, race_ahead, race_behind, quali_races, quali_ahead, quali_behind from f1.driver_teammates")}
    bad = [k for k, v in tm.items() if (m := tm.get((k[2], k[1], k[0]))) is None
           or (m[1], m[2], m[3], m[4], m[5], m[6]) != (v[1], v[3], v[2], v[4], v[6], v[5]) or m[0] != v[0]]
    check("напарники: кожна пара дзеркальна (A проти B = B проти A)", not bad, bad[:5])
    bad = [k for k, v in tm.items() if v[1] < 5 or v[2] + v[3] > v[1] or v[5] + v[6] > v[4]]
    check("напарники: від 5 спільних гонок; «попереду» ≤ гонок і ≤ кваліфікацій", not bad, bad[:5])
    # Той самий рахунок, що на сторінці команди: пари, які існують лише в поточному сезоні.
    cur_pairs = q("""select a.id, a.driver, b.driver, a.race_ahead, a.quali_ahead, b.quali_ahead from f1.team_pairing a
                     join f1.team_pairing b on b.id = a.id and b.ord = 2 where a.ord = 1""")
    diff = []
    for fam, a, b, ra, qa_, qb_ in cur_pairs:
        row = tm.get((a, fam, b))
        if row is not None and row[0] == [cs_year] and (row[2], row[5], row[6]) != (ra, qa_, qb_):
            diff.append((fam, a, b, (ra, qa_, qb_), (row[2], row[5], row[6])))
    check("пара поточного сезону: сторінка пілота = сторінка команди (гонки й кваліфікації)", not diff, diff[:5])
    # Звірка з макетом Гамілтона (незалежний підрахунок 10.11): гонки й кваліфікації «попереду : позаду».
    for mate, exp in {"alonso": (17, 7, 10, 17, 9, 8), "button": (58, 32, 26, 58, 44, 14)}.items():
        got = tm.get(("hamilton", "mclaren", mate))
        check(f"Гамілтон — {mate}: {exp}", got is not None and tuple(got[1:]) == exp, got)
    sp = tm.get(("senna", "mclaren", "prost"))
    check("Сенна — Прост 1988–1989: кваліфікацій немає в даних (до 1994)", sp is not None and sp[0] == [1988, 1989] and sp[4] == 0, sp)
    print("INFO  кваліфікація 2004 р.1 (QB) і 2005 р.1 (QA/QB) — перші три:", q("""select ro.season_year, s.type, array_agg(d.ref order by r.position) filter (where r.position <= 3)
        from f1.results r join f1.sessions s on s.id = r.session_id and s.type in ('QA','QB') join f1.rounds ro on ro.id = s.round_id
        join f1.drivers d on d.id = r.driver_id where ro.number = 1 and ro.season_year in (2004, 2005) group by 1, 2 order by 1, 2"""))
    print("INFO  2005: етапів з QA / QB:", q("select s.type, count(distinct ro.id) from f1.sessions s join f1.rounds ro on ro.id = s.round_id join f1.results r on r.session_id = s.id where ro.season_year = 2005 and s.type in ('QA','QB') group by 1"))
    print("INFO  залік з adjustment_type 101:", q("select ds.season_year, d.ref, ds.position, ds.points from f1.driver_standings ds join f1.drivers d on d.id = ds.driver_id where ds.adjustment_type = 101 order by 1, 3 limit 20"))
    print("INFO  Шумахер–Баррікелло / Ірвайн:", [(k[1], k[2], v) for k, v in tm.items() if k[0] == "michael_schumacher" and k[2] in ("barrichello", "irvine")])
    hr = tm.get(("hamilton", "mercedes", "rosberg"))
    check("Гамілтон — Росберг: Mercedes 2013–2016, 78 спільних гонок", hr is not None and hr[0] == [2013, 2014, 2015, 2016] and hr[1] == 78, hr)
    per = q("select count(*), max(n), percentile_disc(0.5) within group (order by n), percentile_disc(0.9) within group (order by n) from (select id, count(*) n from f1.driver_teammates group by id) x")[0]
    print(f"INFO  напарники: рядків {len(tm)}; пілотів з напарниками / макс. / медіана / p90 = {per}; без напарників: {len(drv) - per[0]}")
    print("INFO  кваліфікації (Q1–Q3) — сезони з даними:", q("select min(ro.season_year), max(ro.season_year), count(distinct ro.season_year) from f1.sessions s join f1.rounds ro on ro.id = s.round_id join f1.results r on r.session_id = s.id where s.type in ('Q1','Q2','Q3')")[0])
    print("INFO  типи сесій з результатами (тип, роки, рядків):", q("select s.type, min(ro.season_year), max(ro.season_year), count(*) from f1.sessions s join f1.rounds ro on ro.id = s.round_id join f1.results r on r.session_id = s.id group by s.type order by 2, 1"))
    print("INFO  пари без повних кваліфікацій (quali_races < races) / усього:", sum(1 for v in tm.values() if v[4] < v[1]), "/", len(tm), "; з них quali_races > 0:", sum(1 for v in tm.values() if 0 < v[4] < v[1]))
    print("INFO  коригування заліку пілотів (adjustment_type, eligible, к-сть):", q("select adjustment_type, is_eligible, count(*) from f1.driver_standings group by 1, 2 order by 1, 2"))
    ms97 = q("select position, points, excluded, champion from f1.driver_seasons where id = 'michael_schumacher' and year = 1997")
    check("Шумахер 1997 — виключений з заліку: без місця, 78 очок збережено", ms97 == [(None, 78.0, True, False)], ms97)
    n_excl = q("select count(*) from f1.driver_seasons where excluded")[0][0]
    check("виключень пілотів з заліку — одне", n_excl == 1, n_excl)
    print("INFO  сезони без запису в заліку:", q("select count(*) from f1.driver_seasons where points is null")[0][0], "; приклади:", q("select id, year from f1.driver_seasons where points is null order by year desc limit 5"))
    print("INFO  номери: сезонів з > 3 номерами:", q("select count(*) from f1.driver_seasons where cardinality(numbers) > 3")[0][0], "; сезонів без номера:", q("select count(*) from f1.driver_seasons where cardinality(numbers) = 0")[0][0])
    print("INFO  без дати народження:", sum(1 for v in tot_d.values() if v[7] is None), "; найшвидші кола відомі в", known, "пілотів")
    for ref in ("hamilton", "norris", "michael_schumacher", "senna", "prost", "fangio", "clark", "max_verstappen"):
        v = tot_d[ref]
        print(f"INFO  підсумки {ref}: очки {v[0]}, найшв. кола {v[1]} (відомі: {v[2]}), дебют {v[3]['year']} {v[3]['name']}, остання {v[4]['year']} {v[4]['name']}")
    for a, b in (("hamilton", "alonso"), ("hamilton", "button"), ("hamilton", "bottas"), ("norris", "sainz"), ("norris", "piastri"), ("senna", "prost"), ("fangio", "moss")):
        print(f"INFO  напарники {a}–{b}:", [(k[1], v) for k, v in tm.items() if k[0] == a and k[2] == b])
    print("INFO  розмір подань пілота:", q("select relname, pg_size_pretty(pg_total_relation_size(c.oid)) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'f1' and relname like 'driver\\_%' and relkind = 'm' order by 1"))
    # --- Правило старту (0009): status = 30 «не стартував» — не старт ---
    dns = q("""select count(*) from f1.v_driver_round v join f1.results r on r.driver_id = v.driver_id
               join f1.sessions s on s.id = r.session_id and s.type = 'R' and s.round_id = v.round_id
               where r.status = 30 and not exists (select 1 from f1.results r2 join f1.sessions s2 on s2.id = r2.session_id and s2.type = 'R'
                 where s2.round_id = v.round_id and r2.driver_id = v.driver_id and coalesce(r2.status, 0) <> 30)""")[0][0]
    check("жодна гонка пілота не тримається лише на заявці «не стартував»", dns == 0, dns)
    mar = q("select i.starts, t.last_race->>'name', (t.last_race->>'year')::int from f1.driver_index i join f1.driver_totals t on t.id = i.id where i.id = 'marimon'")
    check("Марімон: 11 стартів (Вікіпедія), остання гонка — Гран-прі Великої Британії 1954", mar == [(11, "British Grand Prix", 1954)], mar)
    print("INFO  START заявки status=30, які раніше рахувались стартом — за пілотами (топ):", q("""select d.ref, count(*) from f1.results r
        join f1.sessions s on s.id = r.session_id and s.type = 'R' join f1.drivers d on d.id = r.driver_id
        where r.status = 30 and f1.result_started(r.detail, r.position, r.laps_completed, r.grid) group by 1 order by 2 desc, 1 limit 70"""))
    print("INFO  START еталони після зміни:", {k: (idx[k]["gp"], idx[k]["w"], idx[k]["t"]) for k in reference},
          {k: drv.get(k) for k in ("michael_schumacher", "senna", "prost", "fangio", "clark", "hamilton")})
    print("INFO  START пілотів зі стартом:", len(drv), "; команд:", len(idx))
    # Довідкові числа для звірки з Вікіпедією (docs/decisions.md) — друк, не перевірка.
    for k in ("mclaren", "ferrari", "williams", "brabham", "lotus", "mercedes", "red-bull", "tyrrell"):
        ch = conn.execute("select driver, years from f1.team_champions where id = %s order by years[1]", (k,)).fetchall()
        print(f"INFO  {k}: GP/W/pod/pole/1-2/КК/ТП = {tot.get(k)}; чемпіони {[(d, y) for d, y in ch]}")
    print("INFO  McLaren пара:", pair)
    print(f"Lotus: {lotus['gp']} Гран-прі; Lotus Racing: {racing['gp']}; site_meta {meta}")

sys.exit(1 if failed else 0)
