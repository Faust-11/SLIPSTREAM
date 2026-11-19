"""Знімок джерел новин для unit/e2e (фаза 4a): RSS трьох видань, метадані статей formula1.com (og:image + JSON-LD
datePublished — у стрічці їх немає) і стрічки 11 акаунтів Bluesky. Пише в e2e/fixtures/news/; тести читають знімок
замість мережі (NEWS_FIXTURES=1). Запуск: python3 scripts/news/snapshot_fixtures.py"""
import json
import pathlib
import re
import time
import urllib.request

OUT = pathlib.Path(__file__).resolve().parents[2] / "e2e" / "fixtures" / "news"
UA = "Mozilla/5.0 (compatible; OutlapBot/0.1; +https://outlap.org)"
RSS = {
    "f1": "https://www.formula1.com/en/latest/all.xml",
    "motorsport": "https://www.motorsport.com/rss/f1/news/",
    "autosport": "https://www.autosport.com/rss/f1/news/",
}
BSKY = [
    "adamcooperf1.bsky.social", "andrewbensonf1.bsky.social", "chrismedlandf1.bsky.social", "danielmoxon.bsky.social",
    "elizablackstock.bsky.social", "joesaward.bsky.social", "keithcollantine.bsky.social", "peterdwindsor.bsky.social",
    "planetf1com.bsky.social", "racefans.net", "rorymitchellf1.bsky.social",
]


def get(url: str, tries: int = 3) -> bytes:
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=20) as r:
                body = r.read()
                if body:
                    return body
        except Exception:  # noqa: BLE001 — знімок: повтор і далі
            if i == tries - 1:
                raise
        time.sleep(1.5)
    raise RuntimeError(f"порожня відповідь: {url}")


def slim(feed: dict) -> dict:
    """Лише поля, які читає src/lib/data/news.ts (аватари, embed, viewer — ні): фікстура ~10× менша."""
    out = []
    for item in feed.get("feed", []):
        p = item["post"]
        a = p.get("author", {})
        r = p.get("record", {})
        x = {"post": {
            "uri": p.get("uri"),
            "author": {"handle": a.get("handle"), "displayName": a.get("displayName"),
                       "labels": [{"val": l.get("val")} for l in a.get("labels") or []]},
            "record": {"text": r.get("text"), "createdAt": r.get("createdAt"), **({"reply": True} if r.get("reply") else {})},
            "indexedAt": p.get("indexedAt"),
        }}
        if "reason" in item:
            x["reason"] = {"$type": item["reason"].get("$type")}
        out.append(x)
    return {"feed": out}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for key, url in RSS.items():
        (OUT / f"rss-{key}.xml").write_bytes(get(url))
    # formula1.com: лише og:image і datePublished кожної статті (сторінки по ~650 КБ — у фікстуру не кладемо).
    f1 = (OUT / "rss-f1.xml").read_text("utf-8")
    meta = {}
    for link in re.findall(r"<item\b.*?<link>(.*?)</link>", f1, re.S):
        html = get(link.strip()).decode("utf-8", "replace")
        img = re.search(r'<meta property="og:image" content="([^"]+)"', html)
        date = re.search(r'"datePublished":"([^"]+)"', html)
        meta[link.strip()] = {"image": img.group(1) if img else None, "date": date.group(1) if date else None}
        time.sleep(0.5)
    (OUT / "f1-articles.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False) + "\n", "utf-8")
    feeds = {}
    for h in BSKY:
        url = f"https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor={h}&limit=30&filter=posts_no_replies"
        feeds[h] = slim(json.loads(get(url)))
        time.sleep(0.5)
    (OUT / "bsky.json").write_text(json.dumps(feeds, ensure_ascii=False) + "\n", "utf-8")
    print("знімок:", sorted(p.name for p in OUT.iterdir()), "; статей F1:", len(meta),
          "; постів Bluesky:", sum(len(f.get("feed", [])) for f in feeds.values()))


if __name__ == "__main__":
    main()
