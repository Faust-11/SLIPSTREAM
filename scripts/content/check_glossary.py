#!/usr/bin/env python3
"""Перевірка словника термінів і сторінки «Новачкам» (content/glossary/README.md, content/newbie/README.md) — без мережі.

    python3 scripts/content/check_glossary.py

- content/glossary/terms.json: поля термінів uk/en, унікальні id, форми слова, у кожного терміна ≥ 1 джерело зі списку.
- content/newbie/page.json: твердження сторінки → джерела; статус за кількістю незалежних видавців (ok ≥ 2, one = 1);
  у кожного розділу (крім словника) є твердження.
- content/newbie/{uk,en}.json: однакова структура (ключі й довжини списків) в обох мовах.
- Джерела: https-URL, видавець, назва, kind primary|secondary, lang; без Вікіпедії.
- Ручні мітки [[t:<id>|…]] в історіях: id є в словнику, однаковий набір в uk.md і en.md.
Код виходу 1, якщо є помилки.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
GLOSSARY = REPO / "content" / "glossary" / "terms.json"
NEWBIE = REPO / "content" / "newbie"
STORIES = REPO / "content" / "stories"
ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MANUAL = re.compile(r"\[\[t:([a-z0-9-]+)\|[^\]|]+\]\]")
SECTIONS = {"basics", "weekend", "points", "tyres", "flags", "overtake", "glossary"}
BANNED = re.compile(r"wikipedia\.org|wikiwand\.|wiki2\.|dbpedia\.", re.I)


def publisher_key(name: str) -> str:
    return str(name).split("(")[0].strip().lower()


def check_sources(where: str, sources: list, errors: list[str]) -> dict:
    by_id: dict = {}
    for s in sources:
        sid = s.get("id")
        if not sid or sid in by_id:
            errors.append(f"{where}: джерело без id або повтор «{sid}»")
            continue
        by_id[sid] = s
        for key in ("title", "publisher", "url", "kind", "lang"):
            if not s.get(key):
                errors.append(f"{where}: джерело {sid} — немає {key}")
        url = str(s.get("url", ""))
        if url and not url.startswith("https://"):
            errors.append(f"{where}: джерело {sid} — URL не https: {url}")
        if BANNED.search(url) or "wikipedia" in str(s.get("publisher", "")).lower():
            errors.append(f"{where}: джерело {sid} — Вікіпедія не джерело ({url})")
        if s.get("kind") not in (None, "primary", "secondary"):
            errors.append(f"{where}: джерело {sid} — kind «{s.get('kind')}»")
    return by_id


def shape(x, path="") -> list[str]:
    """Структура JSON без значень: ключі об'єктів і довжини списків (рядки й числа — лише тип)."""
    if isinstance(x, dict):
        return [f"{path}{{}}"] + [p for k in sorted(x) for p in shape(x[k], f"{path}.{k}")]
    if isinstance(x, list):
        return [f"{path}[{len(x)}]"] + [p for i, v in enumerate(x) for p in shape(v, f"{path}[{i}]")]
    return [f"{path}:{type(x).__name__}"]


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    # ---------- словник ----------
    g = json.loads(GLOSSARY.read_text(encoding="utf-8"))
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(g.get("checked", ""))):
        errors.append("terms.json: checked — дата YYYY-MM-DD")
    gsrc = check_sources("terms.json", g.get("sources", []), errors)
    ids: set[str] = set()
    for t in g.get("terms", []):
        tid = t.get("id", "")
        where = f"terms.json: {tid or '?'}"
        if not ID.match(tid) or tid in ids:
            errors.append(f"{where}: id не kebab-case або повтор")
        ids.add(tid)
        if not isinstance(t.get("auto"), bool):
            errors.append(f"{where}: auto — true/false")
        if not t.get("orig"):
            errors.append(f"{where}: немає orig (оригінальна назва англійською)")
        for lang in ("uk", "en"):
            l10n = t.get(lang) or {}
            for key in ("term", "def"):
                if not l10n.get(key):
                    errors.append(f"{where}: немає {lang}.{key}")
            forms = l10n.get("forms")
            if not isinstance(forms, list) or not all(isinstance(f, str) and f.strip() for f in forms):
                errors.append(f"{where}: {lang}.forms — список рядків")
        if t.get("auto") and not any((t.get(lang) or {}).get("forms") for lang in ("uk", "en")):
            errors.append(f"{where}: auto без жодної форми слова")
        srcs = t.get("sources") or []
        if not srcs:
            errors.append(f"{where}: немає джерел")
        for s in srcs:
            if s not in gsrc:
                errors.append(f"{where}: невідоме джерело {s}")

    # ---------- сторінка «Новачкам» ----------
    page = json.loads((NEWBIE / "page.json").read_text(encoding="utf-8"))
    psrc = check_sources("newbie/page.json", page.get("sources", []), errors)
    seen_claims: set[str] = set()
    per_section: dict[str, int] = {}
    for c in page.get("claims", []):
        cid = c.get("id", "")
        where = f"newbie/page.json: {cid or '?'}"
        if not cid or cid in seen_claims:
            errors.append(f"{where}: claim без id або повтор")
        seen_claims.add(cid)
        if c.get("section") not in SECTIONS:
            errors.append(f"{where}: section «{c.get('section')}»")
        per_section[c.get("section")] = per_section.get(c.get("section"), 0) + 1
        if not c.get("text"):
            errors.append(f"{where}: немає text")
        srcs = c.get("sources") or []
        missing = [s for s in srcs if s not in psrc]
        if missing:
            errors.append(f"{where}: невідомі джерела {missing}")
        pubs = {publisher_key(psrc[s]["publisher"]) for s in srcs if s in psrc}
        status = c.get("status")
        if status == "ok" and len(pubs) < 2:
            errors.append(f"{where}: ok потребує ≥ 2 незалежних видавців (є {sorted(pubs)})")
        elif status == "one" and len(srcs) < 1:
            errors.append(f"{where}: one без джерела")
        elif status not in ("ok", "one"):
            errors.append(f"{where}: status «{status}» (ok | one)")
    for sec in sorted(SECTIONS - {"glossary"}):
        if not per_section.get(sec):
            errors.append(f"newbie/page.json: розділ {sec} без жодного твердження з джерелом")

    texts = {lang: json.loads((NEWBIE / f"{lang}.json").read_text(encoding="utf-8")) for lang in ("uk", "en")}
    su, se = shape(texts["uk"]), shape(texts["en"])
    if su != se:
        diff = sorted(set(su) ^ set(se))[:8]
        errors.append(f"newbie: різна структура uk.json / en.json: {diff}")
    for lang, data in texts.items():
        blob = json.dumps(data, ensure_ascii=False)
        for tid in MANUAL.findall(blob):
            if tid not in ids:
                errors.append(f"newbie/{lang}.json: невідомий термін [[t:{tid}|…]]")

    # ---------- ручні мітки в історіях ----------
    for d in sorted(p for p in STORIES.iterdir() if p.is_dir()):
        marks = {}
        for lang in ("uk", "en"):
            f = d / f"{lang}.md"
            if not f.exists():
                continue
            found = MANUAL.findall(f.read_text(encoding="utf-8"))
            marks[lang] = sorted(set(found))
            for tid in found:
                if tid not in ids:
                    errors.append(f"stories/{d.name}/{lang}.md: невідомий термін [[t:{tid}|…]]")
        if len(marks) == 2 and marks["uk"] != marks["en"]:
            warnings.append(f"stories/{d.name}: ручні терміни різняться uk {marks['uk']} / en {marks['en']}")

    n_terms = len(g.get("terms", []))
    print(f"Словник: {n_terms} термінів, {len(gsrc)} джерел. «Новачкам»: {len(seen_claims)} тверджень, {len(psrc)} джерел.")
    for w in warnings:
        print(f"  ⚠ {w}")
    for e in errors:
        print(f"  ✗ {e}")
    print("OK" if not errors else f"Помилок: {len(errors)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
