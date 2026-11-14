#!/usr/bin/env python3
"""Хайлайти гонок з офіційного YouTube-каналу FORMULA 1 → src/data/curated/race-videos.json (запит користувача 14.11).

    python3 scripts/curated/race_videos.py [--years 2024 2025 2026]

Пошук по каналу через yt-dlp (без ключа API; встановлення — пам'ять reference-video-tools-macos12-oct-2026). Беремо лише
назви «Race Highlights | <рік> <назва Гран-прі>» і зіставляємо з етапами (e2e/fixtures/db/season_rounds.json — назва ГП
без діакритики й регістру). Кожне відео перевіряється oEmbed (200 — вбудовування дозволене; 401 — заборонене, не беремо).
Нові гонки сезону — перезапуск скрипта після гонки. Звіт: етапи без відео й відео без етапу.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ROUNDS = REPO / "e2e/fixtures/db/season_rounds.json"
OUT = REPO / "src/data/curated/race-videos.json"
CHANNEL = "https://www.youtube.com/@Formula1"
TITLE = re.compile(r"^Race Highlights \| (\d{4}) (.+)$")
ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
# Назва на YouTube ≠ назва Jolpica (замір 14.11): «Sao Paulo» ↔ «Brazilian», «Barcelona-Catalunya» ↔ «Barcelona».
ALIASES = {"sao paulo grand prix": "brazilian grand prix", "barcelona catalunya grand prix": "barcelona grand prix"}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def search(year: int, extra: str = "") -> list[tuple[str, str]]:
    url = f"{CHANNEL}/search?query={urllib.parse.quote(f'Race Highlights {year} {extra}'.strip())}"
    out = subprocess.run(["yt-dlp", "--flat-playlist", "--print", "%(id)s\t%(title)s", url], capture_output=True, text=True, check=True).stdout
    return [tuple(line.split("\t", 1)) for line in out.splitlines() if "\t" in line]  # type: ignore[misc]


def embeddable(vid: str) -> bool:
    q = urllib.parse.urlencode({"url": f"https://www.youtube.com/watch?v={vid}", "format": "json"})
    try:
        with urllib.request.urlopen(f"https://www.youtube.com/oembed?{q}", timeout=20) as r:
            return r.status == 200 and json.load(r).get("author_name") == "FORMULA 1"
    except urllib.error.HTTPError:
        return False


def has_maxres(vid: str) -> bool:
    """Превʼю 1280 px (maxresdefault) є не завжди — без нього YouTube віддає 404 (замір 14.11: є в 68 з 68)."""
    req = urllib.request.Request(f"https://i.ytimg.com/vi/{vid}/maxresdefault.jpg", method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status == 200
    except urllib.error.HTTPError:
        return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, nargs="+", default=[2024, 2025, 2026])
    args = ap.parse_args()
    rounds = [r for r in json.loads(ROUNDS.read_text()) if r["year"] in args.years and r["round"] and not r["cancelled"] and r["winners"]]
    by_name = {(r["year"], norm(r["name"])): r["round"] for r in rounds}
    videos: dict[str, dict] = {}
    report: list[str] = []
    # Загальний пошук каналу віддає не все (замір 14.11: 4 етапи 2025 не потрапили) — потім точковий пошук кожного пропуску.
    queries = [(y, "") for y in args.years]
    for year, extra in queries:
        for vid, title in search(year, extra):
            m = TITLE.match(title.strip())
            if not m or int(m.group(1)) != year or not ID.match(vid):
                continue
            name = norm(m.group(2))
            # Спершу точна назва (2024–2025 Jolpica сама пише «São Paulo»), псевдонім — лише запасний варіант.
            rnd = by_name.get((year, name)) or by_name.get((year, ALIASES.get(name, name)))
            if rnd is None:
                if not extra:
                    report.append(f"без етапу: {title} ({vid})")
                continue
            key = f"{year}/{rnd}"
            if key in videos:
                continue
            if not embeddable(vid):
                report.append(f"вбудовування заборонене або не канал FORMULA 1: {title} ({vid})")
                continue
            videos[key] = {"id": vid, "title": title.strip(), **({"hd": True} if has_maxres(vid) else {})}
            time.sleep(0.3)
        if extra == "" and year == args.years[-1]:
            queries += [(r["year"], r["name"]) for r in rounds if f"{r['year']}/{r['round']}" not in videos]
    missing = [f"{r['year']}/{r['round']} {r['name']}" for r in rounds if f"{r['year']}/{r['round']}" not in videos]
    data = {
        "_about": "Хайлайти гонок з офіційного YouTube-каналу FORMULA 1 (вбудовування дозволене — oEmbed 200). Ключ — «рік/етап». "
        "Генератор: scripts/curated/race_videos.py (yt-dlp, без ключа API); нові гонки — перезапуск після гонки.",
        "videos": dict(sorted(videos.items(), key=lambda kv: tuple(int(x) for x in kv[0].split("/")))),
    }
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    print(f"відео: {len(videos)} з {len(rounds)} проведених етапів {args.years}")
    for line in missing:
        print("  без відео:", line)
    for line in report:
        print("  !", line)


if __name__ == "__main__":
    main()
