import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { cache } from "react";
import { Term, TermPopover } from "@/components/glossary/term";
import { LapChart } from "@/components/race/lap-chart";
import { RaceVideo } from "@/components/race/race-video";
import { PageCredits } from "@/components/teams/page-credits";
import { locales, type Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getRaceKeys, getRacePage, type QualiRow, type ResultRow } from "@/lib/data/race-page";
import type { SeasonDriver, SeasonTeamRef } from "@/lib/data/season-page";
import { circuitPath } from "@/lib/circuit-math";
import { termLabels } from "@/lib/glossary/labels";
import { getTerm, type Term as TermData } from "@/lib/glossary/terms";
import { plural } from "@/lib/plural";
import { gapTime, lapTime, raceTime } from "@/lib/race-math";
import { circuitPhotoAlt } from "@/lib/image-alt";
import { pageMetadata, siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ lang: string; year: string; round: string }> };

// ~1 170 гонок × 2 мови — статично; невідомий етап — 404 без рендеру на запит (правило проєкту, без notFound()).
export const dynamicParams = false;
export async function generateStaticParams() {
  const keys = await getRaceKeys();
  return locales.flatMap((lang) => keys.map((k) => ({ lang, year: String(k.year), round: String(k.round) })));
}

const fmt = { uk: new Intl.NumberFormat("uk"), en: new Intl.NumberFormat("en") };
const dayFmt = {
  uk: new Intl.DateTimeFormat("uk", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
};
const sessFmt = {
  uk: new Intl.DateTimeFormat("uk", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
};
const utc = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
const hhmm = (iso: string) => utc(iso).toISOString().slice(11, 16);

const pageData = cache(async (year: number, round: number, lang: Locale) => {
  const page = await getRacePage(year, round, lang);
  if (!page) throw new Error(`Гонка ${year}/${round}: немає в f1.race_page`);
  return page;
});

async function load(props: Props) {
  const { lang: raw, year, round } = await props.params;
  const lang = requireLocale(raw);
  return { lang, page: await pageData(Number(year), Number(round), lang), dict: await getDictionary(lang) };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { lang, page, dict } = await load(props);
  const t = dict.racePage;
  const winner = page.strip.winners.map((w) => w.name).join(" / ");
  return pageMetadata({
    locale: lang,
    path: `/seasons/${page.year}/${page.round}`,
    title: `${page.gp} ${page.year}`,
    description: fill(t.metaDescription, { gp: page.gp, year: page.year, round: page.round, who: winner ? fill(t.metaWinner, { driver: winner }) : "" }),
  });
}

function DriverLink({ d, lang, short = false }: { d: SeasonDriver; lang: Locale; short?: boolean }) {
  return <a href={localizedPath(`/drivers/${d.slug}`, lang)}>{short ? d.short : d.name}</a>;
}
function TeamLink({ tm, lang }: { tm: SeasonTeamRef; lang: Locale }) {
  return (
    <a href={localizedPath(`/teams/${tm.id}`, lang)} translate="no">
      {tm.name}
    </a>
  );
}
/** Статус → термін словника (підказки в протоколі, рішення 15.11). */
const STATUS_TERM: Partial<Record<ResultRow["status"], string>> = { retired: "dnf", accident: "dnf", dsq: "dsq", dns: "dns" };
const TABLE_TERMS = ["grid", "pit-stop", "dnf", "dns", "dsq", "lapped", "pole"];

const slotAttr = (slot: number | null | undefined) => (slot !== null && slot !== undefined ? { "data-slot": slot } : {});

export default async function RacePage(props: Props) {
  const { lang, page, dict } = await load(props);
  const t = dict.racePage;
  const n = (v: number) => fmt[lang].format(v);
  const path = (p: string) => localizedPath(p, lang);
  const rich = (tpl: string, parts: Record<string, ReactNode>) =>
    tpl.split(/(\{[a-z0-9]+\})/i).map((s, i) => {
      const m = /^\{([a-z0-9]+)\}$/i.exec(s);
      return m && m[1]! in parts ? <span key={i}>{parts[m[1]!]}</span> : s;
    });
  const joinNodes = (nodes: ReactNode[], sep = ", ") => nodes.flatMap((x, i) => (i ? [sep, x] : [x]));
  const ranges = (rs: { from: number; to: number }[]) => rs.map((r) => (r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`)).join(", ");

  // Дати вікенду: «5–7 грудня 2025» (formatRange), один день — «7 грудня 2025».
  const dates =
    page.firstDate && page.date && page.firstDate !== page.date
      ? dayFmt[lang].formatRange(utc(page.firstDate), utc(page.date))
      : page.date
        ? dayFmt[lang].format(utc(page.date))
        : "";

  // Підказки словника в таблицях: кнопки «shared» — віконце кожного терміна один раз унизу сторінки (статуси повторюються в рядках).
  const tl = termLabels(lang, dict.glossary.more);
  const terms = Object.fromEntries(TABLE_TERMS.flatMap((id) => { const x = getTerm(id, lang); return x ? [[id, x]] : []; })) as Record<string, TermData>;
  const usedTerms = new Set<string>();
  const T = (id: string, children: ReactNode) => {
    const term = terms[id];
    if (!term) return children;
    usedTerms.add(id);
    return (
      <Term term={term} t={tl} shared box>
        {children}
      </Term>
    );
  };

  const timeCell = (r: ResultRow): ReactNode => {
    if (r.time?.kind === "total") return raceTime(r.time.ms);
    if (r.time?.kind === "gap") return gapTime(r.time.ms);
    if (r.time?.kind === "laps") return T("lapped", fill(plural(r.time.n, lang, t.lapsDown), { n: r.time.n }));
    const id = STATUS_TERM[r.status];
    return id ? T(id, t.status[r.status]) : t.status[r.status];
  };

  const renderResults = (rows: ResultRow[], caption: string, id: string, laps: boolean) => (
    <div className="rc-tbl" role="region" aria-labelledby={id} tabIndex={0}>
      <table>
        <caption id={id}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.col.pos}</th>
            <th scope="col">{t.col.driver}</th>
            <th scope="col" className="rc-r rc-hide-s">
              {T("grid", t.col.grid)}
            </th>
            {laps && (
              <th scope="col" className="rc-r rc-hide-s">
                {T("pit-stop", t.col.stops)}
              </th>
            )}
            <th scope="col" className="rc-r">
              {t.col.time}
            </th>
            <th scope="col" className="rc-r">
              {t.col.points}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const delta = r.position !== null && r.grid ? r.grid - r.position : null;
            return (
              <tr key={`${r.driver.id}-${i}`} {...slotAttr(r.slot)}>
                <td className="rc-pos num">{r.position ?? "—"}</td>
                <th scope="row">
                  <span className="rc-drv">
                    {r.driver.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="av" src={r.driver.avatar} width={28} height={28} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="av av-none" aria-hidden="true" />
                    )}
                    <span className="rc-drv-n">
                      <DriverLink d={r.driver} lang={lang} />
                      {r.fastestLap !== null && (
                        <abbr className="rc-fl" title={`${t.fastestBadgeTitle}: ${lapTime(r.fastestLap)}`}>
                          {t.fastestBadge}
                        </abbr>
                      )}
                      {r.driver.team && (
                        <small>
                          <TeamLink tm={r.driver.team} lang={lang} />
                        </small>
                      )}
                    </span>
                  </span>
                </th>
                <td className="rc-r num rc-hide-s">
                  {r.grid === 0 ? t.pitlane : (r.grid ?? "—")}
                  {delta !== null && delta !== 0 && (
                    <span className={delta > 0 ? "rc-up" : "rc-dn"} title={fill(delta > 0 ? t.gained : t.lost, { n: Math.abs(delta) })}>
                      {" "}
                      {delta > 0 ? `▲${delta}` : `▼${-delta}`}
                    </span>
                  )}
                </td>
                {laps && <td className="rc-r num rc-hide-s">{r.stops ?? "—"}</td>}
                <td className="rc-r num" title={r.detail ?? undefined}>
                  {timeCell(r)}
                </td>
                <td className="rc-r num rc-pts">{r.points ? n(r.points) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderQuali = (rows: QualiRow[], caption: string, id: string) => {
    const three = rows.some((r) => r.q2 !== null || r.q3 !== null);
    return (
      <div className="rc-tbl" role="region" aria-labelledby={id} tabIndex={0}>
        <table>
          <caption id={id}>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{t.col.pos}</th>
              <th scope="col">{t.col.driver}</th>
              {three ? (
                <>
                  <th scope="col" className="rc-r">
                    {t.col.q1}
                  </th>
                  <th scope="col" className="rc-r rc-hide-s">
                    {t.col.q2}
                  </th>
                  <th scope="col" className="rc-r">
                    {t.col.q3}
                  </th>
                </>
              ) : (
                <th scope="col" className="rc-r">
                  {t.col.best}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.driver.id}>
                <td className="rc-pos num">{r.position ?? "—"}</td>
                <th scope="row">
                  <span className="rc-drv-n">
                    <DriverLink d={r.driver} lang={lang} short />
                    {r.driver.team && (
                      <small>
                        <TeamLink tm={r.driver.team} lang={lang} />
                      </small>
                    )}
                  </span>
                </th>
                {three ? (
                  <>
                    <td className="rc-r num">{r.q1 !== null ? lapTime(r.q1) : ""}</td>
                    <td className="rc-r num rc-hide-s">{r.q2 !== null ? lapTime(r.q2) : ""}</td>
                    <td className="rc-r num">{r.q3 !== null ? lapTime(r.q3) : ""}</td>
                  </>
                ) : (
                  <td className="rc-r num">{r.q1 !== null ? lapTime(r.q1) : ""}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const raceLaps = page.race.find((r) => r.position === 1)?.laps ?? null;
  const lc = page.lapChart;
  const hero = page.hero.photo;
  const style = { "--team": page.hero.color ?? "#8a8f98" } as CSSProperties;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${page.gp} ${page.year}`,
    sport: "Formula One",
    url: new URL(path(`/seasons/${page.year}/${page.round}`), siteUrl()).href,
    ...(page.date ? { startDate: page.firstDate ?? page.date, endDate: page.date } : {}),
    location: { "@type": "Place", name: page.place },
    ...(hero ? { image: new URL(hero.src, siteUrl()).href } : {}),
  };

  return (
    <div className="race-page" style={style}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="crumbs rc-crumbs" aria-label="Breadcrumb">
        <div className="wrap">
          <a href={path("/seasons")}>{t.crumbs}</a>
          <span className="sep" aria-hidden="true">
            /
          </span>
          <a href={path(`/seasons/${page.year}`)}>{page.year}</a>
          <span className="sep" aria-hidden="true">
            /
          </span>
          <span aria-current="page">{fill(t.roundPlace, { n: page.round, place: page.place })}</span>
          <span className="sp" />
          {page.prev && (
            <a className="nb" href={path(`/seasons/${page.prev.year}/${page.prev.round}`)}>
              ‹ <span className="lbl">{page.prev.place}</span>
            </a>
          )}
          <a className="nb" href={path(page.next ? `/seasons/${page.next.year}/${page.next.round}` : `/seasons/${page.year}`)}>
            <span className="lbl">{page.next ? page.next.place : fill(t.season, { year: page.year })}</span> ›
          </a>
        </div>
      </nav>

      <section className={hero ? "rc-hero has-photo" : "rc-hero"}>
        {hero && (
          // Банер — LCP: без lazy, fetchpriority=high (настанова «Optimize image priority»).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.src} srcSet={hero.srcSet} sizes="100vw" width={hero.width} height={hero.height} alt={circuitPhotoAlt(dict.circuitPage.heroAlt, page.short, page.place)} fetchPriority="high" decoding="async" style={hero.focus ? { objectPosition: hero.focus } : undefined} />
        )}
        <div className="wrap">
          {page.decider && <span className="rc-stamp">{t.stamp}</span>}
          <h1 className="display">
            {page.gp} <span className="yr">{page.year}</span>
          </h1>
          <p>
            {rich(t.sub, {
              n: page.round,
              total: page.rounds,
              // Сторінка траси (фаза 3h).
              place: page.circuit ? <a href={path(circuitPath(page.circuit))}>{page.place}</a> : page.place,
              dates,
            })}
          </p>
        </div>
      </section>

      <section className="rc-strip" aria-label={t.strip.label}>
        <dl className="wrap">
          {page.strip.winners.length > 0 && (
            <div>
              <dt>{t.strip.winner}</dt>
              <dd>
                {joinNodes(page.strip.winners.map((w) => <DriverLink key={w.id} d={w} lang={lang} />), " / ")}
                {page.strip.winners[0]?.team && (
                  <small>
                    <TeamLink tm={page.strip.winners[0].team} lang={lang} />
                  </small>
                )}
              </dd>
            </div>
          )}
          {page.strip.poles.length > 0 && (
            <div>
              <dt>{T("pole", t.strip.pole)}</dt>
              <dd>
                {joinNodes(
                  page.strip.poles.map((car) => <span key={car[0]!.id}>{joinNodes(car.map((p) => <DriverLink key={p.id} d={p} lang={lang} />), " / ")}</span>),
                )}
              </dd>
            </div>
          )}
          {page.strip.fastest && (
            <div>
              <dt>{t.strip.fastest}</dt>
              <dd>
                <DriverLink d={page.strip.fastest.driver} lang={lang} />
                <small className="num">{lapTime(page.strip.fastest.ms)}</small>
              </dd>
            </div>
          )}
          {page.strip.champion && (
            <div className="champ">
              <dt>{t.strip.champion}</dt>
              <dd>
                <DriverLink d={page.strip.champion} lang={lang} />
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* Хайлайт гонки з YouTube FORMULA 1 (запит користувача 14.11; 2024+). */}
      {page.video && (
        <section className="rc-sec" aria-labelledby="v-h">
          <div className="wrap">
            <div className="rc-head">
              <h2 className="display" id="v-h">
                {t.video.label}
              </h2>
              <span className="rc-src">{t.video.credit}</span>
            </div>
            <RaceVideo id={page.video.id} title={page.video.title} hd={page.video.hd} playLabel={fill(t.video.play, { title: page.video.title })} />
          </div>
        </section>
      )}

      {page.sessions.length > 0 && (
        <section className="rc-sec" aria-labelledby="w-h">
          <div className="wrap">
            <div className="rc-head">
              <h2 className="display" id="w-h">
                {t.weekend}
              </h2>
              {page.sessions.some((s) => s.real) && <span className="rc-src">{t.weekendSub}</span>}
            </div>
            <ol className="rc-tl" role="list">
              {page.sessions.map((s, i) => (
                <li key={i} className={s.kind === "R" ? "rc-race" : undefined}>
                  {s.at && (
                    <span className="rc-tl-day">
                      <time dateTime={s.at}>{sessFmt[lang].format(utc(s.at))}</time>
                      {s.real && <> · {hhmm(s.at)} UTC</>}
                    </span>
                  )}
                  <b>{s.kind === "R" && raceLaps ? fill(plural(raceLaps, lang, t.raceLaps), { n: raceLaps }) : t.session[s.kind]}</b>
                  {s.best && (
                    <span className="rc-tl-res">
                      {rich(s.kind === "R" || s.kind === "SR" ? t.wonBy : t.fastestIn, {
                        name: <DriverLink d={s.best.driver} lang={lang} short />,
                      })}
                      {s.best.ms !== null && <span className="num"> · {lapTime(s.best.ms)}</span>}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {page.title && (
        <section className="rc-sec" aria-labelledby="t-h">
          <div className="wrap">
            <div className="rc-head">
              <h2 className="display" id="t-h">
                {t.title}
              </h2>
            </div>
            <div className="rc-title">
              <div className="rc-title-text">
                <p>{fill(t.titleBefore, { list: page.title.contenders.map((c) => `${c.driver.short} — ${n(c.before)}`).join(", ") })}</p>
                {page.title.lower && (
                  <p>
                    {rich(t.titleLower, {
                      pos: page.title.lower.position,
                      fin: page.title.lower.position - 1,
                      champion: page.title.contenders.find((c) => c.champion)!.driver.short,
                      would: <b>{n(page.title.lower.would)}</b>,
                      rival: page.title.lower.driver.short,
                      rivalPts: <b>{n(page.title.lower.rival)}</b>,
                    })}
                  </p>
                )}
              </div>
              <ol className="rc-tt" role="list">
                {page.title.contenders.map((c) => (
                  <li key={c.driver.id} className={c.champion ? "champ" : undefined}>
                    <span className="rc-tt-n">
                      <DriverLink d={c.driver} lang={lang} />
                      <span className="rc-tt-p">{c.finish !== null ? fill(t.finish, { n: c.finish }) : t.finishNone}</span>
                    </span>
                    <span className="rc-tt-pts num">
                      <span className="sr-only">{t.ttBefore} </span>
                      <span>{n(c.before)}</span> <i aria-hidden="true">→</i>
                      <span className="sr-only"> {t.ttAfter} </span> <b>{n(c.after)}</b>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      )}

      {lc && (
        <section className="rc-sec" aria-labelledby="l-h">
          <div className="wrap">
            <div className="rc-head">
              <h2 className="display" id="l-h">
                {t.laps}
              </h2>
            </div>
            <div className="rc-laps">
              <div className="rc-story">
                <p>
                  {lc.ledAll
                    ? rich(t.ledAll, { driver: <DriverLink d={lc.winner} lang={lang} short /> })
                    : // Менше половини гонки попереду — «лише на …» (Абу-Дабі 2021: «крім 1–57» звучало б дивно).
                      lc.led.reduce((a, r) => a + r.to - r.from + 1, 0) * 2 < lc.laps
                      ? rich(lc.led.length === 1 && lc.led[0]!.from === lc.led[0]!.to ? t.ledOnlyOne : t.ledOnly, {
                          driver: <DriverLink d={lc.winner} lang={lang} short />,
                          ranges: <b>{ranges(lc.led)}</b>,
                        })
                      : rich(t.notLed, { driver: <DriverLink d={lc.winner} lang={lang} short />, ranges: <b>{ranges(lc.notLed)}</b> })}
                </p>
                {lc.drop && (
                  <p>
                    {rich(lc.drop.stopLap !== null ? t.drop : t.dropNoStop, {
                      driver: <DriverLink d={lc.drop.driver} lang={lang} short />,
                      stop: lc.drop.stopLap ?? "",
                      lap: lc.drop.lap,
                      pos: <b>{lc.drop.position}</b>,
                      fin: lc.drop.finish,
                    })}
                  </p>
                )}
              </div>
              <LapChart
                lines={lc.lines}
                laps={lc.laps}
                label={fill(t.chartLabel, { names: lc.lines.map((l) => l.driver.short).join(", ") })}
                regionLabel={t.chartRegion}
                tableLabel={t.lapTable}
                lapCol={t.lapCol}
                pitKey={t.pitKey}
                lapLabel={(k) => `${t.lapCol} ${k}`}
              />
            </div>
          </div>
        </section>
      )}

      <section className="rc-sec" aria-labelledby="r-h">
        <div className="wrap">
          <div className="rc-head">
            <h2 className="display" id="r-h">
              {t.results}
            </h2>
          </div>
          <div className="rc-tables">
            {renderResults(page.race, raceLaps ? fill(plural(raceLaps, lang, t.raceLaps), { n: raceLaps }) : t.session.R, "res-race", true)}
            <div className="rc-side">
              {page.quali.length > 0 && renderQuali(page.quali, t.quali, "res-q")}
              {page.sprint.length > 0 && renderResults(page.sprint, t.sprint, "res-sr", false)}
              {page.sprintQuali.length > 0 && renderQuali(page.sprintQuali, t.sprintQuali, "res-sq")}
            </div>
          </div>
        </div>
      </section>

      <nav className="rc-nbrs" aria-label={t.neighbours}>
        {page.prev ? (
          <a className="rc-nbr" href={path(`/seasons/${page.prev.year}/${page.prev.round}`)}>
            <span>{t.prev}</span>
            <b>{page.prev.place}</b>
          </a>
        ) : (
          <span className="rc-nbr empty" aria-hidden="true" />
        )}
        <a className="rc-nbr next" href={path(page.next ? `/seasons/${page.next.year}/${page.next.round}` : `/seasons/${page.year}`)}>
          <span>{page.next ? t.next : fill(t.toSeason, { year: page.year })}</span>
          <b>{page.next ? page.next.place : page.year}</b>
        </a>
      </nav>

      {[...usedTerms].map((id) => (
        <TermPopover key={id} term={terms[id]!} t={tl} />
      ))}
      <PageCredits groups={[{ title: t.credits, items: page.credits }]} />
    </div>
  );
}
