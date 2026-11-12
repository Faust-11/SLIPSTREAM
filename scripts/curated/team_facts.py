#!/usr/bin/env python3
"""Факти команд (засновник, база, Instagram) → src/data/curated/team-facts.json.

    python3 scripts/curated/team_facts.py [--cache DIR]   # усі команди з src/data/curated/teams.json
    python3 scripts/curated/team_facts.py --report        # лише звіт по наявному файлу

Джерела (замір 12.11: у Wikidata P112/P159 порожні навіть у Ferrari й Mercedes, у картці Вікіпедії — заповнені):
  * стаття англійської Вікіпедії команди — з API Jolpica (/constructors/<ref>, поле url);
  * засновники й база — поля Founders / Base картки «Infobox F1 team / constructor» (розділ 0 статті);
  * назви українською — підписи Wikidata (uk) елементів, на які посилаються ці поля;
  * база = «місто, країна»: перше посилання поля Base на населений пункт (у Wikidata є населення P1082 і
    він не є сам країною), країна — його P17; так обидві мови мають однакову будову;
  * Instagram — Wikidata P2003 елемента статті команди.
Значення без посилання (немає елемента Wikidata) лишається латиницею в обох мовах і йде в звіт.
Ручні правки — поле "manual" команди: скрипт його зберігає, на сайті воно має перевагу.
Запити пакетами по 50, пауза ≥ 1 с, Retry-After на 429; відповіді кешуються (--cache), щоб повтор не навантажував.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TEAMS = REPO / "src/data/curated/teams.json"
OUT = REPO / "src/data/curated/team-facts.json"
UA = "Slipstream-data-loader/0.2 (non-commercial F1 fan site; batched, cached)"
JOLPICA = "https://api.jolpi.ca/ergast/f1/constructors/{}.json"
WP_API = "https://en.wikipedia.org/w/api.php"
WD_API = "https://www.wikidata.org/w/api.php"
CACHE: Path | None = None
_last = 0.0


def get(url: str) -> dict:
    global _last
    key = CACHE / (hashlib.sha256(url.encode()).hexdigest() + ".json") if CACHE else None
    if key and key.exists():
        return json.loads(key.read_text())
    for attempt in range(6):
        wait = 1.0 - (time.time() - _last)
        if wait > 0:
            time.sleep(wait)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
                _last = time.time()
                data = json.loads(r.read())
                if key:
                    key.write_text(json.dumps(data))
                return data
        except urllib.error.HTTPError as e:
            _last = time.time()
            if e.code in (429, 500, 502, 503) and attempt < 5:
                time.sleep(int(e.headers.get("Retry-After") or 0) or 5 * 2 ** attempt)
                continue
            raise
    raise RuntimeError(url)


def chunks(xs: list, n: int = 50):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def enwiki_title(ref: str) -> str | None:
    rows = get(JOLPICA.format(urllib.parse.quote(ref)))["MRData"]["ConstructorTable"]["Constructors"]
    url = rows[0].get("url") if rows else None
    if not url or "wikipedia.org/wiki/" not in url:
        return None
    return urllib.parse.unquote(url.split("/wiki/", 1)[1].split("#")[0]).replace("_", " ")


def wikitext_section0(titles: list[str]) -> dict[str, tuple[str, str]]:
    """заголовок як у запиті → (кінцевий заголовок після перенаправлень, вікітекст розділу 0)."""
    out = {}
    for part in chunks(titles):
        # rvsection з кількома сторінками не працює — беремо весь текст і відрізаємо до першого заголовка.
        q = {"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "format": "json",
             "formatversion": "2", "redirects": "1", "titles": "|".join(part)}
        d = get(WP_API + "?" + urllib.parse.urlencode(q))["query"]
        alias = {}
        for kind in ("normalized", "redirects"):
            for x in d.get(kind, []):
                alias[x["from"]] = x["to"]
        texts = {p["title"]: p["revisions"][0]["slots"]["main"]["content"] for p in d["pages"] if p.get("revisions")}
        for t in part:
            final = t
            while final in alias:
                final = alias[final]
            if final in texts:
                out[t] = (final, re.split(r"\n==[^=]", texts[final], maxsplit=1)[0])
    return out


FIELD = re.compile(r"^\s*\|\s*([A-Za-z_() ]+?)\s*=", re.M)


def field(text: str, *names: str) -> str | None:
    """Значення поля картки, зокрема багаторядкове ({{plainlist|…}}): до наступного «| поле =» або кінця картки."""
    text = text.replace("\r", "")
    marks = list(FIELD.finditer(text))
    for k, m in enumerate(marks):
        if m.group(1).strip().lower() not in names:
            continue
        end = marks[k + 1].start() if k + 1 < len(marks) else len(text)
        value = re.split(r"\n\}\}", text[m.end():end], maxsplit=1)[0].strip()
        if value:
            return value
    return None


def links(value: str) -> list[str]:
    return [m.split("|")[0].strip() for m in re.findall(r"\[\[([^\]]+)\]\]", value) if ":" not in m.split("|")[0]]


def plain(value: str) -> list[str]:
    """Вікірозмітка → частини, розділені <br> або пунктами списку; без посилань, приміток і службових шаблонів."""
    v = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>|<!--.*?-->", "", value, flags=re.S)
    v = re.sub(r"\[\[([^\]|]+\|)?([^\]]+)\]\]", r"\2", v)
    for _ in range(3):  # обгортки з текстом — розгорнути, решту шаблонів (прапорці тощо) — прибрати
        v = re.sub(r"\{\{(?:nowrap|nobr|small)\|([^{}]*)\}\}", r"\1", v, flags=re.I)
        v = re.sub(r"\{\{(?:ubl|unbulleted list|plainlist|flatlist|hlist)\|([^{}]*)\}\}",
                   lambda m: m.group(1).replace("|", "<br>"), v, flags=re.I)
        v = re.sub(r"\{\{[^{}]*\}\}", "", v)
    parts = re.split(r"<br\s*/?>|\n\s*\*", v)
    return [x for x in (re.sub(r"\s+", " ", p).strip(" ,;*") for p in parts) if x]


def wd_by_titles(titles: list[str]) -> dict[str, dict]:
    out = {}
    for part in chunks(sorted(set(titles))):
        q = {"action": "wbgetentities", "format": "json", "sites": "enwiki", "titles": "|".join(part),
             "props": "labels|claims|sitelinks", "languages": "uk|en", "sitefilter": "enwiki"}
        for qid, ent in get(WD_API + "?" + urllib.parse.urlencode(q)).get("entities", {}).items():
            if qid.startswith("-"):
                continue
            t = ent.get("sitelinks", {}).get("enwiki", {}).get("title")
            if t:
                out[t] = ent
    return out


def wd_by_ids(ids: list[str]) -> dict[str, dict]:
    out = {}
    for part in chunks(sorted(set(ids))):
        q = {"action": "wbgetentities", "format": "json", "ids": "|".join(part), "props": "labels", "languages": "uk|en"}
        out.update(get(WD_API + "?" + urllib.parse.urlencode(q)).get("entities", {}))
    return out


def lab(ent: dict, fallback: str) -> dict:
    l = ent.get("labels", {})
    en = l.get("en", {}).get("value") or fallback
    return {"en": en, "uk": l.get("uk", {}).get("value") or en, "ukFromWikidata": "uk" in l}


def claim_ids(ent: dict, prop: str) -> list[str]:
    vals = [(c.get("rank"), c["mainsnak"].get("datavalue", {}).get("value"))
            for c in ent.get("claims", {}).get(prop, []) if c.get("rank") != "deprecated"]
    pref = [v for r, v in vals if r == "preferred" and v is not None]
    return pref or [v for _, v in vals if v is not None]


def main() -> int:
    global CACHE
    if "--cache" in sys.argv:
        CACHE = Path(sys.argv[sys.argv.index("--cache") + 1])
        CACHE.mkdir(parents=True, exist_ok=True)
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"teams": {}}
    if "--report" in sys.argv:
        return report(old)
    teams = json.loads(TEAMS.read_text(encoding="utf-8"))["teams"]

    # 1. Статті команд (основна — та, на яку вказує більшість refs; рівність — перший ref).
    article: dict[str, str | None] = {}
    issues: dict[str, list[str]] = {t["id"]: [] for t in teams}
    for i, t in enumerate(teams, 1):
        by_title: dict[str, list[str]] = {}
        for ref in t["refs"]:
            if (title := enwiki_title(ref)):
                by_title.setdefault(title, []).append(ref)
        if len(by_title) > 1:
            issues[t["id"]].append(f"refs ведуть на різні статті: {by_title}")
        article[t["id"]] = max(by_title, key=lambda k: (len(by_title[k]), -t["refs"].index(by_title[k][0]))) if by_title else None
        print(f"[{i}/{len(teams)}] {t['id']} → {article[t['id']]}", flush=True)

    texts = wikitext_section0([a for a in article.values() if a])
    team_items = wd_by_titles([texts[a][0] for a in article.values() if a in texts])

    raw: dict[str, dict] = {}
    linked: list[str] = []
    for t in teams:
        a = article[t["id"]]
        if not a or a not in texts:
            issues[t["id"]].append("немає статті Вікіпедії" if not a else f"не вдалося прочитати «{a}»")
            raw[t["id"]] = {}
            continue
        final, text = texts[a]
        f = field(text, "founders", "founder", "founder(s)")
        b = field(text, "base")
        raw[t["id"]] = {"article": final, "founders": f, "base": b}
        linked += links(f or "") + links(b or "")
    places = wd_by_titles(linked)
    countries = wd_by_ids([c["id"] for e in places.values() for c in claim_ids(e, "P17") if isinstance(c, dict)])

    # Назви країн — як на решті сайту (teams.json: «Велика Британія», «США»), а не підписи Wikidata
    # («Сполучене Королівство», «Сполучені Штати Америки»).
    site_country = {x["country"]["en"]: x["country"] for x in teams}

    def country_label(ent: dict, fallback: str) -> dict:
        l = lab(ent, fallback)
        if l["en"] in site_country:
            return {**site_country[l["en"]], "ukFromWikidata": True}
        return l

    result: dict[str, dict] = {}
    for t in teams:
        r = raw[t["id"]]
        entry: dict = {"wikipedia": r.get("article"), "issues": issues[t["id"]]}
        item = team_items.get(r.get("article") or "")
        if item:
            entry["wikidata"] = item["id"]
            ig = [v for v in claim_ids(item, "P2003") if isinstance(v, str)]
            if ig:
                entry["instagram"] = ig[0]
        if r.get("founders"):
            people = []
            link_map = {}
            for m in re.findall(r"\[\[([^\]]+)\]\]", r["founders"]):
                target, _, text_ = m.partition("|")
                link_map[(text_ or target).strip()] = target.strip()
            for name in plain(r["founders"]):
                if re.fullmatch(r"\(?[^)]*\)?", name) and name.startswith("("):
                    continue  # «(Team Principal)» тощо
                ent = places.get(link_map.get(name, ""), {})
                people.append({"name": lab(ent, name), **({"wikidata": ent["id"]} if ent else {})})
                if not ent:
                    issues[t["id"]].append(f"засновник без елемента Wikidata: {name}")
            if people:
                entry["founders"] = people
        if r.get("base"):
            city = None
            for title in links(r["base"]):
                ent = places.get(title)
                if not ent:
                    continue
                own = ent["id"]
                c = [x["id"] for x in claim_ids(ent, "P17") if isinstance(x, dict)]
                if ent.get("claims", {}).get("P1082") and c and own not in c:
                    city = (ent, c[0])
                    break
            country_only = next((places[x] for x in links(r["base"]) if x in places
                                 and places[x]["id"] in [c["id"] for c in claim_ids(places[x], "P17") if isinstance(c, dict)]), None)
            if city:
                ent, cid = city
                entry["base"] = {"city": lab(ent, ent["id"]), "country": country_label(countries.get(cid, {}), cid),
                                 "wikidata": ent["id"]}
            elif country_only:
                # У картці лише країна (часто в малих командах 1950–70-х) — показуємо країну, міста не вигадуємо.
                entry["base"] = {"city": None, "country": country_label(country_only, country_only["id"]), "wikidata": country_only["id"]}
            else:
                issues[t["id"]].append(f"база без населеного пункту з посиланням: {plain(r['base'])}")
                entry["baseText"] = ", ".join(plain(r["base"]))
        if "manual" in old.get("teams", {}).get(t["id"], {}):
            entry["manual"] = old["teams"][t["id"]]["manual"]
        result[t["id"]] = entry
    data = {"source": "англійська Вікіпедія (картка команди: Founders, Base) + Wikidata (українські назви, P17, P2003)",
            "teams": result}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return report(data)


def report(data: dict) -> int:
    teams = data["teams"]
    have = {k: sum(1 for v in teams.values() if v.get(k)) for k in ("founders", "base", "instagram")}
    have["city"] = sum(1 for v in teams.values() if v.get("base") and v["base"]["city"])
    no_uk = sorted({p["name"]["en"] for v in teams.values() for p in v.get("founders", []) if not p["name"]["ukFromWikidata"]}
                   | {v["base"]["city"]["en"] for v in teams.values() if v.get("base") and v["base"]["city"] and not v["base"]["city"]["ukFromWikidata"]})
    print(f"\nкоманд: {len(teams)}; засновник: {have['founders']}, база: {have['base']} (з містом {have['city']}), Instagram: {have['instagram']}")
    print(f"назв без української (лишаються латиницею): {len(no_uk)}: {', '.join(no_uk[:40])}")
    bad = {k: v["issues"] for k, v in teams.items() if v.get("issues")}
    print(f"з зауваженнями: {len(bad)}")
    for k, v in sorted(bad.items()):
        print(f"  {k}: {'; '.join(v)}"[:300])
    return 0


if __name__ == "__main__":
    sys.exit(main())
