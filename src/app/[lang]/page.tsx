import type { Metadata } from "next";
// weather.css потрібен календарю й сторінкам гонки; без цього імпорту він — окремий чанк, якого немає серед стилів головної, і prefetch
// пункту меню «Календар» передзавантажує його даремно (CI smoke: «preloaded but not used», 22.11). У layout.tsx його переносити не можна:
// у CI це дало CLS календаря 0,113 (PR #84).
import "@/components/weather/weather.css";
import { termLabels } from "@/lib/glossary/labels";
import { getTerm, type Term as TermData } from "@/lib/glossary/terms";
import type { CSSProperties, ReactNode } from "react";
import { formatDay, LocalDay, LocalTime, TzNote } from "@/components/calendar/local-time";
import { HmCountdown } from "@/components/home/countdown";
import { HmFades } from "@/components/home/fades";
import { HmOnThisDay } from "@/components/home/on-this-day";
import { HmNews } from "@/components/home/news";
import { HmSlider } from "@/components/home/slider";
import { SeasonPhoto } from "@/components/seasons/season-photo";
import { StoryCard } from "@/components/stories/story-card";
import { Term, TermPopover } from "@/components/glossary/term";
import { PageCredits } from "@/components/teams/page-credits";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getHomePage, type RecordList } from "@/lib/data/home";
import { fmtLap, TRACK_KEYS, TRACK_SPECS } from "@/lib/game/physics";
import { trackThumb } from "@/lib/game/thumb";
import { circuitPhotoAlt } from "@/lib/image-alt";
import type { ResultRow } from "@/lib/data/race-page";
import type { SeasonDriver, SeasonTeamRef } from "@/lib/data/season-page";
import { plural } from "@/lib/plural";
import { gapTime, lapTime, raceTime } from "@/lib/race-math";
import { pageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/site/json-ld";
import { siteIdentity } from "@/lib/jsonld";
import { getStoryList } from "@/lib/stories/content";

/** Фон шапки: стартова решітка, Спа 2008 (Mark McArdle, CC BY-SA 2.0, Wikimedia Commons) — підпис у PageCredits унизу. */
const HERO_PHOTO = {
  src: "/img/home/grid-1100.webp",
  srcSet: "/img/home/grid-480.webp 480w, /img/home/grid-640.webp 640w, /img/home/grid-1100.webp 1100w, /img/home/grid-1600.webp 1600w",
  credit: {
    label: "Spa-Francorchamps 2008",
    href: "https://commons.wikimedia.org/wiki/File:Spa_2008_before_start.jpg",
    author: "Mark McArdle",
    license: "CC BY-SA 2.0",
  },
};

/** Історії на головній — три з макета (вибір користувача: «найцікавіші»), у порядку макета. */
const HOME_STORIES = ["suzuka-1989", "jerez-1997", "singapore-2008"];

// Головна статична: збирається з кожним деплоєм після data-sync і бази під час ISR не читає (рішення користувача 14.11 —
// інакше посилання на щойно опубліковану гонку давали б 404, поки йде деплой). Новини — клієнтом з /api/news (ISR 30 хв).

const fmt = { uk: new Intl.NumberFormat("uk"), en: new Intl.NumberFormat("en") };
const dayFmt = {
  uk: new Intl.DateTimeFormat("uk", { day: "numeric", month: "long", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }),
};
const shortDay = {
  uk: new Intl.DateTimeFormat("uk", { day: "numeric", month: "short", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
};
const utc = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`);

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const meta = pageMetadata({ locale: lang, path: "/", title: dict.meta.home.title, description: dict.meta.home.description });
  // Головна — повна назва без шаблону «… · Outlap».
  return { ...meta, title: { absolute: dict.meta.home.title } };
}

function Driver({ d, lang, small }: { d: SeasonDriver; lang: Locale; small?: boolean }) {
  return (
    <a className="hm-ent" href={localizedPath(`/drivers/${d.slug}`, lang)}>
      {d.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={small ? "hm-av hm-av-s" : "hm-av"} src={d.avatar} width={28} height={28} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className={small ? "hm-av hm-av-s hm-ini" : "hm-av hm-ini"} aria-hidden="true">
          {d.initials}
        </span>
      )}
      <span>{d.name}</span>
    </a>
  );
}
function Team({ t, lang }: { t: SeasonTeamRef | null; lang: Locale }) {
  if (!t) return null;
  return (
    <a className="hm-team" href={localizedPath(`/teams/${t.id}`, lang)} translate="no">
      <i className="hm-sq" style={t.color ? ({ "--c": t.color } as CSSProperties) : undefined} aria-hidden="true" />
      {t.name}
    </a>
  );
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const t = dict.homePage;
  const rp = dict.racePage;
  const page = await getHomePage(lang);
  const path = (p: string) => localizedPath(p, lang);
  const n = (v: number) => fmt[lang].format(v);
  const { last, next } = page;

  // Підказки словника в таблиці останньої гонки (рішення 15.11): віконця — один раз унизу (статуси повторюються).
  const tl = termLabels(lang, dict.glossary.more);
  const usedTerms = new Map<string, TermData>();
  const T = (id: string, children: ReactNode) => {
    const term = getTerm(id, lang);
    if (!term) return children;
    usedTerms.set(id, term);
    return (
      <Term term={term} t={tl} shared box>
        {children}
      </Term>
    );
  };
  const STATUS_TERM: Partial<Record<ResultRow["status"], string>> = { retired: "dnf", accident: "dnf", dsq: "dsq", dns: "dns" };
  const timeCell = (r: ResultRow): ReactNode => {
    if (r.time?.kind === "total") return raceTime(r.time.ms);
    if (r.time?.kind === "gap") return gapTime(r.time.ms);
    if (r.time?.kind === "laps") return T("lapped", fill(plural(r.time.n, lang, rp.lapsDown), { n: r.time.n }));
    const id = STATUS_TERM[r.status];
    return id ? T(id, rp.status[r.status]) : rp.status[r.status];
  };

  const recordList = <T,>(i: number, title: string, list: RecordList<T>, who: (x: T) => ReactNode, key: (x: T) => string) => (
    <div className="hm-panel hm-rec" id={`hm-rc-${i}`}>
      <h3>{title}</h3>
      {list.top[0] && (
        <div className="hm-rec-top">
          <b className="num">{n(list.top[0].n)}</b>
          <span className="hm-rec-who">
            {list.top.map((r) => (
              <span key={key(r.who)}>{who(r.who)}</span>
            ))}
          </span>
        </div>
      )}
      {/* Прокручуваний список, як у макеті: фокус з клавіатури (axe scrollable-region-focusable), затухання внизу. */}
      <ol className="hm-rec-list hm-fade" tabIndex={0} aria-label={title}>
        {list.rest.map((r) => (
          <li key={key(r.who)}>
            {who(r.who)}
            <span className="hm-rec-v num">{n(r.n)}</span>
          </li>
        ))}
      </ol>
    </div>
  );

  const maxPts = Math.max(1, ...page.standings.drivers.map((r) => r.points));
  const maxTeamPts = Math.max(1, ...(page.standings.teams ?? []).map((r) => r.points));
  const lastDone = page.rail.filter((r) => r.state === "done").at(-1);
  const nextRail = page.rail.find((r) => r.state === "next");

  // Гра й історії — статичні дані збірки (без БД). Схема — перша траса гри («Лиман»), як у макеті.
  const g = dict.gamePage;
  const lyman = trackThumb("lyman");
  const km = (m: number) => `${(m / 1000).toFixed(2).replace(".", lang === "uk" ? "," : ".")} ${g.km}`;
  const stories = getStoryList(lang);
  const homeStories = HOME_STORIES.map((slug) => stories.find((c) => c.slug === slug)).filter((c) => c !== undefined);
  const sp = dict.storiesPage;
  const storyLabels = { meterLabel: sp.meterLabel, meterKeys: sp.meterKeys, category: sp.category, read: sp.read };

  return (
    <div className="hm" data-section="home">
      <JsonLd data={siteIdentity(lang, dict.meta.home.description)} />
      {/* ---------- герой ---------- */}
      <section className="hm-hero">
        <div className="wrap">
          <div className="hm-hero-main">
            {/* Фото стартової решітки (Спа, 2008) — фон шапки зліва під темним градієнтом; автор і ліцензія — внизу сторінки. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="hm-hero-photo"
              src={HERO_PHOTO.src}
              srcSet={HERO_PHOTO.srcSet}
              // Занижений «слот» навмисно: фото — декоративний фон під густим градієнтом, тож телефону вистачає 640w (≈ 26 КБ замість 58) —
              // інакше на мобільному Lighthouse (DPR 1,75) воно було найбільшим елементом і LCP сягав 4,7 с (замір 22.11).
              sizes="(max-width: 600px) 360px, (max-width: 1100px) 720px, 880px"
              width={1600}
              height={1067}
              alt=""
              decoding="async"
            />
            <h1 className="display">
              <span>{t.h1[0]}</span>{" "}
              <span className="hm-accent">{t.h1[1]}</span>
            </h1>
            <p className="hm-lede">{fill(t.lede, { first: page.stats.first })}</p>
            <div className="hm-ctas">
              {last && (
                <a className="hm-btn hm-btn-blue" href={path(`/seasons/${last.year}/${last.round}`)}>
                  {fill(t.ctaResults, { gp: last.gp })}
                </a>
              )}
              <a className="hm-btn hm-btn-line" href={path("/game")}>
                {t.ctaGame}
              </a>
            </div>
            <dl className="hm-stats">
              {(
                [
                  [page.stats.seasons, plural(page.stats.seasons, lang, t.stats.seasons)],
                  [page.stats.drivers, plural(page.stats.drivers, lang, t.stats.drivers)],
                  [page.stats.circuits, plural(page.stats.circuits, lang, t.stats.circuits)],
                ] as const
              ).map(([v, l]) => (
                <div key={l}>
                  <dt>{l}</dt>
                  <dd className="num">{n(v)}</dd>
                </div>
              ))}
              <div>
                <dt>{t.stats.first}</dt>
                <dd className="num">{page.stats.first}</dd>
              </div>
            </dl>
          </div>
          <HmOnThisDay
            locale={lang}
            base={path("/history")}
            labels={{ ...dict.homePage.otd, title: dict.onThisDay.title, months: dict.onThisDay.monthsGen }}
          />
        </div>
      </section>

      {/* ---------- смуга сезону ---------- */}
      <section className="hm-rail" aria-labelledby="hm-rail-h">
        <div className="wrap">
          <h2 id="hm-rail-h">
            <a href={path("/calendar")}>{fill(t.railTitle, { season: page.season })}</a>
          </h2>
          <ol className="hm-rail-track" aria-label={fill(t.railLabel, { season: page.season })}>
            {page.rail.map((r) => (
              <li key={r.round} className={`hm-rail-cell hm-rail-${r.state}`} title={`${r.round} · ${r.place}`}>
                <i aria-hidden="true" />
                <span className="num">{r.round}</span>
                <span className="hm-sr">
                  {r.place} — {r.state === "done" ? t.railDone : r.state === "next" ? t.railNextState : t.railLater}
                </span>
              </li>
            ))}
          </ol>
          <div className="hm-rail-key">
            {lastDone && (
              <div>
                <b>{fill(t.railLast, { round: lastDone.round })}</b>
                <span>
                  {lastDone.place}
                  {lastDone.date ? `, ${shortDay[lang].format(utc(lastDone.date))}` : ""}
                </span>
              </div>
            )}
            {nextRail && (
              <div className="hm-rail-key-next">
                <b>{fill(t.railNext, { round: nextRail.round })}</b>
                <span>
                  {nextRail.place}
                  {/* Дата старту — у поясі браузера, як і час старту нижче (календар, PR #19); без часу — дата етапу в UTC. */}
                  {nextRail.raceTimed && nextRail.raceAt ? (
                    <>
                      , <LocalDay iso={nextRail.raceAt} locale={lang} />
                    </>
                  ) : nextRail.date ? (
                    `, ${shortDay[lang].format(utc(nextRail.date))}`
                  ) : (
                    ""
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- остання й наступна гонка ---------- */}
      <section className="hm-races">
        <div className="wrap">
          {last && (
            <article className="hm-last" aria-labelledby="hm-last-h">
              <div className="hm-banner">
                {last.photo && (
                  <SeasonPhoto
                    src={last.photo.src}
                    alt={circuitPhotoAlt(dict.circuitPage.heroAlt, last.short, last.place)}
                    srcSet={last.photo.srcSet}
                    sizes="(max-width: 1100px) 100vw, 60vw"
                    width={last.photo.width}
                    height={last.photo.height}
                    priority={false}
                    eager={false}
                    style={last.photo.focus ? { objectPosition: last.photo.focus } : undefined}
                  />
                )}
                {last.date && <span className="hm-stamp hm-stamp-fin">{fill(t.lastFinish, { date: dayFmt[lang].format(utc(last.date)) })}</span>}
                <div className="hm-banner-label">
                  <div>
                    <div className="hm-eyebrow">
                      {last.year !== page.season && `${last.year} · `}
                      {fill(t.lastEyebrow, { round: last.round, rounds: last.rounds })}
                    </div>
                    <h2 className="display" id="hm-last-h">
                      <a href={path(`/seasons/${last.year}/${last.round}`)}>{last.gp}</a>
                    </h2>
                  </div>
                  {last.laps !== null && (
                    <span className="hm-chip">
                      {last.place} · {fill(plural(last.laps, lang, t.laps), { n: last.laps })}
                    </span>
                  )}
                </div>
              </div>
              <ol className="hm-podium">
                {last.results.slice(0, 3).map((r) => (
                  <li key={r.driver.id} style={r.driver.team?.color ? ({ "--c": r.driver.team.color } as CSSProperties) : undefined}>
                    <span className="hm-pod-p">P{r.position}</span>
                    <Driver d={r.driver} lang={lang} />
                    <span className="hm-pod-s">
                      <span translate="no">{r.driver.team?.name}</span> · <span className="num">{timeCell(r)}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="hm-tbl" role="region" aria-labelledby="hm-last-h" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t.col.pos}</th>
                      <th scope="col">{t.col.driver}</th>
                      <th scope="col" className="hm-r hm-c-grid">
                        {T("grid", t.col.grid)}
                      </th>
                      <th scope="col" className="hm-r">
                        {t.col.gap}
                      </th>
                      <th scope="col" className="hm-r">
                        {t.col.pts}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {last.results.map((r) => {
                      const delta = r.grid && r.position ? r.grid - r.position : 0;
                      return (
                        <tr key={r.driver.id}>
                          <td className="num hm-pos">{r.position}</td>
                          <th scope="row">
                            <span className="hm-drv">
                              <i className="hm-stripe" style={r.driver.team?.color ? ({ "--c": r.driver.team.color } as CSSProperties) : undefined} aria-hidden="true" />
                              <Driver d={r.driver} lang={lang} small />
                            </span>
                          </th>
                          <td className="hm-r hm-c-grid num">
                            {r.grid || "—"}
                            {delta !== 0 && (
                              <span className={delta > 0 ? "hm-delta hm-up" : "hm-delta hm-dn"}>
                                {delta > 0 ? "▲" : "▼"}
                                {Math.abs(delta)}
                              </span>
                            )}
                          </td>
                          <td className="hm-r num">{timeCell(r)}</td>
                          <td className="hm-r num hm-pts">{r.points ? n(r.points) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ul className="hm-facts">
                {last.pole && (
                  <li>
                    <b>{t.pole}</b>
                    {last.pole.map((d) => d.short).join(" / ")}
                  </li>
                )}
                {last.fastest && (
                  <li>
                    <b>{t.fastest}</b>
                    {last.fastest.driver.short} · <span className="num">{lapTime(last.fastest.ms)}</span>
                  </li>
                )}
                {last.climb && (
                  <li>
                    <b>{t.climb}</b>
                    {last.climb.driver.short} · {fill(t.climbText, { grid: last.climb.grid, finish: last.climb.finish })}
                  </li>
                )}
              </ul>
              <p className="hm-more-row">
                <a className="hm-more" href={path(`/seasons/${last.year}/${last.round}`)}>
                  {t.allResults}
                </a>
                <a className="hm-more" href={path("/calendar")}>
                  {t.calendarLink}
                </a>
              </p>
            </article>
          )}

          <article className="hm-next" aria-labelledby="hm-next-h">
            {next ? (
              <>
                <div className="hm-banner hm-banner-next">
                  {next.circuit?.photo && (
                    <SeasonPhoto
                      src={next.circuit.photo.src}
                      alt={circuitPhotoAlt(dict.circuitPage.heroAlt, next.circuit.name, next.circuit.place)}
                      srcSet={next.circuit.photo.srcSet}
                      sizes="(max-width: 1100px) 100vw, 40vw"
                      width={next.circuit.photo.width}
                      height={next.circuit.photo.height}
                      priority={false}
                      eager={false}
                      style={{ objectPosition: next.circuit.photo.focus }}
                    />
                  )}
                  <div className="hm-banner-label">
                    <div>
                      <div className="hm-eyebrow">{fill(t.nextEyebrow, { round: next.round, rounds: next.rounds })}</div>
                      <h2 className="display" id="hm-next-h">
                        <a href={path(`/calendar#r${next.round}`)}>{next.gp}</a>
                      </h2>
                    </div>
                  </div>
                  <span className="hm-roundel hm-roundel-next" aria-hidden="true">
                    {next.round}
                  </span>
                </div>
                <div className="hm-next-body">
                  {next.raceAt && (
                    <div className="hm-when">
                      <strong>{next.place}</strong>
                      <span>
                        {t.raceStart}:{" "}
                        {/* Без справжнього часу raceAt — кінець дня за UTC: дату беремо з етапу в UTC, а не в поясі браузера
                            (на схід від UTC вона з'їжджала б на день уперед; рев'ю PR #25, як у календарі). */}
                        {next.raceTimed ? <LocalTime iso={next.raceAt} locale={lang} /> : formatDay(next.date ?? next.raceAt, lang, "UTC")}
                      </span>
                      {next.raceTimed && <TzNote utc={dict.calendarPage.tzUtc} local={dict.calendarPage.tzLocal} />}
                    </div>
                  )}
                  {page.upcoming.length > 0 && (
                    <HmCountdown
                      rounds={page.upcoming}
                      shown={next.round}
                      labels={{
                        label: dict.calendarPage.countdownLabel,
                        days: dict.calendarPage.days,
                        hours: dict.calendarPage.hours,
                        minutes: dict.calendarPage.minutes,
                        seconds: dict.calendarPage.seconds,
                        started: fill(dict.calendarPage.raceStarted, { round: next.round }),
                        then: t.countdownThen,
                      }}
                    />
                  )}
                  {next.circuit?.layout && (
                    <figure className="hm-map">
                      <figcaption>{t.mapHead}</figcaption>
                      <svg viewBox={`-40 -40 ${next.circuit.layout.w + 80} ${next.circuit.layout.h + 80}`} role="img" aria-label={next.circuit.name}>
                        <path className="hm-map-casing" d={next.circuit.layout.d} />
                        <path id="hm-map-route" className="hm-map-line" d={next.circuit.layout.d} />
                        {/* Значок їде за напрямом гонки (circuit-directions.json, макет головної); «менше руху» — схований (CSS). */}
                        {next.circuit.motion && (
                          <circle className="hm-map-car" r={24}>
                            <animateMotion
                              dur="10s"
                              repeatCount="indefinite"
                              calcMode="linear"
                              keyPoints={next.circuit.motion === "reverse" ? "1;0" : "0;1"}
                              keyTimes="0;1"
                            >
                              <mpath href="#hm-map-route" />
                            </animateMotion>
                          </circle>
                        )}
                      </svg>
                    </figure>
                  )}
                  {next.circuit && (next.circuit.lengthKm || next.circuit.turns || next.circuit.laps) && (
                    <dl className="hm-spec">
                      {next.circuit.lengthKm && (
                        <div>
                          <dt>{t.km}</dt>
                          <dd className="num">{new Intl.NumberFormat(lang, { minimumFractionDigits: 3 }).format(next.circuit.lengthKm)}</dd>
                        </div>
                      )}
                      {next.circuit.turns && (
                        <div>
                          <dt>{t.turns}</dt>
                          <dd className="num">{next.circuit.turns}</dd>
                        </div>
                      )}
                      {next.circuit.laps && (
                        <div>
                          <dt>{t.raceLaps}</dt>
                          <dd className="num">{next.circuit.laps}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {next.circuit && (
                    <a className="hm-more" href={path(`/circuits/${next.circuit.slug}`)}>
                      {t.circuitLink}
                    </a>
                  )}
                </div>
              </>
            ) : (
              <div className="hm-next-body hm-over">
                <h2 className="display" id="hm-next-h">
                  {fill(t.seasonOver, { season: page.season })}
                </h2>
                <p>{t.seasonOverNext}</p>
                <a className="hm-more" href={path(`/seasons/${page.season}`)}>
                  {fill(t.seasonLink, { season: page.season })}
                </a>
              </div>
            )}
          </article>
        </div>
      </section>

      {/* ---------- чемпіонат і рекорди ---------- */}
      <section className="hm-champs">
        <div className="wrap">
          <div className="hm-standings">
            <div className="hm-head">
              <h2 className="display">{t.standings}</h2>
              <span className="hm-src">
                {page.standings.final ? fill(t.finalStandings, { season: page.standings.season }) : fill(t.afterRound, { round: page.standings.afterRound })}
              </span>
            </div>
            <HmSlider id="hm-st" label={t.tabsLabel} tabs={page.standings.teams ? [t.tabDrivers, t.tabTeams] : [t.tabDrivers]}>
              <ol className="hm-panel hm-st-panel hm-fade" id="hm-st-0" aria-label={t.tabDrivers} tabIndex={0}>
                {page.standings.drivers.map((r) => (
                  <li key={r.driver.id} className="hm-st-row">
                    <span className="hm-st-pos num">{r.position ?? "—"}</span>
                    <span className="hm-st-name">
                      <Driver d={r.driver} lang={lang} small />
                      <Team t={r.team} lang={lang} />
                      <span className="hm-bar" aria-hidden="true">
                        <i style={{ inlineSize: `${(100 * r.points) / maxPts}%` }} />
                      </span>
                    </span>
                    <span className="hm-st-pts num">{n(r.points)}</span>
                  </li>
                ))}
              </ol>
              {page.standings.teams && (
                <ol className="hm-panel hm-st-panel hm-fade" id="hm-st-1" aria-label={t.tabTeams} tabIndex={0}>
                  {page.standings.teams.map((r) => (
                    <li key={r.team.id} className="hm-st-row">
                      <span className="hm-st-pos num">{r.position ?? "—"}</span>
                      <span className="hm-st-name">
                        <Team t={r.team} lang={lang} />
                        <span className="hm-bar" aria-hidden="true">
                          <i style={{ inlineSize: `${(100 * r.points) / maxTeamPts}%` }} />
                        </span>
                      </span>
                      <span className="hm-st-pts num">{n(r.points)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </HmSlider>
            <a className="hm-more" href={path(`/seasons/${page.standings.season}`)}>
              {t.fullStandings}
            </a>
          </div>
          <div className="hm-records" data-surface="dark">
            <div className="hm-head">
              <h2 className="display">{t.records}</h2>
              <span className="hm-src">{fill(t.recordsSince, { first: page.stats.first })}</span>
            </div>
            {/* Телефон — вкладки, як у новинах (відгук користувача 15.11); ширше — три колонки однієї висоти. */}
            <HmSlider id="hm-rc" label={t.records} tabs={[t.recTabWins, t.recTabTitles, t.recTabCups]}>
              {recordList(0, t.recWins, page.records.wins, (d) => <Driver d={d} lang={lang} small />, (d) => d.id)}
              {recordList(1, t.recTitles, page.records.titles, (d) => <Driver d={d} lang={lang} small />, (d) => d.id)}
              {recordList(
                2,
                t.recCups,
                page.records.cups,
                (x) => (
                  <a className="hm-ent" href={path(`/teams/${x.id}`)} translate="no">
                    <span>{x.name}</span>
                  </a>
                ),
                (x) => x.id,
              )}
            </HmSlider>
          </div>
        </div>
        <HmFades />
      </section>

      {/* ---------- гра (макет: карбон, «Push, push, push») ---------- */}
      <section className="hm-game" aria-labelledby="hm-game-h" data-surface="dark">
        <div className="wrap">
          <div className="hm-game-txt">
            <p className="hm-eyebrow">{t.gameEyebrow}</p>
            <h2 className="hm-push" id="hm-game-h">
              <span>Push,</span> <span>push,</span> <span>push</span>
            </h2>
            <p className="hm-game-p">{t.gameText}</p>
            <a className="hm-btn hm-btn-yellow" href={path("/game")}>
              {t.gameCta}
            </a>
          </div>
          <div className="hm-game-track" aria-hidden="true">
            <div className="hm-lights">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <svg viewBox="0 0 160 100">
              <polygon className="hm-gt-casing" points={lyman.points} />
              <polygon className="hm-gt-line" points={lyman.points} />
              <circle className="hm-gt-start" cx={lyman.start[0]} cy={lyman.start[1]} r={3.2} />
            </svg>
          </div>
          <table className="hm-board">
            <caption className="hm-sr">{t.gameBoard}</caption>
            <thead>
              <tr>
                <th scope="col">{g.circuits}</th>
                <th scope="col">{g.length}</th>
                <th scope="col">{g.bot}</th>
              </tr>
            </thead>
            <tbody>
              {TRACK_KEYS.map((k) => (
                <tr key={k}>
                  <th scope="row">
                    <a href={path(`/game#${k}`)}>{g.tracks[k].name}</a>
                    <small>{g.tracks[k].tag}</small>
                  </th>
                  <td className="num">{km(TRACK_SPECS[k].len)}</td>
                  <td className="num">{fmtLap(TRACK_SPECS[k].botTicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- історії: три з макета ---------- */}
      {homeStories.length > 0 && (
        <section className="hm-stories" aria-labelledby="hm-stories-h">
          <div className="wrap">
            <div className="hm-head">
              <h2 className="display" id="hm-stories-h">
                {dict.nav.stories}
              </h2>
              <a className="hm-more" href={path("/stories")}>
                {sp.allLink}
              </a>
            </div>
            <ul className="st-grid hm-st-grid" role="list">
              {homeStories.map((c) => (
                <li key={c.slug}>
                  <StoryCard c={c} locale={lang} t={storyLabels} meter={false} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ---------- новини ---------- */}
      <section className="hm-news" aria-labelledby="hm-news-h">
        <div className="wrap">
          <div className="hm-head">
            <h2 className="display" id="hm-news-h">
              {t.news}
            </h2>
            <a className="hm-more" href={path("/news")}>
              {t.allNews}
            </a>
          </div>
          <HmNews
            locale={lang}
            labels={{
              tabs: t.newsTabs,
              headlines: t.tabHeadlines,
              posts: t.tabPosts,
              loading: t.newsLoading,
              empty: t.newsEmpty,
              post: dict.newsPage.openBskyAuthor,
              sources: { f1: "Formula 1", motorsport: "Motorsport.com", autosport: "Autosport" },
              morePosts: t.morePosts,
              morePostsHref: path("/news?v=bsky"),
            }}
          />
        </div>
      </section>

      {[...usedTerms.values()].map((term) => (
        <TermPopover key={term.id} term={term} t={tl} />
      ))}
      <PageCredits
        groups={[
          {
            title: t.creditsPhotos,
            items: [
              HERO_PHOTO.credit,
              ...page.credits.photos,
              ...homeStories.flatMap((c) => (c.hero ? [{ label: c.hero.caption, href: c.hero.credit.page, author: c.hero.credit.author, license: c.hero.credit.license }] : [])),
            ],
          },
          { title: t.creditsPortraits, items: page.credits.portraits },
        ]}
      />
    </div>
  );
}
