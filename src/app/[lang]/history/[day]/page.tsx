import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/components/history/history.css";
import { JsonLd } from "@/components/site/json-ld";
import { locales, type Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getDayPage, getHistoryDays } from "@/lib/data/on-this-day";
import { breadcrumbList } from "@/lib/jsonld";
import { neighbours, parseDayKey } from "@/lib/on-this-day";
import { plural } from "@/lib/plural";
import { pageMetadata, siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ lang: string; day: string }> };

// Лише дні, в які щось сталося (гонка, народження чи смерть пілота): іншого — 404, без порожніх сторінок.
export const dynamicParams = false;

export async function generateStaticParams() {
  const days = await getHistoryDays();
  return locales.flatMap((lang) => days.map((day) => ({ lang, day })));
}

const load = async (props: Props) => {
  const { lang: raw, day } = await props.params;
  const lang = requireLocale(raw);
  const parts = parseDayKey(day);
  const [dict, page] = await Promise.all([getDictionary(lang), getDayPage(day, lang)]);
  if (!parts || !page) notFound();
  const t = dict.onThisDay;
  return { lang, key: day, t, page, label: `${parts.day} ${t.monthsGen[parts.month - 1]}` };
};

/** Підсумок дня простим текстом: «7 Гран-прі, 12 днів народження пілотів, 3 пілоти пішли з життя». */
function facts(lang: Locale, t: Awaited<ReturnType<typeof load>>["t"], n: { races: number; births: number; deaths: number }) {
  const out: string[] = [];
  if (n.races) out.push(`${n.races} ${plural(n.races, lang, t.racesN)}`);
  if (n.births) out.push(`${n.births} ${plural(n.births, lang, t.birthsN)}`);
  if (n.deaths) out.push(`${n.deaths} ${plural(n.deaths, lang, t.deathsN)}`);
  return out.join(", ");
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { lang, key, t, page, label } = await load(props);
  const summary = facts(lang, t, { races: page.races.length, births: page.births.length, deaths: page.deaths.length });
  return pageMetadata({
    locale: lang,
    path: `/history/${key}`,
    title: fill(t.dayTitle, { day: label }),
    description: fill(t.dayDescription, { day: label, facts: summary }),
  });
}

export default async function HistoryDayPage(props: Props) {
  const { lang, key, t, page, label } = await load(props);
  const path = (p: string) => localizedPath(p, lang);
  const title = fill(t.dayTitle, { day: label });
  const summary = facts(lang, t, { races: page.races.length, births: page.births.length, deaths: page.deaths.length });
  const days = await getHistoryDays();
  const near = neighbours(days, key)!;
  const labelOf = (k: string) => {
    const p = parseDayKey(k)!;
    return `${p.day} ${t.monthsGen[p.month - 1]}`;
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description: fill(t.dayDescription, { day: label, facts: summary }),
    inLanguage: lang,
    url: new URL(path(`/history/${key}`), siteUrl()).href,
    ...(page.races.length
      ? {
          mainEntity: {
            "@type": "ItemList",
            itemListElement: page.races.map((r, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: `${r.gp} ${r.year}`,
              url: new URL(path(`/seasons/${r.year}/${r.round}`), siteUrl()).href,
            })),
          },
        }
      : {}),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbList(lang, [{ name: t.title, path: "/history" }, { name: label, path: `/history/${key}` }])} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <div className="wrap">
          <a href={path("/history")}>{t.title}</a>
          <span className="sep" aria-hidden="true">/</span>
          <span aria-current="page">{label}</span>
        </div>
      </nav>
      <section className="sec oth">
        <div className="wrap">
          <div className="sec-head">
            <h1 className="display">{title}</h1>
          </div>
          <p className="oth-lead">{summary}.</p>

          {page.races.length > 0 && (
            <>
              <h2>{t.racesHeading}</h2>
              <p className="oth-note">{fill(t.racesNote, { day: label })}</p>
              <ol className="oth-list">
                {page.races.map((r) => (
                  <li key={`${r.year}/${r.round}`}>
                    <span className="oth-year">{r.year}</span>
                    <div className="oth-main">
                      <a href={path(`/seasons/${r.year}/${r.round}`)}>
                        {r.gp} {r.year}
                      </a>
                      <span className="oth-place">{r.place}</span>
                      <span className="oth-win">
                        {r.winners.length > 1 ? t.winners : t.winner}:{" "}
                        {r.winners.map((w, i) => (
                          <span key={w.slug}>
                            {i > 0 && ", "}
                            <a href={path(`/drivers/${w.slug}`)}>{w.name}</a>
                          </span>
                        ))}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}

          {page.births.length > 0 && (
            <>
              <h2>{t.birthsHeading}</h2>
              <ul className="oth-people">
                {page.births.map((p) => (
                  <li key={p.slug}>
                    <span className="oth-year">{p.year}</span>
                    <span>
                      <a href={path(`/drivers/${p.slug}`)}>{p.name}</a>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {page.deaths.length > 0 && (
            <>
              <h2>{t.deathsHeading}</h2>
              <ul className="oth-people">
                {page.deaths.map((p) => (
                  <li key={p.slug}>
                    <span className="oth-year">{p.year}</span>
                    <span>
                      <a href={path(`/drivers/${p.slug}`)}>{p.name}</a>
                      {p.age !== null && <span className="oth-age">{fill(plural(p.age, lang, t.yearsN), { n: p.age })}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="oth-note" style={{ marginTop: 28 }}>
            {t.sourceNote}
          </p>
          <nav className="oth-pager" aria-label={t.mapLabel}>
            <a href={path(`/history/${near.prev}`)} rel="prev">
              ← {t.prev}: {labelOf(near.prev)}
            </a>
            <a href={path("/history")}>{t.allDays}</a>
            <a href={path(`/history/${near.next}`)} rel="next">
              {t.next}: {labelOf(near.next)} →
            </a>
          </nav>
        </div>
      </section>
    </>
  );
}
