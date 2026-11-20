#!/usr/bin/env python3
"""SEO-аудит живого сайту: зразок сторінок кожного типу + усі розділи (обидві мови).

    python3 scripts/seo/audit.py [https://outlap.org] [--per-type 12] [--json out.json]

Перевіряє на кожній сторінці: статус, <title> і description (довжина), canonical (збігається з адресою), hreflang (en, uk,
x-default; взаємність), один <h1>, Open Graph (title, image), robots, JSON-LD (валідний JSON; типи; обов'язкові поля
SportsEvent/Person/Article; BreadcrumbList), <img> без alt, <html lang>. Між сторінками: дублікати title і description.
Не індексує нічого й нічого не змінює — лише читає. Без залежностей поза стандартною бібліотекою.
"""
import json
import random
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "https://outlap.org").rstrip("/")
PER_TYPE = int(sys.argv[sys.argv.index("--per-type") + 1]) if "--per-type" in sys.argv else 12
OUT = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None
random.seed(7)


def get(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "outlap-seo-audit/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, r.geturl(), r.read().decode("utf-8", "replace"), dict(r.headers)
    except Exception as e:  # noqa: BLE001
        code = getattr(e, "code", 0)
        return code, url, "", {}


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self._in_title = False
        self._title_done = False
        self._svg = 0
        self.meta = {}
        self.links = []
        self.h1 = 0
        self.ld = []
        self._in_ld = False
        self._ld_buf = ""
        self.img_no_alt = 0
        self.imgs = 0
        self.lang = None
        self.hrefs = set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.lang = a.get("lang")
        elif tag == "svg":
            self._svg += 1
        elif tag == "title" and not self._svg and not self._title_done:
            self._in_title = True
        elif tag == "meta":
            k = a.get("name") or a.get("property")
            if k:
                self.meta[k] = a.get("content", "")
        elif tag == "link":
            self.links.append(a)
        elif tag == "h1":
            self.h1 += 1
        elif tag == "img":
            self.imgs += 1
            if "alt" not in a:
                self.img_no_alt += 1
        elif tag == "script" and a.get("type") == "application/ld+json":
            self._in_ld = True
            self._ld_buf = ""
        elif tag == "a" and a.get("href"):
            self.hrefs.add(a["href"])

    def handle_endtag(self, tag):
        if tag == "svg" and self._svg:
            self._svg -= 1
        elif tag == "title" and self._in_title:
            self._in_title = False
            self._title_done = True
        elif tag == "script" and self._in_ld:
            self._in_ld = False
            self.ld.append(self._ld_buf)

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_ld:
            self._ld_buf += data


def ld_types(obj):
    out = []
    if isinstance(obj, dict):
        if "@type" in obj:
            t = obj["@type"]
            out += t if isinstance(t, list) else [t]
        for v in obj.values():
            out += ld_types(v)
    elif isinstance(obj, list):
        for v in obj:
            out += ld_types(v)
    return out


def find_nodes(obj, typ):
    res = []
    if isinstance(obj, dict):
        t = obj.get("@type")
        if t == typ or (isinstance(t, list) and typ in t):
            res.append(obj)
        for v in obj.values():
            res += find_nodes(v, typ)
    elif isinstance(obj, list):
        for v in obj:
            res += find_nodes(v, typ)
    return res


REQUIRED = {"SportsEvent": ["name", "startDate", "location"], "Person": ["name"], "Article": ["headline"], "SportsTeam": ["name"],
            "BreadcrumbList": ["itemListElement"], "WebSite": ["name", "url"]}


def check(url: str):
    status, final, html, _ = get(url)
    r = {"url": url, "status": status, "final": final, "issues": [], "info": {}}
    if status != 200:
        r["issues"].append(f"HTTP {status}")
        return r
    p = P()
    p.feed(html)
    title = p.title.strip()
    desc = p.meta.get("description", "").strip()
    r["info"] = {"title": title, "desc": desc, "bytes": len(html), "h1": p.h1, "imgs": p.imgs}
    if not title:
        r["issues"].append("нема <title>")
    elif len(title) > 65:
        r["issues"].append(f"title задовгий ({len(title)})")
    elif len(title) < 12:
        r["issues"].append(f"title закороткий ({len(title)})")
    if not desc:
        r["issues"].append("нема description")
    elif len(desc) > 170:
        r["issues"].append(f"description задовгий ({len(desc)})")
    elif len(desc) < 50:
        r["issues"].append(f"description закороткий ({len(desc)})")
    canon = next((l.get("href") for l in p.links if l.get("rel") == "canonical"), None)
    exp = final.rstrip("/") if final.rstrip("/") != BASE else final.rstrip("/")
    if not canon:
        r["issues"].append("нема canonical")
    elif canon.rstrip("/") != exp.rstrip("/"):
        r["issues"].append(f"canonical ≠ адреса ({canon})")
    alts = {l.get("hrefLang") or l.get("hreflang"): l.get("href") for l in p.links if l.get("rel") == "alternate" and (l.get("hrefLang") or l.get("hreflang"))}
    if not {"en", "uk", "x-default"} <= set(alts):
        r["issues"].append(f"hreflang неповний ({sorted(alts)})")
    r["info"]["alts"] = alts
    if p.h1 != 1:
        r["issues"].append(f"<h1> ×{p.h1}")
    if not p.meta.get("og:title") or not p.meta.get("og:image"):
        r["issues"].append("нема og:title/og:image")
    if not p.lang:
        r["issues"].append("нема <html lang>")
    if p.img_no_alt:
        r["issues"].append(f"<img> без alt ×{p.img_no_alt}")
    robots = p.meta.get("robots", "")
    r["info"]["robots"] = robots
    types = []
    for raw in p.ld:
        try:
            obj = json.loads(raw)
        except Exception:  # noqa: BLE001
            r["issues"].append("JSON-LD невалідний")
            continue
        types += ld_types(obj)
        for t, req in REQUIRED.items():
            for node in find_nodes(obj, t):
                miss = [k for k in req if not node.get(k)]
                if miss:
                    r["issues"].append(f"JSON-LD {t}: нема {miss}")
    r["info"]["ld"] = sorted(set(types))
    path = final.replace(BASE, "")
    is_home = path in ("", "/", "/uk")
    if is_home and not {"WebSite", "Organization"} <= set(types):
        r["issues"].append("головна без WebSite/Organization")
    if not is_home and "BreadcrumbList" not in types:
        r["issues"].append("нема BreadcrumbList")
    r["info"]["links"] = sorted(p.hrefs)
    return r


def sitemap_urls():
    _, _, xml, _ = get(BASE + "/sitemap.xml")
    return re.findall(r"<loc>([^<]+)</loc>", xml)


def detail_urls():
    """Сторінки-деталі беремо з посилань розділів: drivers/all, teams, circuits, seasons, stories (EN й UK)."""
    found = defaultdict(set)
    for lang in ("", "/uk"):
        for sect, pat in (("drivers/all", r'href="(/(?:uk/)?drivers/[a-z0-9-]+)"'), ("teams", r'href="(/(?:uk/)?teams/[a-z0-9-]+)"'),
                          ("circuits", r'href="(/(?:uk/)?circuits/[a-z0-9-]+)"'), ("seasons", r'href="(/(?:uk/)?seasons/\d{4})"'),
                          ("stories", r'href="(/(?:uk/)?stories/[a-z0-9-]+)"')):
            _, _, html, _ = get(f"{BASE}{lang}/{sect}")
            for m in re.findall(pat, html):
                if not m.endswith(("/all", "/credits")):
                    found[sect.split("/")[0]].add(m)
    # гонки: /seasons/<рік>/<етап> із сторінок сезонів
    races = set()
    for s in list(found["seasons"])[:40]:
        _, _, html, _ = get(BASE + s)
        races |= set(re.findall(r'href="(/(?:uk/)?seasons/\d{4}/\d+)"', html))
    found["races"] = races
    return found


def main():
    sm = sitemap_urls()
    print(f"sitemap: {len(sm)} URL")
    det = detail_urls()
    sample = list(sm)
    for kind, urls in det.items():
        urls = sorted(urls)
        pick = random.sample(urls, min(PER_TYPE, len(urls)))
        print(f"  {kind}: знайдено {len(urls)} адрес, у вибірці {len(pick)}")
        sample += [BASE + u for u in pick]
    sample = list(dict.fromkeys(sample))
    with ThreadPoolExecutor(8) as ex:
        results = list(ex.map(check, sample))

    by_issue = Counter()
    for r in results:
        for i in r["issues"]:
            by_issue[re.sub(r"\(.*?\)|\[.*?\]|×\d+|\d+", "N", i)] += 1
    titles = defaultdict(list)
    descs = defaultdict(list)
    for r in results:
        if r["status"] == 200:
            titles[r["info"]["title"]].append(r["url"])
            descs[r["info"]["desc"]].append(r["url"])
    dup_t = {t: u for t, u in titles.items() if len(u) > 1 and t}
    dup_d = {d: u for d, u in descs.items() if len(u) > 1 and d}
    ld_by_path = defaultdict(Counter)
    for r in results:
        if r["status"] == 200:
            kind = re.sub(r"^/(uk/)?", "", re.sub(BASE, "", r["url"])).split("/")[0] or "home"
            ld_by_path[kind].update(r["info"]["ld"] or ["(нема)"])

    print(f"\nперевірено {len(results)} сторінок; без зауважень: {sum(1 for r in results if not r['issues'])}")
    print("\n== зауваження (кількість сторінок)")
    for k, v in by_issue.most_common():
        print(f"  {v:4}  {k}")
    print("\n== приклади")
    shown = Counter()
    for r in results:
        for i in r["issues"]:
            k = re.sub(r"\(.*?\)|\[.*?\]|×\d+|\d+", "N", i)
            if shown[k] < 2:
                shown[k] += 1
                print(f"  {i}  ← {r['url'].replace(BASE, '')}")
    print(f"\n== дублікати title: {len(dup_t)}; description: {len(dup_d)}")
    for t, u in list(dup_t.items())[:5]:
        print(f"  «{t[:70]}» ×{len(u)}: {', '.join(x.replace(BASE, '') for x in u[:3])}")
    print("\n== JSON-LD за типом сторінки")
    for kind, c in sorted(ld_by_path.items()):
        print(f"  {kind:10} {dict(c)}")
    robots = Counter(r["info"].get("robots", "") for r in results if r["status"] == 200)
    print("\n== meta robots:", dict(robots))
    if OUT:
        with open(OUT, "w") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
