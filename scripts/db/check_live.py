#!/usr/bin/env python3
"""Перевірка даних після синхронізації (бойова база): числа, що вже не змінюються, і цілісність.

    DATABASE_URL=… python3 scripts/db/check_live.py

Еталони — лише команди, яких більше немає в чемпіонаті (числа діючих змінюються щогонки).
Код виходу 1 — перезбірку сайту не запускаємо (data-sync.yml).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import psycopg

DSN = os.environ.get("DATABASE_URL") or sys.exit("DATABASE_URL не задано")
REPO = Path(__file__).resolve().parents[2]
HISTORIC = {"alfa-romeo": (216, 10, 0), "vanwall": (28, 9, 1), "tyrrell": (430, 23, 1), "brm": (197, 17, 1),
            "andrea-moda": (1, 0, 0), "brabham": (393, 35, 2)}

failed = 0


def check(label: str, ok: bool, detail: object = "") -> None:
    global failed
    failed += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f" — {detail}"))


with psycopg.connect(DSN) as conn:
    rows = {r[0]: r[1:] for r in conn.execute("select id, grands_prix, wins, titles, current_position from f1.team_index")}
    curated = {t["id"] for t in json.loads((REPO / "src/data/curated/teams.json").read_text(encoding="utf-8"))["teams"]}
    check("усі кураторські команди в базі", set(rows) == curated, sorted(set(rows) ^ curated))
    for team_id, exp in HISTORIC.items():
        check(f"еталон {team_id} = {exp}", rows.get(team_id, (None,))[:3] == exp, rows.get(team_id))
    positions = sorted(r[3] for r in rows.values() if r[3] is not None)
    check("місця поточного сезону — 1..N без пропусків", positions == list(range(1, len(positions) + 1)) and len(positions) >= 10, positions)
    meta = conn.execute("select current_season, last_round from f1.site_meta").fetchall()
    check("site_meta — один рядок", len(meta) == 1, meta)

sys.exit(1 if failed else 0)
