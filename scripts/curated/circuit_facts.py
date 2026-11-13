#!/usr/bin/env python3
"""Факти трас з інфобоксу англійської Вікіпедії → src/data/curated/circuit-facts.json.

    python3 scripts/curated/circuit_facts.py [--cache DIR]

Фаза 3h (docs/plans/2026-11-13-phase3h-circuits.md, рішення користувача 13.11 №2): лише нинішня основна конфігурація —
перший блок конфігурації картки (поля без номера: layout, length_km, turns, record_*), плюс opened, architect, capacity.
Розділу «Конфігурації» немає. Джерело кожного запису — стаття (`title`) і її версія (`revid`).
Правила (сумнівне значення не беремо — поле відсутнє, причина у звіті):
- довжина 1–30 км; повороти 3–200; відкриття — {{Start date…|рік|місяць|день}} або рік (перша частина до <br>);
- місткість — лише число без слів («60,000»; «approx. 150,000», діапазони й переліки — ні);
- архітектор — до трьох імен (посилання або текст);
- рекорд кола — лише record_class = Formula One / F1, час m:ss.sss, пілот — за статтею Вікіпедії з бази
  (e2e/fixtures/db/driver_index.json, поле wikipedia_en), рік — чотири цифри.
Статті — поле `wiki` у src/data/curated/circuits.json. ОДИН процес (ліміти Wikimedia).
"""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import team_facts as tf  # noqa: E402 — клієнт з паузою, Retry-After і кешем
from team_facts import links, plain  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
CIRCUITS = REPO / "src/data/curated/circuits.json"
DRIVERS = REPO / "e2e/fixtures/db/driver_index.json"
OUT = REPO / "src/data/curated/circuit-facts.json"
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
ROUNDS = REPO / "e2e/fixtures/db/season_rounds.json"
BOX = re.compile(r"\{\{\s*(?:Infobox\s+)?(?:motorsport venue|race ?track)\b", re.I)


def infobox(text: str) -> str | None:
    m = BOX.search(text)
    if not m:
        return None
    depth, j = 0, m.start()
    while j < len(text):
        if text.startswith("{{", j):
            depth, j = depth + 1, j + 2
        elif text.startswith("}}", j):
            depth, j = depth - 1, j + 2
            if depth == 0:
                return text[m.start():j]
        else:
            j += 1
    return None


def top_fields(box: str) -> dict[str, str]:
    """Поля картки верхнього рівня (без «|» усередині вкладених шаблонів і посилань)."""
    out: dict[str, str] = {}
    depth = 0
    body = box[2:-2]
    cuts = []
    k = 0
    while k < len(body):
        two = body[k:k + 2]
        if two in ("{{", "[["):
            depth += 1
            k += 2
            continue
        if two in ("}}", "]]"):
            depth -= 1
            k += 2
            continue
        if body[k] == "|" and depth == 0:
            cuts.append(k)
        k += 1
    for a, b in zip(cuts, cuts[1:] + [len(body)]):
        part = body[a + 1:b]
        if "=" in part:
            key, val = part.split("=", 1)
            out[key.strip().lower()] = val.strip()
    return out


def first(value: str | None) -> str | None:
    parts = plain(value) if value else []
    return parts[0] if parts else None


def number(value: str | None) -> float | None:
    v = first(value)
    m = re.fullmatch(r"(\d+(?:\.\d+)?)(?:\s*km)?", v or "")
    return float(m.group(1)) if m else None


def opened(value: str | None) -> str | None:
    if not value:
        return None
    head = re.split(r"<br\s*/?>", value)[0]
    m = re.search(r"\{\{\s*start date(?: and age)?\s*\|(?:[^|}]*=[^|}]*\|)*\s*(\d{4})(?:\s*\|\s*(\d{1,2}))?(?:\s*\|\s*(\d{1,2}))?", head, re.I)
    if m:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        return f"{y}-{int(mo):02d}-{int(d):02d}" if mo and d else f"{y}-{int(mo):02d}" if mo else y
    m = re.search(r"\{\{\s*start date(?: and age)?\s*\|\s*([A-Z][a-z]+) (\d{1,2}), (\d{4})\s*\}\}", head, re.I)
    if m and m.group(1)[:3].lower() in MONTHS:
        return f"{m.group(3)}-{MONTHS.index(m.group(1)[:3].lower()) + 1:02d}-{int(m.group(2)):02d}"
    v = first(head)
    return v if v and re.fullmatch(r"\d{4}", v) else None


def capacity(value: str | None) -> int | None:
    v = first(value)
    if not v or not re.fullmatch(r"\d{1,3}(?:[,\s]\d{3})+|\d{4,6}", v):
        return None
    n = int(re.sub(r"\D", "", v))
    return n if 1000 <= n <= 500_000 else None


def lap_ms(value: str | None) -> int | None:
    m = re.fullmatch(r"(\d):(\d{2})\.(\d{3})", first(value) or "")
    return (int(m.group(1)) * 60 + int(m.group(2))) * 1000 + int(m.group(3)) if m else None


BLOCK = ("layout", "length_km", "turns", "record_time", "record_driver", "record_car", "record_year", "record_class")


def clean_layout(name: str) -> str:
    """Назва конфігурації без параметрів зображення («class=skin-invert|180px»)."""
    return re.split(r"\s+class=|\|", name)[0].strip()


def layout_spans(name: str) -> list[tuple[int, int | None]]:
    """Роки конфігурації з назви: «(1985–1995, 2000)», «(1992–1993 and 2009–2015)», «(2021–present)», «(2026)»."""
    m = re.search(r"\(([^()]*\d{4}[^()]*)\)\s*$", name) or re.search(r"\(([^()]*\d{4}[^()]*)\)", name)
    if not m:
        return []
    out = []
    for a, b in re.findall(r"(\d{4})(?:\s*[–-]\s*(present|\d{4}))?", m.group(1)):
        out.append((int(a), None if b == "present" else int(b) if b else int(a)))
    return out


def is_f1_class(cls: str) -> bool:
    return cls in ("F1", "Formula One", "Formula 1")


def fetch(titles: list[str]) -> dict[str, dict]:
    """Наша назва статті → {title, revid, text}."""
    out: dict[str, dict] = {}
    for part in tf.chunks(sorted(set(titles)), 40):
        q = {"action": "query", "prop": "revisions", "rvprop": "ids|content", "rvslots": "main", "format": "json",
             "formatversion": "2", "redirects": "1", "titles": "|".join(part)}
        d = tf.get(tf.WP_API + "?" + urllib.parse.urlencode(q))["query"]
        alias = {x["from"]: x["to"] for kind in ("normalized", "redirects") for x in d.get(kind, [])}
        pages = {p["title"]: p for p in d["pages"] if p.get("revisions")}
        for t in part:
            final = t
            while final in alias:
                final = alias[final]
            if final in pages:
                rv = pages[final]["revisions"][0]
                out[t] = {"title": final, "revid": rv["revid"], "text": rv["slots"]["main"]["content"]}
    return out


def canonical(titles: list[str]) -> dict[str, str]:
    """Назва статті → після перенаправлень (посилання в картці бувають на стару назву)."""
    out: dict[str, str] = {}
    for part in tf.chunks(sorted(set(titles)), 40):
        q = {"action": "query", "format": "json", "formatversion": "2", "redirects": "1", "titles": "|".join(part)}
        d = tf.get(tf.WP_API + "?" + urllib.parse.urlencode(q))["query"]
        alias = {x["from"]: x["to"] for kind in ("normalized", "redirects") for x in d.get(kind, [])}
        for t in part:
            final = t
            while final in alias:
                final = alias[final]
            out[t] = final
    return out


def main() -> int:
    if "--cache" in sys.argv:
        tf.CACHE = Path(sys.argv[sys.argv.index("--cache") + 1])
        tf.CACHE.mkdir(parents=True, exist_ok=True)
    places = json.loads(CIRCUITS.read_text())["places"]
    by_wiki = {}
    for row in json.loads(DRIVERS.read_text()):
        url = row.get("wikipedia_en") or ""
        if "/wiki/" in url:
            by_wiki[urllib.parse.unquote(url.split("/wiki/", 1)[1]).replace("_", " ")] = row["id"]
    pages = fetch([p["wiki"] for p in places.values() if p.get("wiki")])
    facts, report = {}, []
    gp_articles: dict[str, set[str]] = {}
    last_year: dict[str, int] = {}
    for r in json.loads(ROUNDS.read_text()):
        gp_articles.setdefault(r["circuit"], set()).add(f"{r['year']} {r['name']}")
        if not r["cancelled"] and r["winners"]:
            last_year[r["circuit"]] = max(last_year.get(r["circuit"], 0), r["year"])
    # Пілоти-рекордсмени, яких немає в базі за назвою статті, — після перенаправлень (обидва боки).
    targets = set()
    for p in places.values():
        page = pages.get(p.get("wiki", ""))
        box = infobox(page["text"]) if page else None
        for k, v in (top_fields(box) if box else {}).items():
            t = (links(v) or [None])[0] if re.fullmatch(r"record_driver\d*", k) else None
            if t and t not in by_wiki:
                targets.add(t)
    if targets:
        canon_db = {}
        missing_db = [t for t in by_wiki if t not in targets]
        canon_t = canonical(sorted(targets))
        wanted = set(canon_t.values())
        # Назви з бази канонізуємо лише для пілотів, що можуть збігтися (прізвище з цілі є в назві).
        bare = lambda t: re.sub(r"\s*\(.*\)$", "", t).split()[-1]  # noqa: E731 — прізвище без «(racing driver)»
        surnames = {bare(w) for w in wanted} | {bare(t) for t in targets}
        canon_db = canonical([t for t in missing_db if bare(t) in surnames])
        for t, c in canon_t.items():
            hit = next((by_wiki[d] for d, cd in canon_db.items() if cd == c), None)
            if hit:
                by_wiki[t] = hit
    for ref in sorted(places):
        page = pages.get(places[ref].get("wiki", ""))
        box = infobox(page["text"]) if page else None
        if not box:
            report.append(f"{ref}: немає картки траси ({page['title'] if page else 'статті немає'})")
            continue
        f = top_fields(box)
        rec: dict = {"title": page["title"], "revid": page["revid"]}
        # Блок конфігурації картки (layout, layout2…; поля блоку N: layoutN, lengthN_km, turnsN, record_*N). Оцінка:
        # роки блоку охоплюють останню гонку F1 на трасі +4, клас рекорду блоку — F1 +2, «Grand Prix»/«GP» у назві +1.
        # Блоки з розібраними роками, що НЕ охоплюють останню гонку, — інша епоха, не беремо (Індіанаполіс: перший
        # блок — овал 1909–, F1 — дорожня траса 2000–2007; Брендс-Гетч 1986 — Grand Prix 1976–1987, а не Indy 1976–1998).
        last_f1 = last_year.get(ref)
        best, best_score = None, -1
        for n in [""] + [str(i) for i in range(2, 20)]:
            nm = clean_layout(first(f.get("layout" + n)) or "")
            if not nm:
                continue
            spans = layout_spans(nm)
            covers = bool(last_f1) and any(y0 <= last_f1 <= (y1 or 9999) for y0, y1 in spans)
            if spans and not covers:
                continue
            score = 4 * covers + 2 * is_f1_class(first(f.get("record_class" + n)) or "") + bool(re.search(r"grand prix|\bgp\b", nm, re.I))
            if score > best_score:
                best, best_score = n, score
        if best is None:
            report.append(f"{ref}: жодна конфігурація картки не охоплює {last_f1} — факти конфігурації не взято")
            f = {k: v for k, v in f.items() if not any(k.startswith(b) for b in ("layout", "length", "turns", "record_"))}
        elif best:
            pick = {"layout": "layout" + best, "length_km": f"length{best}_km", "turns": "turns" + best}
            pick.update({k: k + best for k in ("record_time", "record_driver", "record_car", "record_year", "record_class")})
            f = {**f, **{k: f[v] for k, v in pick.items() if v in f}}
            for k, v in pick.items():
                if v not in f:
                    f.pop(k, None)
        name = clean_layout(first(f.get("layout")) or "")
        if name:
            rec["layout"] = {"name": name, "years": [[a, b] for a, b in layout_spans(name)]}
        km = number(f.get("length_km"))
        if km is not None and 1 <= km <= 30:
            rec["lengthKm"] = km
        elif f.get("length_km"):
            report.append(f"{ref}: довжина «{f['length_km'][:40]}» не взято")
        turns = number(f.get("turns"))
        if turns is not None and turns == int(turns) and 3 <= turns <= 200:
            rec["turns"] = int(turns)
        elif f.get("turns"):
            report.append(f"{ref}: повороти «{f['turns'][:40]}» не взято")
        o = opened(f.get("opened"))
        if o:
            rec["opened"] = o
        elif f.get("opened"):
            report.append(f"{ref}: відкриття «{f['opened'][:50]}» не взято")
        if f.get("architect"):
            arch = re.sub(r"\{\{\s*ill\s*\|([^|}]+)[^}]*\}\}", r"[[\1]]", f["architect"], flags=re.I)  # міжмовне посилання
            names = [n for n in (links(arch) or plain(arch)) if n]
            if 1 <= len(names) <= 3:
                rec["architects"] = [re.sub(r"\s*\(.*?\)$", "", n) for n in names]
            else:
                report.append(f"{ref}: архітектор «{f['architect'][:50]}» не взято")
        if o and last_f1 and int(o[:4]) > last_f1:
            report.append(f"{ref}: стаття «{page['title']}» про трасу, відкриту {o[:4]}, а остання гонка F1 тут — {last_f1}; запис не взято")
            continue
        cap = capacity(f.get("capacity"))
        if cap:
            rec["capacity"] = cap
        elif f.get("capacity"):
            report.append(f"{ref}: місткість «{first(f['capacity']) or f['capacity'][:40]}» не взято")
        cls = first(f.get("record_class")) or ""
        ms = lap_ms(f.get("record_time"))
        year_text = first(f.get("record_year")) or ""
        year = re.search(r"\b(19|20)\d{2}\b", year_text)
        # Клас порожній (Монреаль, Фінікс) — F1, лише якщо рік посилається на статтю «<рік> <Гран-прі цієї траси>» з бази.
        year_link = (links(f.get("record_year", "")) or [""])[0]
        f1_race = bool(year) and year_link in gp_articles.get(ref, set())
        if ms and (is_f1_class(cls) or (not cls and f1_race)):
            target = (links(f.get("record_driver", "")) or [None])[0]
            drv = by_wiki.get(target) if target else None
            if drv and year:
                rec["record"] = {"ms": ms, "driver": drv, "year": int(year.group(0))}
            else:
                report.append(f"{ref}: рекорд кола без пілота з бази чи року ({target}, {f.get('record_year', '')[:30]})")
        elif ms:
            report.append(f"{ref}: рекорд кола не F1 ({plain(cls)[:1]})")
        facts[ref] = rec
    OUT.write_text(json.dumps({
        "_about": "Факти трас з інфобоксу англійської Вікіпедії (нинішня основна конфігурація — перший блок картки; "
                  "відкриття, архітектор, місткість). title + revid — джерело (https://en.wikipedia.org/w/index.php?oldid=<revid>). "
                  "Генератор: scripts/curated/circuit_facts.py (правила відбору — у його описі).",
        "facts": facts,
    }, ensure_ascii=False, indent=1) + "\n")
    print(f"трас з карткою: {len(facts)} з {len(places)}")
    for k in ("layout", "lengthKm", "turns", "opened", "architects", "capacity", "record"):
        print(f"  {k}: {sum(1 for r in facts.values() if k in r)}")
    for r in report:
        print("  ! " + r)
    return 0


if __name__ == "__main__":
    sys.exit(main())
