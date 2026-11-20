import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { StoriesFilter } from "@/components/stories/stories-filter";
import { StoryCard } from "@/components/stories/story-card";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { plural } from "@/lib/plural";
import { pageMetadata, siteUrl } from "@/lib/seo";
import { JsonLd } from "@/components/site/json-ld";
import { breadcrumbList } from "@/lib/jsonld";
import { getStoryList, type StoryCard as Card } from "@/lib/stories/content";
import { STORY_FILTERS, type StoryFilter } from "@/lib/stories/filters";

type Props = { params: Promise<{ lang: string }> };

const FROM = 1950;
const TO = 2026;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const n = getStoryList(lang).length;
  return pageMetadata({
    locale: lang,
    path: "/stories",
    title: dict.nav.stories,
    description: fill(plural(n, lang, dict.storiesPage.metaDescription), { n }),
  });
}

/** Мінімальна відстань між точками одного ряду, % ширини лінійки (1100 px: точка 24 px + підпис ~26 px → ≥ 33 px). */
const MIN_GAP = 3;

/**
 * Лінійка років: одна точка на рік (кілька історій року — одна точка з числом). Роки до 1950 (історія про витоки) —
 * на лівому краю зі своїм підписом. Ряд — жадібно: точка йде в той ряд, де до попередньої точки цього ряду не ближче
 * MIN_GAP; якщо тісно в обох — у той, де просторіше (code-review PR #36: 2019 і 2021 були в одному ряду за 29 px).
 */
function rulerPoints(cards: Card[]) {
  const byYear = new Map<number, Card[]>();
  for (const c of cards) if (c.year !== null) byYear.set(c.year, [...(byYear.get(c.year) ?? []), c]);
  const last = [-Infinity, -Infinity];
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, list]) => {
      const x = Math.min(100, Math.max(0, ((year - FROM) / (TO - FROM)) * 100));
      const row = x - last[0]! >= MIN_GAP ? 0 : x - last[1]! >= MIN_GAP ? 1 : x - last[0]! >= x - last[1]! ? 0 : 1;
      last[row] = x;
      return { year, list, row, x };
    });
}

export default async function StoriesPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const t = dict.storiesPage;
  const cards = getStoryList(lang);
  const featured = cards.find((c) => c.featured) ?? null;
  const rest = cards.filter((c) => c !== featured);
  const counts = Object.fromEntries(STORY_FILTERS.map((f) => [f, f === "all" ? cards.length : cards.filter((c) => c.category === f).length])) as Record<StoryFilter, number>;
  const points = rulerPoints(cards);
  const decades = Array.from({ length: Math.floor((TO - FROM) / 10) + 1 }, (_, i) => FROM + i * 10);
  const cardLabels = { meterLabel: t.meterLabel, meterKeys: t.meterKeys, category: t.category, read: t.read };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: dict.nav.stories,
    url: new URL(localizedPath("/stories", lang), siteUrl()).href,
    inLanguage: lang,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: cards.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: new URL(localizedPath(`/stories/${c.slug}`, lang), siteUrl()).href,
        name: c.title.full,
      })),
    },
  };

  return (
    <div className="st-page">
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbList(lang, [{ name: dict.nav.stories, path: "/stories" }])} />
      <section className="st-hero">
        <div className="wrap">
          <p className="st-stamp">{t.stamp}</p>
          <h1 className="display">
            {t.titleMain} <span>{t.titleAccent}</span>
          </h1>
          <p className="st-deck">{t.deck}</p>
        </div>
      </section>

      <section className="st-ruler-sec">
        <div className="wrap">
          <div className="st-ruler-scroll" tabIndex={0} role="region" aria-label={t.ruler}>
            <ol className="st-ruler" role="list">
              {points.map((p) => (
                <li key={p.year} className={p.row ? "st-rd st-rd-b" : "st-rd"} style={{ "--x": `${p.x}%` } as CSSProperties}>
                  {/* Назва посилання починається з видимого року (WCAG 2.5.3); назви історій — прихованим текстом. */}
                  <a href={`#story-${p.list[0]!.slug}`}>
                    <span className="st-rdot num" aria-hidden="true">
                      {p.list.length > 1 ? p.list.length : ""}
                    </span>
                    <span className="st-rlab num">{p.year}</span>
                    <span className="sr-only">: {p.list.map((c) => c.title.full).join("; ")}</span>
                  </a>
                </li>
              ))}
            </ol>
            <div className="st-axis" aria-hidden="true">
              {decades.map((d) => (
                <span key={d} className="num" style={{ "--x": `${((d - FROM) / (TO - FROM)) * 100}%` } as CSSProperties}>
                  {d}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="st-list-sec" aria-labelledby="st-list-h">
        <div className="wrap">
          <h2 id="st-list-h" className="sr-only">
            {dict.nav.stories}
          </h2>
          <StoriesFilter listId="st-list" counts={counts} locale={lang} labels={{ filtersLabel: t.filtersLabel, filters: t.filters, count: t.count, empty: t.empty }} />
          <div id="st-list" className="st-list">
            {featured && (
              <div className="st-feat-wrap" data-cat={featured.category}>
                <StoryCard c={featured} locale={lang} t={cardLabels} featured />
              </div>
            )}
            <ul className="st-grid" role="list">
              {rest.map((c) => (
                <li key={c.slug} data-cat={c.category}>
                  <StoryCard c={c} locale={lang} t={cardLabels} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
