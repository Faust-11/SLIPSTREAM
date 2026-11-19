"""Знімок даних розділу «Команди» з локальних даних макетів Outlap.

Запуск (з кореня репозиторію):  python3 -I scripts/snapshot/teams.py ~/Desktop/F1/data
Пише:  src/data/snapshot/teams.json, public/img/cars/<id>-256.webp і <id>-480.webp (16:10),
       public/img/drivers/<id>-96.webp (96×96). Готові WebP замість next/image: без оптимізації на сервері
       при кожному запиті (Lighthouse CI: 163 мс на фото LCP) і без витрати ліміту перетворень Vercel Hobby.

Логіка повторює генератор макета (~/Desktop/F1/data/teams_cards/build_teams.py), щоб сторінка
показувала ті самі числа, що й затверджений макет. Тимчасово до фази 2 (база `f1` у Supabase).
"""
import ast
import collections
import csv
import html
import json
import re
import shutil
import sys
import tempfile
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
# У метаданих Commons немає поля Artist — автора взято з опису файлу (як у макеті); решта — замість
# URL Flickr / службового тексту ім'я автора зі сторінки Commons (FlickreviewR, рев'ю Task 2, 11.11).
ART_FIX = {"Veritas": "Lothar Spurzem", "BRM": "Lothar Spurzem", "Brabham": "Gerald Swan", "BAR": "Dan Smith",
           "Racing Point": "Renzopaso", "AGS": "taka_suzuki", "Scarab": "Dave Hamster",
           "Fittipaldi": "Paulo Carmona Sanches Neto (кадрування: Morio)", "Iso Marlboro": "Hans Peters / Anefo",
           "Rial": "Der Alf (похідна робота: Danyele)"}
AVATAR_ART_FIX = {"norris": "Steffen Prößdorf"}
# Фото іншої машини (рев'ю Task 2, 11.11, перевірено переглядом): краще без фото, ніж хибне.
#   Dallara — болід A1GP (Бруно Сенна, 2006); Theodore — Ralt RT3 F3 (Макао-1983);
#   Politoys — Brabham BT26 (1969); BRP — BRM P25 (BRP виступала на ньому як на BRM, а не на шасі BRP).
WRONG_PHOTO = {"Dallara", "Theodore", "Politoys", "BRP"}
REF_RE = re.compile(r"^[a-z0-9_]+$")
# Назви кирилицею — лише для пошуку (на сторінці назви команд не перекладаються): українська
# (як у Вікіпедії) і поширена російська, якщо відрізняється. Решта команд — транслітерацією запиту.
CYRILLIC_ALIASES = {
    "Ferrari": ["Феррарі", "Феррари"], "McLaren": ["Макларен"], "Mercedes": ["Мерседес"], "Red Bull": ["Ред Булл"],
    "Williams": ["Вільямс", "Уільямс", "Уильямс"], "Lotus": ["Лотус"], "Renault": ["Рено"], "Brabham": ["Брабем", "Брэбем"],
    "Benetton": ["Бенеттон"], "Tyrrell": ["Тіррелл", "Тиррелл"], "BRM": ["БРМ"], "Cooper": ["Купер"],
    "Alfa Romeo": ["Альфа Ромео"], "Ligier": ["Ліжьє", "Лижье"], "Maserati": ["Мазераті", "Мазерати"], "Matra": ["Матра"],
    "Vanwall": ["Венволл", "Вэнуолл"], "Brawn": ["Браун"], "Jordan": ["Джордан"], "March": ["Марч"], "Honda": ["Хонда"],
    "Alpine": ["Альпін", "Альпин"], "Haas": ["Хаас"], "Aston Martin": ["Астон Мартін", "Астон Мартин"],
    "Racing Bulls": ["Рейсінг Буллз", "Рейсинг Буллз"], "Audi": ["Ауді", "Ауди"], "Cadillac": ["Каділлак", "Кадиллак"],
    "Sauber": ["Заубер"], "Toyota": ["Тойота"], "Minardi": ["Мінарді", "Минарди"], "Jaguar": ["Ягуар"],
    "Stewart": ["Стюарт"], "Force India": ["Форс Індія", "Форс Индия"], "Toro Rosso": ["Торо Россо"],
    "AlphaTauri": ["Альфа Таурі", "Альфа Таури"], "Racing Point": ["Рейсінг Пойнт", "Рейсинг Пойнт"],
}
NOSTART = re.compile(r"did not (start|qualify|pre)|withdr|not classified.*dns|^dn[sq]", re.I)


def load(rel):
    with open(SRC / rel, encoding="utf-8") as f:
        return json.load(f)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def fam(name):
    """Родина шасі, як у compute_index.py макета: «McLaren-Ford» → «McLaren» (у Jolpica пари шасі-двигун — окремі конструктори)."""
    n = {"Team Lotus": "Lotus"}.get(name, name)
    return n.split("-")[0].strip() if "-" in n and n not in ("Mercedes-Benz",) else n


def dump_corrections():
    """Виправлення лічильників index_data.json за CSV-дампом Jolpica (рев'ю Task 2, 11.11):
    - перемоги — за гонками, а не за заявками: у 1950-х перемогу спільної машини записано двом пілотам;
    - «Гран-прі» — без гонок, де жодна машина команди не стартувала (grid 0 і 0 кіл: аварія на тренуванні,
      виключення до старту, зняття), хоча евристика макета зарахувала їх як старт;
    - refs — усі конструктори Jolpica, злиті в родину (для контракт-тесту фази 2).
    Гонки 2026 після дампу (з API) макет уже фільтрує за статусом — їх це не стосується."""
    d = SRC / "jolpica_dump_raw/csv/formula_one_"
    rd = lambda n: list(csv.DictReader(open(f"{d}{n}.csv", encoding="utf-8")))
    teams = {r["id"]: r for r in rd("team")}
    seasons = {r["id"]: int(r["year"]) for r in rd("season")}
    rounds = {r["id"]: r for r in rd("round")}
    td = {r["id"]: r for r in rd("teamdriver")}
    rentry = {r["id"]: r for r in rd("roundentry")}
    races = {r["id"] for r in rd("session") if r["type"] == "R" and r["is_cancelled"] == "f"}
    starts = collections.defaultdict(lambda: collections.defaultdict(list))
    winners = collections.defaultdict(collections.Counter)
    for e in rd("sessionentry"):
        if e["session_id"] not in races:
            continue
        ren = rentry[e["round_entry_id"]]
        rnd = rounds[ren["round_id"]]
        f = fam(teams[td[ren["team_driver_id"]]["team_id"]]["name"])
        if NOSTART.search(e["detail"] or "") or (e["laps_completed"] in ("", None) and e["position"] == ""):
            continue  # макет теж не рахує
        key = (seasons[rnd["season_id"]], rnd["number"])
        starts[f][key].append(e["grid"] in ("", "0") and e["laps_completed"] in ("", "0"))
        if e["is_classified"] == "t" and e["position"] == "1":
            winners[f][key] += 1
    phantom = collections.Counter({f: sum(all(v) for v in rs.values()) for f, rs in starts.items()})
    dup_wins = collections.Counter({f: sum(n - 1 for n in c.values() if n > 1) for f, c in winners.items()})
    refs = collections.defaultdict(set)
    for t in teams.values():
        refs[fam(t["name"])].add(t["reference"])
    return phantom, dup_wins, refs


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
    assert idx["round"] == int(race["round"]), f"index_data — етап {idx['round']}, результати — етап {race['round']}"
    phantom, dup_wins, refs = dump_corrections()

    standings = {TSHORT.get(t["name"], t["name"]): t for t in idx["cur_teams"]}
    # Склад — пілоти останньої гонки; порядок — за місцем у заліку пілотів (як у макеті).
    standing = {d["ref"]: d["pos"] for d in idx["cur_drivers"]}
    crew = {}
    for r in race["Results"]:
        ref, team = r["Driver"]["driverId"], r["Constructor"]["name"]
        assert REF_RE.match(ref), ref
        if ref in standing:
            crew.setdefault(TSHORT.get(team, team), []).append(ref)
    for refs_ in crew.values():
        refs_.sort(key=lambda r: standing[r])

    # Пишемо в тимчасову теку й замінюємо лише після успіху: збій не лишає public/img порожнім.
    (REPO / "public/img").mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="teams-snapshot-", dir=REPO / "public"))
    tmp_cars, tmp_drivers = tmp / "cars", tmp / "drivers"
    tmp_cars.mkdir()
    tmp_drivers.mkdir()

    teams, avatar_credits = [], {}
    for t in sorted(idx["teams"], key=lambda t: (-t["w"], -t["gp"])):
        full = t["name"]
        short: str = TSHORT.get(full) or full
        tid = slug(short)
        uk_c, en_c = CC[t["cc"]]
        photo = None
        p = pick.get(full)
        src_img = SRC / "teams_cards/img/c" / f"{slug(full)}.jpg"
        if p and src_img.exists() and short not in WRONG_PHOTO:
            with Image.open(src_img) as im:
                assert im.size == (480, 300), (full, im.size)
                im = im.convert("RGB")
                for w in (256, 480):
                    (im if w == 480 else im.resize((w, w * 300 // 480), Image.Resampling.LANCZOS)).save(
                        tmp_cars / f"{tid}-{w}.webp", "WEBP", quality=78, method=6)
            author = ART_FIX.get(full) or html.unescape(p.get("artist") or "").strip() or "Unknown"
            photo = {"src": f"/img/cars/{tid}-480.webp",
                     "srcSet": f"/img/cars/{tid}-256.webp 256w, /img/cars/{tid}-480.webp 480w", "width": 480, "height": 300,
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
                        im.crop((left, top, left + side, top + side)).resize((96, 96), Image.Resampling.LANCZOS).save(tmp_drivers / f"{ref}-96.webp", "WEBP", quality=80, method=6)
                    avatar = f"/img/drivers/{ref}-96.webp"
                    author = AVATAR_ART_FIX.get(ref) or html.unescape(av.get("artist") or "").strip() or "Unknown"
                    avatar_credits[ref] = {"page": av["page"], "author": author, "license": av["lic"]}
                drivers.append({"id": ref, "name": {"en": en, "uk": uk}, "surname": {"en": en.split()[-1], "uk": uk.split()[-1]},
                                "initials": "".join(w[0] for w in en.split()[:2]).upper(), "avatar": avatar})
            current = {"position": standings[short]["pos"], "color": TCOL[short], "drivers": drivers}
        teams.append({"id": tid, "name": short, "fullName": full, "aliases": CYRILLIC_ALIASES.get(short, []), "country": {"en": en_c, "uk": uk_c}, "countryCode": t["cc"], "seasons": years[full],
                      "grandsPrix": t["gp"] - phantom[full], "wins": t["w"] - dup_wins[full], "titles": t["t"],
                      "refs": sorted(refs[full]), "current": current, "photo": photo})

    # Порядок макета (перемоги ↓, Гран-прі ↓) — за виправленими числами; рівність — як у макеті (стабільне сортування).
    teams.sort(key=lambda t: (-t["wins"], -t["grandsPrix"]))
    ids = [t["id"] for t in teams]
    assert len(ids) == len(set(ids)), "дублікати id"
    unknown_alias = set(CYRILLIC_ALIASES) - {t["name"] for t in teams}
    assert not unknown_alias, f"псевдоніми для неіснуючих команд: {unknown_alias}"
    unknown = [t["name"] for t in teams if t["photo"] and t["photo"]["credit"]["author"] == "Unknown"]
    assert not unknown, f"автор невідомий: {unknown}"
    # Заміна: боліди — тека цілком (лише цей скрипт); аватари — лише свої файли (тека спільна з іншими сторінками).
    if CARS.exists():
        shutil.rmtree(CARS)
    tmp_cars.rename(CARS)
    DRIVERS.mkdir(parents=True, exist_ok=True)
    for f in tmp_drivers.iterdir():
        f.replace(DRIVERS / f.name)
    shutil.rmtree(tmp)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    out = {"asOf": race["date"], "teams": teams, "avatarCredits": dict(sorted(avatar_credits.items()))}
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("teams", len(teams), "photos", sum(1 for t in teams if t["photo"]), "current", sum(1 for t in teams if t["current"]),
          "avatars", len(avatar_credits), "asOf", race["date"])


main()
