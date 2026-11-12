#!/usr/bin/env python3
"""Перевірка даних після синхронізації (бойова база): числа, що вже не змінюються, і цілісність.

    DATABASE_URL=… python3 scripts/db/check_live.py             # перевірити опубліковані подання
    DATABASE_URL=… python3 scripts/db/check_live.py --publish   # оновити подання й опублікувати лише після перевірки

Сайт читає лише подання f1.team_index і f1.site_meta (+ імена пілотів з f1.drivers, їх не очищують).
--publish: в одній транзакції f1.refresh_derived() → перевірки → commit; будь-який FAIL — rollback, і подання
лишаються такими, як після останньої вдалої синхронізації. Так сайт не бачить проміжного стану: load_dump очищає
дані сесій (разом із доливкою останніх гонок), і якщо доливка чи перевірка впаде, будь-яка збірка Vercel у цьому
вікні запекла б відкат на ~2 тижні. data-sync.yml для цього задає F1_DEFER_REFRESH=1 завантажувачам.

Еталони — лише команди, яких більше немає в чемпіонаті (числа діючих змінюються щогонки).
Код виходу 1 — перезбірку сайту не запускаємо (data-sync.yml).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg

REPO = Path(__file__).resolve().parents[2]
HISTORIC = {"alfa-romeo": (216, 10, 0), "vanwall": (28, 9, 1), "tyrrell": (430, 23, 1), "brm": (197, 17, 1),
            "andrea-moda": (1, 0, 0), "brabham": (393, 35, 2)}
# Той самий запит, що в seed_curated.py --strict, але ПІСЛЯ доливки: нового учасника з API (ensure_team у
# topup_api.py) team_index мовчки відкинув би — curated його теж не має, тож порівняння нижче його не помітить.
UNMAPPED = """
    select distinct t.ref from f1.results r
    join f1.sessions s on s.id = r.session_id and s.type = 'R'
    join f1.rounds ro on ro.id = s.round_id
    join f1.teams t on t.id = r.team_id
    left join f1.team_families tf on tf.ref = t.ref and ro.season_year between tf.from_year and tf.to_year
    where tf.ref is null and f1.result_started(r.detail, r.position, r.laps_completed, r.grid, r.status)
    order by 1
"""

failed = 0


def check(label: str, ok: bool, detail: object = "") -> None:
    global failed
    failed += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f" — {detail}"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--publish", action="store_true", help="оновити подання в транзакції; commit лише якщо всі PASS")
    args = ap.parse_args()
    dsn = os.environ.get("DATABASE_URL") or sys.exit("DATABASE_URL не задано")
    with psycopg.connect(dsn) as conn:
        before = conn.execute("select current_season, last_round from f1.site_meta").fetchone()
        if args.publish:
            conn.execute("set local lock_timeout = '10s'")
            conn.execute("select f1.refresh_derived()")
        rows = {r[0]: r[1:] for r in conn.execute("select id, grands_prix, wins, titles, current_position from f1.team_index")}
        curated = {t["id"] for t in json.loads((REPO / "src/data/curated/teams.json").read_text(encoding="utf-8"))["teams"]}
        check("усі кураторські команди в базі", set(rows) == curated, sorted(set(rows) ^ curated))
        for team_id, exp in HISTORIC.items():
            check(f"еталон {team_id} = {exp}", rows.get(team_id, (None,))[:3] == exp, rows.get(team_id))
        positions = sorted(r[3] for r in rows.values() if r[3] is not None)
        check("місця поточного сезону — 1..N без пропусків",
              positions == list(range(1, len(positions) + 1)) and len(positions) >= 10, positions)
        unmapped = [r[0] for r in conn.execute(UNMAPPED)]
        check("кожен конструктор зі стартами віднесений до команди (curated/teams.json)", not unmapped, unmapped)
        meta = conn.execute("select current_season, last_round from f1.site_meta").fetchall()
        check("site_meta — один рядок", len(meta) == 1, meta)
        if before and len(meta) == 1:
            check(f"останній етап не відкотився назад (було {before[0]}/{before[1]})", tuple(meta[0]) >= tuple(before),
                  f"стало {meta[0][0]}/{meta[0][1]} — доливка після нового дампу не відпрацювала?")
        if args.publish:
            if failed:
                conn.rollback()
                print("ROLLBACK  подання не оновлено — на сайті лишаються дані останньої вдалої синхронізації")
            else:
                conn.commit()
                print(f"COMMIT  подання опубліковано: {meta[0][0]}/{meta[0][1]}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
