import type { Metadata } from "next";
import { termLabels } from "@/lib/glossary/labels";
import { cache } from "react";
import { DecadeSpy } from "@/components/seasons/decade-spy";
import { Meter } from "@/components/stories/meter";
import { StoryBody } from "@/components/stories/story-body";
import { StoryCard } from "@/components/stories/story-card";
import { PageCredits } from "@/components/teams/page-credits";
import { locales, type Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { circuitPath } from "@/lib/circuit-math";
import { getSeasonPage } from "@/lib/data/season-page";
import { pageMetadata, siteUrl } from "@/lib/seo";
import { getStory, getStorySlugs } from "@/lib/stories/content";

type Props = { params: Promise<{ lang: string; slug: string }> };

// 33 історії × 2 мови — статично; невідомий slug — 404 без рендеру на запит (правило проєкту).
export const dynamicParams = false;
export function generateStaticParams() {
  return locales.flatMap((lang) => getStorySlugs().map((slug) => ({ lang, slug })));
}

const dayFmt = {
  uk: new Intl.DateTimeFormat("uk", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
};
const day = (iso: string, lang: Locale) => dayFmt[lang].format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

/** Факти банера з бази: Гран-прі, етап «N з M», дата, траса — за race / links.races[0] історії. */
const raceFacts = cache(async (year: number, round: number, lang: Locale) => {
  const season = await getSeasonPage(year, lang);
  const rounds = (season?.calendar ?? []).filter((r) => !r.cancelled && r.round !== null);
  const r = rounds.find((x) => x.round === round);
  return r ? { gp: r.gp, round, total: rounds.length, date: r.date, place: r.place, circuit: r.circuit } : null;
});

async function load(props: Props) {
  const { lang: raw, slug } = await props.params;
  const lang = requireLocale(raw);
  const story = getStory(slug, lang);
  if (!story) throw new Error(`Історія ${slug}: немає в content/stories`);
  const dict = await getDictionary(lang);
  const facts = story.race ? await raceFacts(story.race.year, story.race.round, lang) : null;
  return { lang, story, dict, facts };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { lang, story } = await load(props);
  return pageMetadata({
    locale: lang,
    path: `/stories/${story.slug}`,
    title: story.title.full,
    description: story.dek,
    image: story.hero ? { src: story.hero.src, alt: story.hero.alt } : undefined,
    article: { modified: story.checked },
  });
}

export default async function StoryPageRoute(props: Props) {
  const { lang, story, dict, facts } = await load(props);
  const t = dict.storiesPage;
  const path = (p: string) => localizedPath(p, lang);
  const hero = story.hero;
  const title = story.title.full;
  const stamp = [story.kicker ?? t.category[story.category], facts ? `${facts.gp} ${story.race!.year}` : null].filter(Boolean).join(" · ");
  const bodyLabels = { status: t.status, fnLabel: t.fnLabel, term: termLabels(lang, dict.glossary.more) };
  const cardLabels = { meterLabel: t.meterLabel, meterKeys: t.meterKeys, category: t.category, read: t.read };
  const toc = [
    ...story.toc,
    ...(story.disputes.length ? [{ id: "disputed", text: t.disputedToc }] : []),
    { id: "sources", text: t.sources },
  ];
  const credits = Object.values(story.media).map((m) => ({ label: m.caption, href: m.credit.page, author: m.credit.author, license: m.credit.license }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: story.dek,
    inLanguage: lang,
    url: new URL(path(`/stories/${story.slug}`), siteUrl()).href,
    ...(hero ? { image: new URL(hero.src, siteUrl()).href } : {}),
    ...(story.checked ? { dateModified: story.checked } : {}),
    author: { "@type": "Organization", name: "Slipstream" },
    publisher: { "@type": "Organization", name: "Slipstream" },
    citation: story.sources.map((s) => ({ "@type": "CreativeWork", name: s.title, url: s.url, ...(s.publisher ? { publisher: s.publisher } : {}) })),
  };

  return (
    <div className="st-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className={hero ? "st-hero st-s-hero has-photo" : "st-hero st-s-hero"}>
        <div className="wrap">
          <div className="st-s-hero-txt">
            <nav className="st-crumbs" aria-label={t.crumbs}>
              <a href={path("/stories")}>{dict.nav.stories}</a>
              {story.year !== null && (
                <>
                  <span aria-hidden="true"> › </span>
                  <span className="num">{story.year}</span>
                </>
              )}
            </nav>
            <p className="st-stamp">{stamp}</p>
            <h1 className="display">
              {story.title.main}
              {story.title.accent && (
                <>
                  <span className="sr-only">: </span>
                  <span>{story.title.accent}</span>
                </>
              )}
            </h1>
            <p className="st-deck">{story.dek}</p>
            <dl className="st-facts">
              {facts && (
                <>
                  <div>
                    <dt>{t.facts.race}</dt>
                    <dd>
                      <a href={path(`/seasons/${story.race!.year}/${story.race!.round}`)}>{fill(t.facts.raceValue, { gp: facts.gp, n: facts.round, total: facts.total })}</a>
                    </dd>
                  </div>
                  {facts.date && (
                    <div>
                      <dt>{t.facts.date}</dt>
                      <dd>{day(facts.date, lang)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{t.facts.circuit}</dt>
                    <dd>{facts.circuit ? <a href={path(circuitPath(facts.circuit))}>{facts.place}</a> : facts.place}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>{t.facts.read}</dt>
                <dd className="num">{fill(t.minutes, { n: story.minutes })}</dd>
              </div>
              {!facts && (
                // Історія не про одну гонку: замість фактів гонки — обсяг перевірки (без 3/4 порожнього рядка).
                <>
                  <div>
                    <dt>{t.sources}</dt>
                    <dd className="num">{story.sources.length}</dd>
                  </div>
                  <div>
                    <dt>{t.facts.claims}</dt>
                    <dd className="num">{story.meter.total}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>
          {hero && (
            <figure className="st-s-hero-ph">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hero.src}
                srcSet={hero.srcSet}
                sizes="(width <= 900px) 100vw, 50vw"
                width={hero.width}
                height={hero.height}
                alt={hero.alt}
                fetchPriority="high"
                decoding="async"
                style={hero.focus ? { objectPosition: hero.focus } : undefined}
              />
              <figcaption>{hero.caption}</figcaption>
            </figure>
          )}
        </div>
      </section>

      <div className="wrap st-s-grid">
        <aside className="st-side">
          <Meter m={story.meter} locale={lang} t={cardLabels} />
          {story.checked && <p className="st-mnote">{fill(t.checked, { date: day(story.checked, lang) })}</p>}
          <nav id="st-toc" className="st-toc" aria-label={t.toc}>
            <ol role="list">
              {toc.map((c) => (
                <li key={c.id}>
                  <a href={`#${c.id}`}>{c.text}</a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
        <article className="st-body">
          <StoryBody story={story} t={bodyLabels} />
          {story.disputes.length > 0 && (
            <section id="disputed" className="st-ch" tabIndex={-1} aria-labelledby="disputed-h">
              <h2 id="disputed-h" className="display">
                {t.disputed}
              </h2>
              <div className="st-dzs">
                {story.disputes.map((d) => (
                  <div key={d.id} className="st-dz">
                    <b>{d.label}</b>
                    <p>
                      {d.reader}{" "}
                      <span className="st-dz-src num">
                        [{d.sources.map((n, i) => (
                          <span key={n}>
                            {i > 0 && ", "}
                            <a href={`#s${n}`} aria-label={fill(t.fnLabel, { n })}>
                              {n}
                            </a>
                          </span>
                        ))}]
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section id="sources" className="st-ch" tabIndex={-1} aria-labelledby="sources-h">
            <h2 id="sources-h" className="display">
              {t.sources}
            </h2>
            <p className="st-note">{t.sourcesNote}</p>
            <ol className="st-srcs">
              {story.sources.map((s) => (
                <li key={s.n} id={`s${s.n}`} tabIndex={-1}>
                  <a href={s.url} rel="noopener" translate="no">
                    {[s.publisher, s.date].filter(Boolean).join(", ")}: {lang === "uk" ? `«${s.title}»` : `“${s.title}”`}
                    {s.author ? ` (${s.author})` : ""}
                  </a>
                </li>
              ))}
            </ol>
          </section>
        </article>
      </div>
      <DecadeSpy navId="st-toc" />

      {story.related.length > 0 && (
        <section className="st-more" aria-labelledby="st-more-h">
          <div className="wrap">
            <div className="st-sec-head">
              <h2 id="st-more-h" className="display">
                {t.more}
              </h2>
              <a href={path("/stories")}>{t.allLink}</a>
            </div>
            <ul className="st-grid st-grid-more" role="list">
              {story.related.map((c) => (
                <li key={c.slug}>
                  <StoryCard c={c} locale={lang} t={cardLabels} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <PageCredits groups={[{ title: t.creditsPhotos, items: credits }]} />
    </div>
  );
}

