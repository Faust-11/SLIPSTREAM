#!/usr/bin/env python3
"""Перевірка формату історій (content/stories/README.md) — без мережі.

    python3 scripts/content/check_stories.py [slug …]

Для кожної історії: story.json читається і має потрібні поля; кожна виноска [^cN] у uk.md і en.md є серед claims;
у кожного твердження є джерела, і всі вони є серед sources; статус відповідає кількості джерел (ok ≥ 2, one = 1,
dis — з поясненням note); набір виносок однаковий в обох мовах; твердження без жодної виноски в тексті; дублікати id;
джерела без URL. Друкує звіт і кількість слів; код виходу 1, якщо є помилки (попередження не зупиняють).
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

# STORIES_ROOT — лише для тесту-паритету TS-валідатора адмінки (src/lib/admin/stories/__tests__): перевірка копій у тимчасовій теці.
ROOT = Path(os.environ.get("STORIES_ROOT") or Path(__file__).resolve().parents[2] / "content" / "stories")
CATEGORIES = {"scandal", "sensation", "explainer", "tech", "history"}
STATUSES = {"ok", "one", "dis"}
MARK = re.compile(r"\[\^(c\d+)\]")
MEDIA = re.compile(r"\[\[media:(m\d+)\]\]")
BLOCK = re.compile(r"\[\[block:(b\d+)\]\]")
DIRECTIVE = re.compile(r"^:::(tldr|timeline)\s*$")


def publisher_key(name: str) -> str:
    """Видавець для незалежності: «FIA (Stewards)» = FIA; власний розрахунок Outlap з даних Jolpica = Jolpica."""
    key = str(name).split("(")[0].strip().lower()
    if key.startswith("outlap") and "jolpica" in str(name).lower():
        return "jolpica"
    return key


def words(text: str) -> int:
    text = MARK.sub("", text)
    text = re.sub(r"[#>*_`\[\]()]", " ", text)
    return len(re.findall(r"[\w'’-]+", text))


def check(story_dir: Path) -> tuple[list[str], list[str], str]:
    errors: list[str] = []
    warnings: list[str] = []
    slug = story_dir.name
    try:
        meta = json.loads((story_dir / "story.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [f"{slug}: немає story.json"], [], ""
    except json.JSONDecodeError as e:
        return [f"{slug}: story.json — невалідний JSON ({e})"], [], ""

    if meta.get("slug") != slug:
        errors.append(f"slug у story.json «{meta.get('slug')}» ≠ назва теки «{slug}»")
    if meta.get("category") not in CATEGORIES:
        errors.append(f"category «{meta.get('category')}» — не з {sorted(CATEGORIES)}")
    for key in ("title", "dek"):
        for lang in ("uk", "en"):
            if not (meta.get(key) or {}).get(lang):
                errors.append(f"немає {key}.{lang}")

    sources = meta.get("sources") or []
    claims = meta.get("claims") or []
    src_ids = [s.get("id") for s in sources]
    claim_ids = [c.get("id") for c in claims]
    for kind, ids in (("джерел", src_ids), ("тверджень", claim_ids)):
        dup = {i for i in ids if ids.count(i) > 1}
        if dup:
            errors.append(f"дублікати id {kind}: {sorted(dup)}")
    for s in sources:
        if "wikipedia.org" in str(s.get("url", "")) or "wikipedia" in str(s.get("publisher", "")).lower():
            errors.append(f"джерело {s.get('id')}: Вікіпедія — не джерело (README, правило 2)")
        if not str(s.get("url", "")).startswith("http"):
            errors.append(f"джерело {s.get('id')}: немає URL")
    known_src = set(src_ids)
    by_id = {s.get("id"): s for s in sources}
    used_src: set[str] = set()
    counts = {"ok": 0, "one": 0, "dis": 0}
    for c in claims:
        cid, st, cs = c.get("id"), c.get("status"), c.get("sources") or []
        if st not in STATUSES:
            errors.append(f"{cid}: статус «{st}»")
            continue
        counts[st] += 1
        missing = [x for x in cs if x not in known_src]
        if missing:
            errors.append(f"{cid}: джерела {missing} відсутні в sources")
        used_src.update(cs)
        if not cs:
            errors.append(f"{cid}: без джерел")
        # Незалежність — за видавцем: два документи FIA — одне джерело (README, правило статусу ok).
        publishers = {publisher_key(by_id.get(x, {}).get("publisher", x)) for x in cs}
        if st == "ok" and len(publishers) < 2:
            errors.append(f"{cid}: статус ok, але незалежне джерело одне ({sorted(publishers)})")
        elif st == "one" and len(publishers) > 1:
            warnings.append(f"{cid}: статус one, але видавців {len(publishers)} (може, ok?)")
        if st == "dis" and not c.get("note"):
            errors.append(f"{cid}: статус dis без note")
        if st == "dis":
            # Розділ «Де джерела розходяться» (фаза 5): назва суперечки й пояснення для читача — обома мовами.
            for key in ("label", "reader"):
                if not all((c.get(key) or {}).get(lang) for lang in ("uk", "en")):
                    errors.append(f"{cid}: статус dis без {key}.uk/.en")
    unused = known_src - used_src
    if unused:
        warnings.append(f"джерела без жодного твердження: {sorted(unused)}")

    marks: dict[str, set[str]] = {}
    blocks: dict[str, list[str]] = {}
    wc: dict[str, int] = {}
    for lang in ("uk", "en"):
        p = story_dir / f"{lang}.md"
        if not p.exists():
            errors.append(f"немає {lang}.md")
            continue
        text = p.read_text(encoding="utf-8")
        marks[lang] = set(MARK.findall(text))
        blocks[lang] = BLOCK.findall(text)
        opened = 0
        inside = False
        prev_quote = False
        for line in text.splitlines():
            stripped = line.strip()
            # Розмітка, якої розбирач сайту не знає (рев'ю PR #36): на сторінці вона була б сирим текстом.
            if stripped.startswith("###") or (stripped.startswith("#") and not stripped.startswith("## ")):
                errors.append(f"{lang}.md: заголовок не рівня ## ({stripped[:40]})")
            if re.search(r"(?<!\[)\[[^\]^\[]+\]\([^)]+\)", line):
                errors.append(f"{lang}.md: посилання [текст](url) не підтримується ({stripped[:40]})")
            if DIRECTIVE.match(stripped):
                inside = True
            elif stripped == ":::":
                inside = False
            elif re.match(r"^\s*([-*]|\d+\.)\s", line) and not inside:
                errors.append(f"{lang}.md: список поза блоком :::tldr/:::timeline ({stripped[:40]})")
            if stripped == ">" and prev_quote:
                errors.append(f"{lang}.md: порожній рядок «>» усередині цитати")
            prev_quote = line.startswith(">")
            # Фото й віджети — лише окремим рядком (так їх розпізнає розбирач сайту src/lib/stories/markdown.ts).
            if (MEDIA.search(line) or BLOCK.search(line)) and not re.fullmatch(r"\s*\[\[(media|block):\w+\]\]\s*", line):
                errors.append(f"{lang}.md: [[media/block]] не окремим рядком ({line.strip()[:40]})")
            if DIRECTIVE.match(line.strip()):
                opened += 1
            elif line.strip() == ":::":
                opened -= 1
            if opened not in (0, 1):
                errors.append(f"{lang}.md: вкладені або незакриті блоки ::: ({line[:40]})")
                break
        if opened:
            errors.append(f"{lang}.md: незакритий блок :::")
        unknown_media = set(MEDIA.findall(text)) - {m.get("id") for m in meta.get("media") or []}
        if unknown_media:
            errors.append(f"{lang}.md: фото без запису в media {sorted(unknown_media)}")
        unknown_blocks = set(blocks[lang]) - {b.get("id") for b in meta.get("blocks") or []}
        if unknown_blocks:
            errors.append(f"{lang}.md: блоки без запису в blocks {sorted(unknown_blocks)}")
        wc[lang] = words(text)
        unknown = marks[lang] - set(claim_ids)
        if unknown:
            errors.append(f"{lang}.md: виноски без твердження {sorted(unknown, key=lambda x: int(x[1:]))}")
    if "uk" in marks and "en" in marks and marks["uk"] != marks["en"]:
        only_uk = sorted(marks["uk"] - marks["en"], key=lambda x: int(x[1:]))
        only_en = sorted(marks["en"] - marks["uk"], key=lambda x: int(x[1:]))
        errors.append(f"виноски різняться: лише uk {only_uk}, лише en {only_en}")
    if "uk" in blocks and "en" in blocks and blocks["uk"] != blocks["en"]:
        errors.append(f"блоки [[block:…]] різняться між мовами: uk {blocks['uk']}, en {blocks['en']}")
    race = meta.get("race")
    if race is not None and not re.fullmatch(r"\d{4}/\d{1,2}", str(race)):
        errors.append(f"race «{race}» — не у форматі рік/етап")
    for s in sources:
        if "author" in s and not isinstance(s["author"], str):
            errors.append(f"джерело {s.get('id')}: author — не рядок")
        if "archive" in s and not (isinstance(s["archive"], str) and re.fullmatch(r"https://web\.archive\.org/web/[0-9]{14}/https?://\S+", s["archive"])):
            errors.append(f"джерело {s.get('id')}: archive — не адреса знімка web.archive.org")
    if "uk" in marks:
        orphan = set(claim_ids) - marks["uk"]
        if orphan:
            warnings.append(f"твердження без виноски в тексті: {sorted(orphan, key=lambda x: int(x[1:]) if x and x[1:].isdigit() else 0)}")
    summary = (f"{meta.get('category', '?'):9} слів uk {wc.get('uk', 0):5} / en {wc.get('en', 0):5} · джерел {len(sources):3} · "
               f"тверджень {len(claims):3} (ok {counts['ok']}, one {counts['one']}, dis {counts['dis']})")
    return errors, warnings, summary


def main() -> int:
    only = set(sys.argv[1:])
    dirs = sorted(d for d in ROOT.iterdir() if d.is_dir() and (not only or d.name in only))
    bad = 0
    for d in dirs:
        errors, warnings, summary = check(d)
        print(f"{'✗' if errors else '✓'} {d.name:28} {summary}")
        for e in errors:
            print(f"    помилка: {e}")
        for w in warnings:
            print(f"    увага: {w}")
        bad += bool(errors)
    print(f"\nісторій: {len(dirs)}; з помилками: {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
