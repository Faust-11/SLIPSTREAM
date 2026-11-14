import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { cache } from "react";
import { PageCredits } from "@/components/teams/page-credits";
import { locales, type Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { circuitSlug } from "@/lib/circuit-math";
import { circuitBySlug, FASTEST_LAP_FROM, getCircuitPage, getCircuitRefs } from "@/lib/data/circuits";
import type { SeasonDriver, SeasonTeamRef } from "@/lib/data/season-page";
import { plural } from "@/lib/plural";
import { lapTime } from "@/lib/race-math";
import { pageMetadata, siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ lang: string; slug: string }> };

// 78 трас × 2 мови — статично; невідомий slug — 404 без рендеру на запит (правило проєкту, без notFound()).
export const dynamicParams = false;
export async function generateStaticParams() {
  const refs = await getCircuitRefs();
  return locales.flatMap((lang) => refs.map((ref) => ({ lang, slug: circuitSlug(ref) })));
}

const fmt = { uk: new Intl.NumberFormat("uk"), en: new Intl.NumberFormat("en") };
const kmFmt = { uk: new Intl.NumberFormat("uk", { minimumFractionDigits: 3 }), en: new Intl.NumberFormat("en", { minimumFractionDigits: 3 }) };
const dayFmt = {
  uk: new Intl.DateTimeFormat("uk", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
};
const monthFmt = {
  uk: new Intl.DateTimeFormat("uk", { month: "long", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
};
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** «2009-10-30» → «30 жовтня 2009 р.», «2009-10» → «жовтень 2009 р.», «1922» → «1922». */
function openedText(iso: string, lang: Locale): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return dayFmt[lang].format(utc(iso));
  if (/^\d{4}-\d{2}$/.test(iso)) return monthFmt[lang].format(utc(`${iso}-01`));
  return iso;
}

const pageData = cache(async (slug: string, lang: Locale) => {
  const ref = await circuitBySlug(slug);
  const page = ref ? await getCircuitPage(ref, lang) : null;
  if (!page) throw new Error(`Траса ${slug}: немає в f1.circuit_index`);
  return page;
});

async function load(props: Props) {
  const { lang: raw, slug } = await props.params;
  const lang = requireLocale(raw);
  return { lang, page: await pageData(slug, lang), dict: await getDictionary(lang) };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { lang, page, dict } = await load(props);
  return pageMetadata({
    locale: lang,
    path: `/circuits/${page.slug}`,
    title: `${page.short} — ${page.name}`,
    description: fill(dict.circuitPage.metaDescription, { name: page.name, place: [page.place, page.country].filter(Boolean).join(", "), n: page.strip.races }),
  });
}

function DriverLink({ d, lang, short = false }: { d: SeasonDriver; lang: Locale; short?: boolean }) {
  return <a href={localizedPath(`/drivers/${d.slug}`, lang)}>{short ? d.short : d.name}</a>;
}
function TeamLink({ tm, lang }: { tm: SeasonTeamRef; lang: Locale }) {
  return (
    <a className="ct-team" href={localizedPath(`/teams/${tm.id}`, lang)} translate="no">
      {tm.name}
    </a>
  );
}
function Avatar({ d, size = 28 }: { d: SeasonDriver; size?: number }) {
  return d.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="ct-av" src={d.avatar} width={size} height={size} alt="" loading="lazy" decoding="async" />
  ) : (
    <span className="ct-av ct-ini" aria-hidden="true" style={{ width: size, height: size }}>
      {d.initials}
    </span>
  );
}

/** Рейтинг «найуспішніші тут» — одна серія, смуги від спільної базової лінії, значення текстом (настанова dataviz). */
function Ranking({ title, id, rows, more, lang }: { title: string; id: string; rows: { key: string; label: ReactNode; n: number }[]; more: string | null; lang: Locale }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="ct-rank">
      <h3 className="ct-lab" id={id}>
        {title}
      </h3>
      <ol aria-labelledby={id}>
        {rows.map((r) => (
          <li key={r.key} style={{ "--w": `${(r.n / max) * 100}%` } as CSSProperties}>
            <span className="ct-rank-n">{r.label}</span>
            <span className="ct-bar" aria-hidden="true">
              <i />
            </span>
            <b className="num">{fmt[lang].format(r.n)}</b>
          </li>
        ))}
      </ol>
      {more && <p className="ct-rank-more">{more}</p>}
    </div>
  );
}

export default async function CircuitPageView(props: Props) {
  const { lang, page, dict } = await load(props);
  const t = dict.circuitPage;
  const n = (v: number) => fmt[lang].format(v);
  const path = (p: string) => localizedPath(p, lang);
  const joinNodes = (nodes: ReactNode[], sep = ", ") => nodes.flatMap((x, i) => (i ? [sep, x] : [x]));
  const f = page.facts;
  const gpLine = page.gp
    ? page.gp.ongoing
      ? fill(t.since, { gp: page.gp.name, year: page.gp.from })
      : page.gp.from === page.gp.to
        ? fill(t.once, { gp: page.gp.name, year: page.gp.from })
        : fill(t.span, { gp: page.gp.name, from: page.gp.from, to: page.gp.to })
    : null;
  const finales = page.strip.finales;
  const moreText = (m: { count: number; n: number } | null) => (m ? fill(t.rankMore, { count: m.count, n: m.n }) : null);
  const hasFastest = page.races.some((r) => r.fastest);
  const anyCurrent = page.races.some((r) => r.current);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: page.name,
    url: new URL(path(`/circuits/${page.slug}`), siteUrl()).href,
    // addressCountry — код ISO 3166-1 (рекомендація schema.org), не локалізована назва; координати — з бази (рев'ю 13.11).
    address: { "@type": "PostalAddress", addressLocality: page.place, ...(page.geo.country ? { addressCountry: page.geo.country } : {}) },
    ...(page.geo.lat !== null && page.geo.lng !== null ? { geo: { "@type": "GeoCoordinates", latitude: page.geo.lat, longitude: page.geo.lng } } : {}),
  };
  // Рекорд кола — на дві колонки лише з початку ряду (інакше дірка в сітці; grid-auto-flow: dense міняв порядок
  // читання відносно DOM — рев'ю 13.11).
  const beforeRecord = f ? [page.firstGp !== null, f.laps !== null, f.turns !== null].filter(Boolean).length : 0;
  const recordWide = beforeRecord % 3 === 0;
  const layoutNote = f?.layoutYears
    ? f.layoutYears.to === null
      ? fill(t.layoutSince, { year: f.layoutYears.from })
      : f.layoutYears.from === f.layoutYears.to
        ? fill(t.layoutYear, { year: f.layoutYears.from })
        : fill(t.layoutSpan, { from: f.layoutYears.from, to: f.layoutYears.to })
    : f?.layoutName
      ? fill(t.layoutName, { name: f.layoutName })
      : null;

  return (
    <div className="ct-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="crumbs ct-crumbs" aria-label="Breadcrumb">
        <div className="wrap">
          <a href={path("/circuits")}>{t.crumbs}</a>
          <span className="sep" aria-hidden="true">
            /
          </span>
          <span aria-current="page">{page.short}</span>
        </div>
      </nav>

      <section className={page.hero ? "ct-hero has-photo" : "ct-hero"}>
        {page.hero ? (
          // Банер — LCP: без lazy, fetchpriority=high (настанова «Optimize image priority»).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.hero.src}
            srcSet={page.hero.srcSet}
            sizes="100vw"
            width={page.hero.width}
            height={page.hero.height}
            alt=""
            fetchPriority="high"
            decoding="async"
            style={{ objectPosition: page.hero.focus }}
          />
        ) : (
          page.layout && (
            // Та сама орієнтація, що й схема нижче (рев'ю PR #21: у банері була північ угорі, а схема — повернута).
            <svg className="ct-hero-lay" viewBox={`-40 -40 ${page.layout.page.w + 80} ${page.layout.page.h + 80}`} aria-hidden="true" focusable="false" preserveAspectRatio="xMaxYMid meet">
              <path d={page.layout.page.d} />
            </svg>
          )
        )}
        <div className="wrap">
          {page.next && (
            <span className="ct-stamp">{fill(t.nextRace, { date: page.next.date ? dayFmt[lang].format(utc(page.next.date)) : page.next.season, round: page.next.round })}</span>
          )}
          <h1 className="display">
            {page.short}
            <span translate="no">{page.name}</span>
          </h1>
          {/* Місце — якщо відрізняється від короткої назви («Абу-Дабі, ОАЕ»; у Монци — лише «Італія»). */}
          <p>{[[page.place !== page.short ? page.place : null, page.country].filter(Boolean).join(", "), gpLine].filter(Boolean).join(" · ")}</p>
        </div>
      </section>

      <section className="ct-sec" aria-label={t.factsLabel}>
        <div className={page.layout ? "wrap ct-circ" : "wrap ct-circ no-map"}>
          {page.layout && (
            <figure className="ct-map">
              {/* Детальна схема, повернута під горизонтальну рамку (відгук користувача 14.11: вузька вертикальна схема
                  займала третину ширини). */}
              <svg
                viewBox={`-40 -40 ${page.layout.page.w + 80} ${page.layout.page.h + 80}`}
                role="img"
                aria-label={fill(dict.circuitsPage.layoutLabel, { name: page.name })}
              >
                <path className="casing" d={page.layout.page.d} />
                <path className="line" d={page.layout.page.d} />
              </svg>
              <figcaption>{page.layout.source === "commons" ? t.layoutCaptionCommons : t.layoutCaption}</figcaption>
            </figure>
          )}
          <div className="ct-stats">
            {f ? (
              <>
                {f.lengthKm !== null && (
                  <div className="ct-big">
                    <span className="ct-lab">{t.length}</span>
                    <b className="num">
                      {kmFmt[lang].format(f.lengthKm)}
                      <small>{t.km}</small>
                    </b>
                    {layoutNote && (
                      <span className="ct-note" translate={f.layoutYears ? undefined : "no"}>
                        {layoutNote}
                      </span>
                    )}
                  </div>
                )}
                <dl className="ct-grid3">
                  {page.firstGp !== null && (
                    <div>
                      <dt>{t.firstGp}</dt>
                      <dd className="num">{page.firstGp}</dd>
                    </div>
                  )}
                  {f.laps !== null && (
                    <div>
                      <dt>{t.laps}</dt>
                      <dd className="num">{n(f.laps)}</dd>
                    </div>
                  )}
                  {f.turns !== null && (
                    <div>
                      <dt>{t.turns}</dt>
                      <dd className="num">{n(f.turns)}</dd>
                    </div>
                  )}
                  {f.record && (
                    <div className={recordWide ? "span2" : undefined}>
                      <dt>{t.record}</dt>
                      <dd>
                        <b className="num">{lapTime(f.record.ms)}</b>
                        <span className="ct-who">
                          <DriverLink d={f.record.driver} lang={lang} /> <span className="num">{f.record.year}</span>
                        </span>
                      </dd>
                    </div>
                  )}
                  {f.distanceKm !== null && (
                    <div>
                      <dt>{t.distance}</dt>
                      <dd className="num">
                        ≈{new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(f.distanceKm)}
                        <small>{t.km}</small>
                      </dd>
                    </div>
                  )}
                  {f.opened && (
                    <div>
                      <dt>{t.opened}</dt>
                      <dd className="txt">{openedText(f.opened, lang)}</dd>
                    </div>
                  )}
                  {f.architects.length > 0 && (
                    <div>
                      <dt>{t.architect}</dt>
                      <dd className="txt" translate="no">
                        {f.architects.join(", ")}
                      </dd>
                    </div>
                  )}
                  {f.capacity !== null && (
                    <div>
                      <dt>{t.capacity}</dt>
                      <dd className="num">{n(f.capacity)}</dd>
                    </div>
                  )}
                </dl>
                {f.source && (
                  <p className="ct-src">
                    {fill(t.factsSource, { title: f.source.title })}{" "}
                    <a href={f.source.href} rel="noopener">
                      {t.factsSourceLink}
                    </a>
                  </p>
                )}
                {/* Кола — з бази; дистанція — кола з бази × довжина з Вікіпедії: згадуємо, лише коли вона є (рев'ю PR #21). */}
                {f.laps !== null && <p className="ct-src">{f.distanceKm !== null ? t.factsDbDistance : t.factsDb}</p>}
              </>
            ) : (
              <p className="ct-src">{t.noFacts}</p>
            )}
          </div>
        </div>
      </section>

      <section className="ct-strip" aria-label={t.strip.label}>
        <dl className="wrap">
          <div>
            <dt>{t.strip.races}</dt>
            <dd className="num">{n(page.strip.races)}</dd>
          </div>
          <div>
            <dt>{t.strip.winners}</dt>
            <dd className="num">{n(page.strip.winners)}</dd>
          </div>
          <div>
            <dt>{t.strip.fromPole}</dt>
            <dd className="num">{n(page.strip.fromPole)}</dd>
          </div>
          {page.strip.furthest && (
            <div>
              <dt>{fill(t.strip.furthest, { year: page.strip.furthest.year })}</dt>
              <dd className="num">P{page.strip.furthest.grid}</dd>
            </div>
          )}
          <div>
            <dt>{t.strip.finales}</dt>
            <dd className="num">{n(finales)}</dd>
          </div>
          <div className="hi">
            <dt>{t.strip.titles}</dt>
            <dd className="num">{n(page.strip.titles)}</dd>
          </div>
        </dl>
      </section>

      <section className="ct-sec" aria-labelledby="ct-races-h">
        <div className="wrap">
          <div className="ct-head">
            <h2 className="display" id="ct-races-h">
              {t.racesTitle}
            </h2>
            {page.gp && page.gpNames === 1 && (
              <p className="ct-sub">{page.gp.from === page.gp.to ? `${page.gp.name} · ${page.gp.from}` : `${page.gp.name} · ${page.gp.from}–${page.gp.to}`}</p>
            )}
          </div>
          <div className="ct-tbl" role="region" aria-labelledby="ct-races-cap" tabIndex={0}>
            <table>
              <caption id="ct-races-cap">{t.racesCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.col.year}</th>
                  <th scope="col">{t.col.winner}</th>
                  <th scope="col" className="ct-r">
                    {t.col.grid}
                  </th>
                  <th scope="col" className="ct-hide-s">
                    {t.col.pole}
                  </th>
                  {hasFastest && (
                    <th scope="col" className="ct-hide-s">
                      {t.col.fastest}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {page.races.map((r) => (
                  <tr key={`${r.year}-${r.round}`} className={r.current ? "cur" : undefined}>
                    <th scope="row" className="ct-ty num">
                      <a href={path(`/seasons/${r.year}/${r.round}`)} aria-label={`${r.gp} ${r.year}`}>
                        {r.year}
                      </a>
                    </th>
                    <td>
                      <span className="ct-drv">
                        {r.winners[0] && <Avatar d={r.winners[0]} />}
                        <span className="ct-drv-n">
                          <span>{joinNodes(r.winners.map((w) => <DriverLink key={w.id} d={w} lang={lang} />), " / ")}</span>
                          {r.winners[0]?.team && <TeamLink tm={r.winners[0].team} lang={lang} />}
                        </span>
                        {r.title && <span className="ct-badge">{t.titleBadge}</span>}
                      </span>
                    </td>
                    <td className="ct-r num">{r.grid ? `P${r.grid}` : "—"}</td>
                    <td className="ct-hide-s">{r.poles.length ? joinNodes(r.poles.map((car) => <span key={car[0]!.id}>{joinNodes(car.map((p) => <DriverLink key={p.id} d={p} lang={lang} short />), " / ")}</span>)) : "—"}</td>
                    {hasFastest && (
                      <td className="ct-hide-s">
                        {r.fastest ? (
                          <span className="ct-fl">
                            <DriverLink d={r.fastest.driver} lang={lang} short /> <span className="num">{lapTime(r.fastest.ms)}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ct-key">
            {anyCurrent && (
              <span>
                <i className="k-cur" aria-hidden="true" />
                {page.onCalendar ? t.currentKey : t.layoutKey}
              </span>
            )}
            {page.strip.titles > 0 && (
              <span>
                <span className="ct-badge">{t.titleBadge}</span> {t.titleKey}
              </span>
            )}
            {hasFastest && page.races.some((r) => r.year < FASTEST_LAP_FROM) && <span>{fill(t.fastestNote, { year: FASTEST_LAP_FROM })}</span>}
          </p>
        </div>
      </section>

      {page.titles.length > 0 && (
        <section className="ct-sec" aria-labelledby="ct-titles-h">
          <div className="wrap">
            <div className="ct-head">
              <h2 className="display" id="ct-titles-h">
                {t.titlesTitle}
              </h2>
              <p className="ct-sub">
                {/* n — титули, вирішені саме у фіналі (code-review 13.11: «12 з 6 фіналів» у Сузуки); решта — окремо. */}
                {finales > 0 ? fill(plural(finales, lang, t.titlesSub), { n: page.strip.finaleTitles, f: finales }) : t.titlesSubNoFinals}
                {finales > 0 && page.titles.length > page.strip.finaleTitles && ` ${fill(t.titlesEarlier, { n: page.titles.length - page.strip.finaleTitles })}`}
              </p>
            </div>
            <ul className="ct-decs">
              {page.titles.map((tt) => (
                <li key={tt.year} className="ct-dec">
                  <a className="ct-y num" href={path(`/seasons/${tt.year}/${tt.round}`)}>
                    {tt.year}
                  </a>
                  <span className="ct-ent">
                    <Avatar d={tt.champion} size={36} />
                    <DriverLink d={tt.champion} lang={lang} />
                  </span>
                  <p>
                    <b>{t.before}</b>
                    {tt.before.map((x, i) => (
                      <span key={x.driver.id}>
                        {i > 0 && " · "}
                        {x.driver.short} <span className="num">{n(x.points)}</span>
                      </span>
                    ))}
                  </p>
                  <p>
                    <b>{t.after}</b>
                    {tt.after.slice(0, 2).map((x, i) => (
                      <span key={x.driver.id}>
                        {i > 0 && " · "}
                        {x.driver.short} <em className="num">{n(x.points)}</em>
                      </span>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {page.leaders.drivers.rows.length > 0 && (
        <section className="ct-sec" aria-labelledby="ct-lead-h">
          <div className="wrap">
            <div className="ct-head">
              <h2 className="display" id="ct-lead-h">
                {t.leadersTitle}
              </h2>
            </div>
            <div className="ct-lead3">
              <Ranking
                title={t.driverWins}
                id="ct-rk-w"
                lang={lang}
                rows={page.leaders.drivers.rows.map((x) => ({ key: x.driver.id, n: x.n, label: <DriverLink d={x.driver} lang={lang} short /> }))}
                more={moreText(page.leaders.drivers.more)}
              />
              <Ranking
                title={t.teamWins}
                id="ct-rk-t"
                lang={lang}
                rows={page.leaders.teams.rows.map((x) => ({ key: x.team.id, n: x.n, label: <TeamLink tm={x.team} lang={lang} /> }))}
                more={moreText(page.leaders.teams.more)}
              />
              <Ranking
                title={t.podiums}
                id="ct-rk-p"
                lang={lang}
                rows={page.leaders.podiums.rows.map((x) => ({ key: x.driver.id, n: x.n, label: <DriverLink d={x.driver} lang={lang} short /> }))}
                more={moreText(page.leaders.podiums.more)}
              />
            </div>
          </div>
        </section>
      )}

      <PageCredits
        groups={[
          { title: t.credits, items: page.credits.media },
          { title: dict.teams.credits.drivers, items: page.credits.portraits },
        ]}
      />
    </div>
  );
}

