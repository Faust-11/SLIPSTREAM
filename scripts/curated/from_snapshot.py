"""Одноразово (фаза 2): кураторські дані команд і пілотів зі знімка фази 3a.

    python3 -I scripts/curated/from_snapshot.py

Пише src/data/curated/teams.json і src/data/curated/drivers.json. Далі це джерело правди для нашого
контенту (назви, кирилиця, країни, фото й автори, кольори, злиття конструкторів Jolpica у команди);
числа (Гран-прі, перемоги, Кубки, роки, місце, склад) — з бази (f1.team_index). Знімок
src/data/snapshot/teams.json лишається фікстурою тестів паритету.

Рішення користувача 11.11: Lotus Racing 2010–2011 (`lotus_racing`) — окрема команда від Lotus 1958–1994.
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
snap = json.loads((REPO / "src/data/snapshot/teams.json").read_text(encoding="utf-8"))

teams = []
drivers = {}
for t in snap["teams"]:
    refs = sorted(t["refs"])
    if t["id"] == "lotus":
        refs = [r for r in refs if r != "lotus_racing"]
    entry = {
        "id": t["id"],
        "name": t["name"],
        "fullName": t["fullName"],
        "aliases": t["aliases"],
        "countryCode": t["countryCode"],
        "country": t["country"],
        "refs": refs,
        "color": t["current"]["color"] if t["current"] else None,
        "photo": t["photo"],
    }
    teams.append(entry)
    for d in (t["current"] or {}).get("drivers", []):
        credit = snap["avatarCredits"].get(d["id"])
        drivers[d["id"]] = {
            "name": d["name"],
            "surname": d["surname"],
            "initials": d["initials"],
            "avatar": d["avatar"],
            "credit": credit,
        }

# Lotus Racing (2010–2011, згодом Caterham) — окремо; ліцензія Малайзії (Jolpica: country_code MYS).
teams.append({
    "id": "lotus-racing",
    "name": "Lotus Racing",
    "fullName": "Lotus",
    "aliases": ["Лотус Рейсінг", "Лотус"],
    "countryCode": "MYS",
    "country": {"en": "Malaysia", "uk": "Малайзія"},
    "refs": ["lotus_racing"],
    "color": None,
    "photo": None,
})

refs = [r for t in teams for r in t["refs"]]
assert len(refs) == len(set(refs)), "ref Jolpica у двох командах"
ids = [t["id"] for t in teams]
assert len(ids) == len(set(ids)), "дублікати id"

out = REPO / "src/data/curated"
out.mkdir(parents=True, exist_ok=True)
(out / "teams.json").write_text(json.dumps({"teams": teams}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
(out / "drivers.json").write_text(json.dumps({"drivers": dict(sorted(drivers.items()))}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print("teams", len(teams), "refs", len(refs), "drivers", len(drivers))
