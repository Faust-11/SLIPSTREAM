"""Знімок даних розділу «Команди» з локальних даних макетів Slipstream.

Запуск (з кореня репозиторію):  python3 -I scripts/snapshot/teams.py ~/Desktop/F1/data
Пише:  src/data/snapshot/teams.json, public/img/cars/<id>.jpg (480×300), public/img/drivers/<id>.jpg (112×112).

Логіка повторює генератор макета (~/Desktop/F1/data/teams_cards/build_teams.py), щоб сторінка
показувала ті самі числа, що й затверджений макет. Тимчасово до фази 2 (база `f1` у Supabase).
"""
import ast
import html
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

if len(sys.argv) != 2:
    sys.exit("usage: python3 -I scripts/snapshot/teams.py <data-dir>")
SRC = Path(sys.argv[1]).expanduser().resolve()
REPO = Path(__file__).resolve().parents[2]
OUT_JSON = REPO / "src/data/snapshot/teams.json"
CARS = REPO / "public/img/cars"
DRIVERS = REPO / "public/img/drivers"

# --- константи з build_teams.py (джерело правди — затверджений макет) ---
TSHORT = {"RB F1 Team": "Racing Bulls", "Alpine F1 Team": "Alpine", "Haas F1 Team": "Haas", "Cadillac F1 Team": "Cadillac"}
TCOL = {"McLaren": "#FF8000", "Red Bull": "#1B2B6B", "Mercedes": "#27D9C2", "Ferrari": "#E8002D", "Racing Bulls": "#6692FF",
        "Audi": "#8C9096", "Aston Martin": "#1E8A63", "Williams": "#1868DB", "Alpine": "#FF87BC", "Haas": "#9EA3AA", "Cadillac": "#5C5F66"}
CC = {"GBR": ("Велика Британія", "United Kingdom"), "USA": ("США", "United States"), "ITA": ("Італія", "Italy"),
      "FRA": ("Франція", "France"), "DEU": ("Німеччина", "Germany"), "JPN": ("Японія", "Japan"), "CHE": ("Швейцарія", "Switzerland"),
      "NLD": ("Нідерланди", "Netherlands"), "CAN": ("Канада", "Canada"), "RUS": ("Росія", "Russia"), "BEL": ("Бельгія", "Belgium"),
      "ZAF": ("ПАР", "South Africa"), "NZL": ("Нова Зеландія", "New Zealand"), "BRA": ("Бразилія", "Brazil"), "HKG": ("Гонконг", "Hong Kong"),
      "MEX": ("Мексика", "Mexico"), "IRL": ("Ірландія", "Ireland"), "AUT": ("Австрія", "Austria"), "IND": ("Індія", "India"),
      "ESP": ("Іспанія", "Spain"), "MYS": ("Малайзія", "Malaysia")}
# У метаданих Commons немає поля Artist — автора взято з опису файлу (як у макеті).
ART_FIX = {"Veritas": "Lothar Spurzem", "BRM": "Lothar Spurzem", "Brabham": "Gerald Swan", "BAR": "Dan Smith"}


def load(rel):
    with open(SRC / rel, encoding="utf-8") as f:
        return json.load(f)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def uk_names():
    """Українські імена пілотів з генераторів макетів — ast.literal_eval, без виконання коду."""
    names = {}
    for rel in ("season_mockup/build_season.py", "team_mockup/build_team.py", "circuit_mockup/build_circuit.py", "newbie_mockup/build_newbie.py"):
        m = re.search(r"^UKN = (\{.*?\})\n", (SRC / rel).read_text(encoding="utf-8"), re.S | re.M)
        assert m, f"UKN не знайдено в {rel}"
        for k, v in ast.literal_eval(m.group(1)).items():
            names.setdefault(k, " ".join(v) if isinstance(v, tuple) else v)
    m = re.search(r"^UKN\.update\((\{.*?\})\)\n", (SRC / "index_mockup/build_index.py").read_text(encoding="utf-8"), re.S | re.M)
    assert m, "UKN.update не знайдено в build_index.py"
    names.update(ast.literal_eval(m.group(1)))
    return names


def main():
    idx = load("index_mockup/index_data.json")
    years = load("teams_cards/data/team_years.json")
    pick = load("teams_cards/data/car_pick.json")
    avatars = load("avatars.json")
    race = load("newbie_mockup/saopaulo2026_results.json")["MRData"]["RaceTable"]["Races"][0]
    ukn = uk_names()
    en_names = idx["driver_names"]

    standings = {TSHORT.get(t["name"], t["name"]): t for t in idx["cur_teams"]}
    in_standings = {d["ref"] for d in idx["cur_drivers"]}
    crew = {}
    for r in race["Results"]:
        ref, team = r["Driver"]["driverId"], r["Constructor"]["name"]
        if ref in in_standings:
            crew.setdefault(TSHORT.get(team, team), []).append(ref)

    for d in (CARS, DRIVERS):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)

    teams, avatar_credits = [], {}
    for t in sorted(idx["teams"], key=lambda t: (-t["w"], -t["gp"])):
        full = t["name"]
        short: str = TSHORT.get(full) or full
        tid = slug(short)
        uk_c, en_c = CC[t["cc"]]
        photo = None
        p = pick.get(full)
        src_img = SRC / "teams_cards/img/c" / f"{slug(full)}.jpg"
        if p and src_img.exists():
            with Image.open(src_img) as im:
                assert im.size == (480, 300), (full, im.size)
            shutil.copyfile(src_img, CARS / f"{tid}.jpg")
            author = ART_FIX.get(full) or html.unescape(p.get("artist") or "").strip() or "Unknown"
            photo = {"src": f"/img/cars/{tid}.jpg", "width": 480, "height": 300,
                     "credit": {"page": p["page"], "author": author, "license": p["lic"]}}
        current = None
        if short in standings:
            drivers = []
            for ref in crew.get(short, []):
                en = en_names.get(ref, ref)
                uk = ukn.get(ref, en)
                av = avatars.get(ref)
                avatar = None
                if av and not av.get("wide") and (SRC / "driver_photos" / f"{ref}.jpg").exists():
                    with Image.open(SRC / "driver_photos" / f"{ref}.jpg") as im:
                        im = im.convert("RGB")
                        w, h = im.size
                        side = min(w, h)
                        top = 0 if h <= w else int((h - side) * 0.12)
                        left = (w - side) // 2
                        im.crop((left, top, left + side, top + side)).resize((112, 112), Image.Resampling.LANCZOS).save(DRIVERS / f"{ref}.jpg", quality=82)
                    avatar = f"/img/drivers/{ref}.jpg"
                    avatar_credits[ref] = {"page": av["page"], "author": html.unescape(av.get("artist") or "").strip() or "Unknown", "license": av["lic"]}
                drivers.append({"id": ref, "name": {"en": en, "uk": uk}, "surname": {"en": en.split()[-1], "uk": uk.split()[-1]},
                                "initials": "".join(w[0] for w in en.split()[:2]).upper(), "avatar": avatar})
            current = {"position": standings[short]["pos"], "color": TCOL[short], "drivers": drivers}
        teams.append({"id": tid, "name": short, "country": {"en": en_c, "uk": uk_c}, "countryCode": t["cc"], "seasons": years[full],
                      "grandsPrix": t["gp"], "wins": t["w"], "titles": t["t"], "current": current, "photo": photo})

    ids = [t["id"] for t in teams]
    assert len(ids) == len(set(ids)), "дублікати id"
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    out = {"asOf": race["date"], "teams": teams, "avatarCredits": dict(sorted(avatar_credits.items()))}
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("teams", len(teams), "photos", sum(1 for t in teams if t["photo"]), "current", sum(1 for t in teams if t["current"]),
          "avatars", len(avatar_credits), "asOf", race["date"])


main()
