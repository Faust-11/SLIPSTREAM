import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { cache } from "react";
import { SeasonChart } from "@/components/team/season-chart";
import { PageCredits } from "@/components/teams/page-credits";
import { locales, type Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getTeamIds, getTeamPage, type DriverView, type TeamPage } from "@/lib/data/team-page";
import { curatedDrivers } from "@/lib/data/teams";
import type { TeamSeasonRow } from "@/lib/data/types";
import { driverPath } from "@/lib/driver-slug";
import { ukOrdinal } from "@/lib/ordinal";
import { plural } from "@/lib/plural";
import { pageMetadata, siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ lang: string; id: string }> };

// 165 команд × 2 мови — статично; невідомий id — 404 без рендеру на запит.
export const dynamicParams = false;
export function generateStaticParams() {
  return locales.flatMap((lang) => getTeamIds().map((id) => ({ lang, id })));
}

const fmt = { uk: new Intl.NumberFormat("uk"), en: new Intl.NumberFormat("en") };
const dateFmt = {
  uk: new Intl.DateTimeFormat("uk", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
};

// Метадані й сторінка беруть ті самі дані: cache() — один розрахунок на маршрут.
const pageData = cache(async (id: string, lang: Locale) => {
  const page = await getTeamPage(id, lang);
  // Невідомий id сюди не доходить (dynamicParams = false — правило проєкту, без notFound()).
  if (!page) throw new Error(`Команда ${id}: немає в curated/teams.json`);
  return page;
});

async function load(props: Props) {
  const { lang: raw, id } = await props.params;
  const lang = requireLocale(raw);
  return { lang, page: await pageData(id, lang), dict: await getDictionary(lang) };
}

/** Відносна яскравість (WCAG) — для вибору кольору назви на темному фото. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const PHOTO_BG = luminance("#0e0f12");
/** Колір команди читається на затемненому фото (≥ 3:1 для великого тексту)? Ні — назва біла (Red Bull 1,46:1). */
function readableOnPhoto(hex: string | null): boolean {
  return !!hex && /^#[0-9a-f]{6}$/i.test(hex) && (luminance(hex) + 0.05) / (PHOTO_BG + 0.05) >= 3;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { lang, page, dict } = await load(props);
  const t = dict.team;
  const n = (v: number) => fmt[lang].format(v);
  return pageMetadata({
    locale: lang,
    path: `/teams/${page.team.id}`,
    title: page.team.name,
    description: fill(t.metaDescription, {
      team: page.team.name,
      gp: n(page.totals.grands_prix),
      wins: fill(plural(page.totals.wins, lang, t.winsN), { n: n(page.totals.wins) }),
      titles: `${n(page.totals.constructors_titles)} ${plural(page.totals.constructors_titles, lang, t.totals.constructors)}`,
    }),
  });
}

/** Пілот з аватаром — посилання на його сторінку (є в кожного пілота зі стартом, а в поданнях команди інших немає). */
function Person({ d, lang, size = 28 }: { d: DriverView; lang: Locale; size?: number }) {
  return (
    <a className="ent" href={localizedPath(driverPath(d.id), lang)}>
      {d.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="av" src={d.avatar} width={size} height={size} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="av av-ini" aria-hidden="true" style={{ width: size, height: size }}>
          {d.initials}
        </span>
      )}
      <span>{d.name}</span>
    </a>
  );
}

/** Бази команди: переїзди в одній країні — «Віші → Маньї-Кур, Франція», інакше — через «;». */
function formatBase(base: { city: string | null; country: string; years: string | null }[]): string {
  const sameCountry = base.length > 1 && base.every((b) => b.country === base[0]!.country && b.city);
  if (sameCountry)
    return `${base.map((b) => b.city + (b.years ? ` (${b.years})` : "")).join(" → ")}, ${base[0]!.country}`;
  return base.map((b) => [b.city, b.country].filter(Boolean).join(", ") + (b.years ? ` (${b.years})` : "")).join("; ");
}

/** Рядок словника з <b>…</b> → React без dangerouslySetInnerHTML. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(<b>.*?<\/b>)/);
  return (
    <>
      {parts.map((p, i) => (p.startsWith("<b>") ? <b key={i}>{p.slice(3, -4)}</b> : p))}
    </>
  );
}

export default async function TeamPageView(props: Props) {
  const { lang, page, dict } = await load(props);
  const t = dict.team;
  const n = (v: number) => fmt[lang].format(v);
  const { team, totals, facts, insights: ins } = page;
  // Колір команди є лише в учасників поточного сезону; у історичних — нейтральний (банер без фото — темний з білим).
  const color = team.color ?? "var(--ink)";
  const current = page.seasons[0]?.year === page.currentSeason ? page.seasons[0]! : null;
  const lastChampion = page.champions.flatMap((c) => c.years.map((y) => ({ y, d: c.driver }))).sort((a, b) => b.y - a.y)[0];
  const lastCup = page.seasons.find((s) => s.champion);
  const pl = (v: number, forms: Parameters<typeof plural>[2]) => fill(plural(v, lang, forms), { n: n(v) });
  const describe = (s: TeamSeasonRow) =>
    [
      s.year,
      s.excluded ? t.seasons.excluded : s.position ? `P${s.position}` : "—",
      pl(s.wins, t.winsN),
      s.points !== null ? pl(s.points, t.points) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const strip = [
    { v: totals.grands_prix, f: t.totals.grandsPrix, show: true },
    { v: totals.wins, f: t.totals.wins, show: totals.wins > 0 },
    { v: totals.podiums, f: t.totals.podiums, show: totals.podiums > 0 },
    { v: totals.poles, f: t.totals.poles, show: totals.poles > 0 },
    { v: totals.one_twos, f: t.totals.oneTwos, show: totals.one_twos > 0 },
    { v: totals.constructors_titles, f: t.totals.constructors, show: totals.constructors_titles > 0 },
    { v: totals.drivers_titles, f: t.totals.drivers, show: totals.drivers_titles > 0 },
  ].filter((x) => x.show);

  const credits = [
    ...(team.photo ? [{ label: team.name, href: team.photo.credit.page, author: team.photo.credit.author, license: team.photo.credit.license }] : []),
  ];
  const shownDrivers = new Map<string, DriverView>();
  for (const c of page.champions) shownDrivers.set(c.driver.id, c.driver);
  for (const d of page.pairing?.drivers ?? []) shownDrivers.set(d.id, d);
  for (const f of page.wins.featured) for (const d of f.win.drivers) shownDrivers.set(d.id, d);
  for (const b of page.wins.byDriver) shownDrivers.set(b.driver.id, b.driver);
  const avatarCredits = [...shownDrivers.values()]
    .filter((d) => d.avatar && curatedDrivers[d.id]?.credit)
    .map((d) => ({ label: d.name, href: curatedDrivers[d.id]!.credit!.page, author: curatedDrivers[d.id]!.credit!.author, license: curatedDrivers[d.id]!.credit!.license }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: team.name,
    sport: "Formula One",
    url: new URL(localizedPath(`/teams/${team.id}`, lang), siteUrl()).href,
    ...(facts.founders.length ? { founder: facts.founders.map((name) => ({ "@type": "Person", name })) } : {}),
    ...(team.photo ? { image: new URL(team.photo.src, siteUrl()).href } : {}),
  };

  // Графік — лише якщо є хоча б 2 сезони з місцем (у 99 із 165 команд — ні): без порожньої області й легенди.
  const hasChart = page.seasons.filter((s) => s.position !== null || s.excluded).length >= 2;
  const maxByDriver = page.wins.byDriver[0]?.count ?? 1;
  const maxByGp = page.wins.byGrandPrix[0]?.count ?? 1;
  const winsTitle = pl(totals.wins, t.wins.title);
  const style = { "--team": color } as CSSProperties;

  return (
    <div className="team-page" style={style}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <div className="wrap">
          <a href={localizedPath("/teams", lang)}>{t.crumbs}</a>
          <span className="sep" aria-hidden="true">/</span>
          <span aria-current="page" translate="no">{team.name}</span>
        </div>
      </nav>

      <section
        className={[team.photo ? "th has-photo" : "th", team.color ? "" : "no-color", team.photo && !readableOnPhoto(team.color) ? "light-title" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {team.photo && (
          // Банер: широке фото (1280/640), без нього — фото картки (480). Готові WebP, як у списку.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={(team.hero ?? team.photo).src}
            srcSet={(team.hero ?? team.photo).srcSet}
            sizes="100vw"
            width={(team.hero ?? team.photo).width}
            height={(team.hero ?? team.photo).height}
            alt={lang === "uk" ? `Болід ${team.name}` : `${team.name} car`}
            fetchPriority="high"
            decoding="async"
            style={team.hero?.focusY !== undefined ? { objectPosition: `50% ${team.hero.focusY}%` } : undefined}
          />
        )}
        <div className="wrap">
          {totals.constructors_titles > 0 && (
            <span className="th-stamp">
              {totals.constructors_titles === 1 ? t.stamp.one : fill(t.stamp.many, { n: totals.constructors_titles })}
            </span>
          )}
          <h1 className="display" translate="no">
            {team.name}
          </h1>
          <p>
            {lastCup && fill(t.summary.champion, { year: lastCup.year })}{" "}
            {lastChampion && fill(t.summary.lastChampion, { team: team.name, driver: lastChampion.d.name, year: lastChampion.y })}
            {!lastCup && !lastChampion && fill(t.summary.debutOnly, { gp: page.debut.name, year: page.debut.year })}
          </p>
          {/* Instagram — лише команд поточного сезону: у історичних Wikidata дає акаунт компанії-спадкоємця
              (напр. Ligier — виробник авто, не команда Ф1). */}
          {facts.instagram && current && (
            <a className="th-ig" href={`https://www.instagram.com/${encodeURIComponent(facts.instagram)}/`} rel="noopener">
              {t.instagram} <small>@{facts.instagram}</small>
            </a>
          )}
        </div>
      </section>

      <section className="tf" aria-label={t.facts.label}>
        <div className="wrap">
          <dl>
            <div>
              <dt>{t.facts.country}</dt>
              <dd>{page.country}</dd>
            </div>
            {facts.founders.length > 0 && (
              <div>
                <dt>{facts.founders.length > 1 ? t.facts.foundersMany : t.facts.founders}</dt>
                <dd>{facts.founders.join(", ")}</dd>
              </div>
            )}
            {facts.base.length > 0 && (
              <div>
                <dt>{t.facts.base}</dt>
                <dd>
                  {formatBase(facts.base)}
                </dd>
              </div>
            )}
            <div>
              <dt>{t.facts.debut}</dt>
              <dd>
                {page.debut.name} {page.debut.year}
              </dd>
            </div>
            {current && page.currentDrivers.length > 0 ? (
              <>
                <div>
                  <dt>{fill(t.facts.drivers, { year: current.year })}</dt>
                  <dd>
                    {page.currentDrivers.map((d) => (
                      <Person key={d.id} d={d} lang={lang} />
                    ))}
                  </dd>
                </div>
                <div>
                  <dt>{fill(t.facts.now, { year: current.year })}</dt>
                  <dd>
                    {[
                      current.position ? fill(t.facts.nowPlace, { pos: lang === "uk" ? ukOrdinal(current.position) : current.position }) : null,
                      pl(current.points ?? 0, t.points),
                      pl(current.wins, t.winsN),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                </div>
              </>
            ) : (
              <div>
                <dt>{t.facts.last}</dt>
                <dd>
                  {page.last.name} {page.last.year}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      <section className="ts" aria-label={t.totals.label}>
        <div className="wrap">
          {strip.map((s, i) => (
            <div key={i}>
              <b className="num">{n(s.v)}</b>
              <span>{plural(s.v, lang, s.f)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="sec" aria-labelledby="s-seasons">
        <div className="wrap">
          <div className="sec-head">
            <h2 className="display" id="s-seasons">
              {t.seasons.title}
            </h2>
            <span className="src">{t.seasons.note}</span>
          </div>
          <div className={hasChart ? "pos" : "pos no-chart"}>
            {hasChart && (
            <div className="pos-chart">
              {/* На вузькому екрані графік прокручується вбік — область доступна з клавіатури (axe scrollable-region-focusable). */}
              <div className="pos-scroll" role="region" aria-label={t.seasons.chartLabel} tabIndex={0}>
                <SeasonChart seasons={[...page.seasons].reverse()} label={t.seasons.chartLabel} describe={describe} />
              </div>
              <p className="pkey">
                <span>
                  <i className="win" />
                  {t.seasons.keyChampion}
                </span>
                <span>
                  <i />
                  {t.seasons.keyOther}
                </span>
                {ins.excluded.length > 0 && (
                  <span>
                    <i className="ex" />
                    {t.seasons.keyExcluded}
                  </span>
                )}
              </p>
            </div>
            )}
            <div className="notes">
              {ins.titleStreak && (
                <p>
                  <Rich
                    text={fill(plural(ins.titleStreak.count, lang, { few: t.seasons.streak, other: t.seasons.streakMany }), {
                      n: ins.titleStreak.count,
                      from: ins.titleStreak.from,
                      to: ins.titleStreak.to,
                    })}
                  />
                </p>
              )}
              {ins.bestSeason && (
                <p>
                  <Rich text={fill(t.seasons.best, { wins: ins.bestSeason.wins, races: ins.bestSeason.races, year: ins.bestSeason.year })} />
                </p>
              )}
              {ins.longestWait && (
                <p>
                  <Rich
                    text={fill(t.seasons.wait, {
                      years: pl(ins.longestWait.years, t.years),
                      from: ins.longestWait.from,
                      to: ins.longestWait.to,
                    })}
                  />
                </p>
              )}
              {ins.excluded
                .filter((y) => !page.notes.some((nt) => nt.year === y))
                .map((y) => (
                  <p key={y}>
                    <Rich text={fill(t.seasons.excludedNote, { year: y })} />
                  </p>
                ))}
              {page.notes.map((nt) => (
                <p key={nt.year + nt.text}>
                  {nt.text}{" "}
                  <span className="note-src">
                    ({t.seasons.sources}:{" "}
                    {nt.sources.map((s, i) => (
                      <a key={s.url} href={s.url} rel="noopener">
                        {i + 1}
                      </a>
                    ))}
                    )
                  </span>
                </p>
              ))}
            </div>
          </div>
          <details className="more">
            <summary>{pl(page.seasons.length, t.seasons.showAll)}</summary>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t.seasons.year}</th>
                    <th scope="col">{t.seasons.entries}</th>
                    <th scope="col" className="r">
                      {t.seasons.wins}
                    </th>
                    <th scope="col" className="r">
                      {t.seasons.points}
                    </th>
                    <th scope="col" className="r">
                      {t.seasons.place}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.seasons.map((s) => (
                    <tr key={s.year} className={s.champion ? "champ" : undefined}>
                      <th scope="row" className="yr num">
                        {s.year}
                      </th>
                      <td translate="no">{s.entries.join(", ")}</td>
                      <td className="r num">{n(s.wins)}</td>
                      <td className="r num">{s.points !== null ? n(s.points) : "—"}</td>
                      <td className="r ps num">
                        {s.excluded ? (
                          t.seasons.excluded
                        ) : s.position ? (
                          <>
                            P{s.position}
                            {s.in_progress && <span className="live">{t.seasons.running}</span>}
                          </>
                        ) : (
                          <span title={s.year < 1958 ? t.seasons.noCup : undefined}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </section>

      {page.champions.length > 0 && (
        <section className="sec" aria-labelledby="s-champs">
          <div className="wrap">
            <div className="sec-head">
              <h2 className="display" id="s-champs">
                {fill(t.champions.title, { team: team.name })}
              </h2>
              <span className="src">{pl(totals.drivers_titles, t.champions.note)}</span>
            </div>
            <ul className="champs">
              {page.champions.map((c) => (
                <li key={c.driver.id} className="ch">
                  <Person d={c.driver} lang={lang} size={64} />
                  <span className="ch-y num">{c.years.join(", ")}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {page.wins.list.length > 0 && (
        <section className="sec" aria-labelledby="s-wins">
          <div className="wrap">
            <div className="sec-head">
              <h2 className="display" id="s-wins">
                {winsTitle}
              </h2>
            </div>
            {page.wins.featured.length > 0 && (
              <ul className="wfeat">
                {page.wins.featured.map((f) => (
                  <li key={f.kind}>
                    <span className="wl">
                      {f.kind === "first" ? t.wins.first : fill(f.kind === "milestone" ? t.wins.milestone : t.wins.latest, { n: f.win.n })}
                    </span>
                    <span className="wy num">{f.win.year}</span>
                    <b>
                      <a href={localizedPath(`/seasons/${f.win.year}/${f.win.round}`, lang)}>{f.win.name}</a>
                    </b>
                    {f.win.drivers.map((d) => (
                      <Person key={d.id} d={d} lang={lang} size={24} />
                    ))}
                  </li>
                ))}
              </ul>
            )}
            <div className="wtop">
              <div>
                <h3 className="lab">{t.wins.byDriver}</h3>
                <ol className="bars">
                  {page.wins.byDriver.slice(0, 12).map((b) => (
                    <li key={b.driver.id}>
                      <Person d={b.driver} lang={lang} size={24} />
                      <span className="bar" aria-hidden="true">
                        <i style={{ width: `${(b.count / maxByDriver) * 100}%` }} />
                      </span>
                      <b className="num">{n(b.count)}</b>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <h3 className="lab">{t.wins.byGrandPrix}</h3>
                <ol className="bars">
                  {page.wins.byGrandPrix.slice(0, 12).map((g) => (
                    <li key={g.name}>
                      <span className="gp">{g.name}</span>
                      <span className="bar" aria-hidden="true">
                        <i style={{ width: `${(g.count / maxByGp) * 100}%` }} />
                      </span>
                      <b className="num">{n(g.count)}</b>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            {page.wins.list.length > 3 && (
              <details className="more">
                <summary>{fill(t.wins.showAll, { n: n(page.wins.list.length) })}</summary>
                {/* Компактний перелік (а не таблиця на 5 комірок у рядку): у Ferrari 250 перемог — таблиця давала
                    1 251 вузол DOM з 2 471, і Lighthouse CI опускав сторінку до 91 (TBT 296 мс, 12.11). */}
                <ol className="tscroll wlist" reversed>
                  {[...page.wins.list].reverse().map((w) => (
                    <li key={w.n} value={w.n}>
                      <span className="num">{dateFmt[lang].format(new Date(`${w.date}T00:00:00Z`))}</span> · {w.name} ·{" "}
                      {w.drivers.map((d) => d.name).join(", ")}
                      {w.drivers.length > 1 ? ` (${t.wins.shared})` : ""}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        </section>
      )}

      {current && page.pairing && <Pairing page={page} t={t} n={n} lang={lang} />}

      <PageCredits
        groups={[
          { title: t.credits.cars, items: credits },
          { title: t.credits.drivers, items: avatarCredits },
        ]}
      />
    </div>
  );
}

type PairDriver = NonNullable<TeamPage["pairing"]>["drivers"][number];

function Pairing({ page, t, n, lang }: { page: TeamPage; t: Awaited<ReturnType<typeof getDictionary>>["team"]; n: (v: number) => string; lang: Locale }) {
  const [a, b] = page.pairing!.drivers as [PairDriver, PairDriver];
  const rows = [
    { label: t.pairing.pointsLabel, a: a.points, b: b.points },
    { label: t.pairing.raceAhead, a: a.race_ahead, b: b.race_ahead },
    { label: t.pairing.qualiAhead, a: a.quali_ahead, b: b.quali_ahead },
  ];
  return (
    <section className="sec" aria-labelledby="s-pair">
      <div className="wrap">
        <div className="sec-head">
          <h2 className="display" id="s-pair">
            {fill(t.pairing.title, { year: page.currentSeason })}
          </h2>
          <span className="src">{fill(t.pairing.note, { round: page.seasons[0]!.season_races })}</span>
        </div>
        <div className="duo">
          <div className="dc">
            <Person d={a} lang={lang} size={84} />
          </div>
          <dl className="hbars">
            {rows.map((r) => (
              <div key={r.label} className="hb">
                <dt className="hl">{r.label}</dt>
                <dd>
                  <span className="sr-only">
                    {a.name}: {n(r.a)}; {b.name}: {n(r.b)}
                  </span>
                  <b className="hn num" aria-hidden="true">{n(r.a)}</b>
                  <span className="hbar" aria-hidden="true">
                    <i style={{ width: `${(r.a / Math.max(r.a + r.b, 1)) * 100}%` }} />
                  </span>
                  <b className="hn num" aria-hidden="true">{n(r.b)}</b>
                </dd>
              </div>
            ))}
          </dl>
          <div className="dc rt">
            <Person d={b} lang={lang} size={84} />
          </div>
        </div>
      </div>
    </section>
  );
}
