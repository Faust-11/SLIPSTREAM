import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { Rich } from "@/components/glossary/rich";
import { GlossaryList, type GlossaryItem } from "@/components/newbie/glossary-list";
import { StartLights } from "@/components/newbie/start-lights";
import { PageCredits } from "@/components/teams/page-credits";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getNewbiePage, type NewbieExample } from "@/lib/data/newbie";
import { getRacePage } from "@/lib/data/race-page";
import { termLabels } from "@/lib/glossary/labels";
import { markStrings } from "@/lib/glossary/mark";
import { getTerms, glossarySources } from "@/lib/glossary/terms";
import { newbieChecked, newbieText, SECTIONS, sectionSources, type NewbieText, type SectionKey } from "@/lib/newbie/content";
import { ukOrdinal } from "@/lib/ordinal";
import { plural } from "@/lib/plural";
import { pageMetadata, siteUrl } from "@/lib/seo";
import { JsonLd } from "@/components/site/json-ld";
import { breadcrumbList } from "@/lib/jsonld";
import type { Inline } from "@/lib/stories/markdown";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const t = newbieText(lang);
  const { season } = await getNewbiePage(lang);
  return pageMetadata({ locale: lang, path: "/newbie", title: t.title, description: fill(t.description, { season }) });
}

const GP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
/** Склади вікенду в прикладі (Сузука-2026, Pirelli) — підсвічені на шкалі C1–C5. */
const PICKED = ["C1", "C2", "C3"];
const TYRE_COLORS: Record<string, string> = { H: "#F3F4F1", M: "#F5C400", S: "#E8202A", I: "#2BA84A", W: "#1F6FD1" };

const enOrdinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
};
const ord = (n: number, lang: Locale) => (lang === "uk" ? ukOrdinal(n) : enOrdinal(n));
const dateFmt = { uk: new Intl.DateTimeFormat("uk", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }), en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) };

/** Усі рядки з підказками — у порядку на сторінці (термін спливає лише при першій появі). */
function pageStrings(t: NewbieText, sprintNote: string | null, vars: Record<string, number | string>): [string, string][] {
  return [
    ["basics.lead", t.basics.lead],
    ...t.basics.cols.flatMap((c, i) => c.p.map((p, j): [string, string] => [`basics.${i}.${j}`, p])),
    ["weekend.lead", t.weekend.lead],
    // Рядок про спринти — лише коли він є на сторінці: інакше перша поява терміна «з'їлась» би невидимим рядком (рев'ю PR #42).
    ...(sprintNote ? [["weekend.sprint", sprintNote] as [string, string]] : []),
    ...t.weekend.read.map((p, i): [string, string] => [`weekend.read.${i}`, fill(p, vars)]),
    ["points.lead", t.points.lead],
    ...t.points.rules.map((p, i): [string, string] => [`points.rule.${i}`, p]),
    ["tyres.lead", t.tyres.lead],
    ...t.tyres.items.map((x, i): [string, string] => [`tyres.item.${i}`, x.p]),
    ["tyres.scale", t.tyres.scaleNote],
    ...t.tyres.rules.map((p, i): [string, string] => [`tyres.rule.${i}`, p]),
    ["flags.lead", t.flags.lead],
    ...t.flags.items.map((x, i): [string, string] => [`flags.${i}`, x.p]),
    ["overtake.lead", t.overtake.lead],
    ...t.overtake.modes.map((x, i): [string, string] => [`overtake.${i}`, x.p]),
    ["overtake.gone", t.overtake.gone],
  ];
}

function Sources({ section, label }: { section: SectionKey; label: string }) {
  // Словник — джерела термінів (content/glossary/terms.json); решта розділів — джерела тверджень page.json.
  const list = section === "glossary" ? glossarySources().map((s) => ({ ...s, ref: null })) : sectionSources(section);
  if (list.length === 0) return null;
  return (
    <p className="nb-src">
      {label}{" "}
      {list.map((s, i) => (
        <span key={s.id}>
          {i > 0 && " · "}
          <a href={s.url} rel="noopener" hrefLang={s.lang}>
            {s.publisher}, {s.title}
            {s.ref ? `, ${s.ref}` : ""}
          </a>
        </span>
      ))}
    </p>
  );
}

function Section({ id, title, lead, children, sources }: { id: SectionKey; title: string; lead: ReactNode; children: ReactNode; sources: ReactNode }) {
  return (
    <section className="nb-sec" id={id} aria-labelledby={`nb-${id}-h`}>
      <div className="wrap">
        <div className="nb-sec-head">
          <h2 className="display" id={`nb-${id}-h`}>
            {title}
          </h2>
        </div>
        <p className="nb-sec-lead">{lead}</p>
        <div className="nb-sec-body">
          {children}
          {sources}
        </div>
      </div>
    </section>
  );
}

function Example({ ex, t, lang, pitlane }: { ex: NewbieExample; t: NewbieText["points"]; lang: Locale; pitlane: string }) {
  const path = (p: string) => localizedPath(p, lang);
  const pts = (n: number) => fill(plural(n, lang, t.ptsForms), { n });
  const list = new Intl.ListFormat(lang, { type: "conjunction" }).format(
    ex.cup.map((c) => fill(t.cupItem, { team: c.team.name, a: c.parts[0]!, b: c.parts[1]!, sum: c.sum })),
  );
  const notes = [
    ex.cup.length ? fill(t.cup, { list }) : null,
    ex.climb ? fill(t.climb, { driver: ex.climb.driver.name, grid: lang === "uk" ? ex.climb.grid : enOrdinal(ex.climb.grid), finish: lang === "uk" ? ex.climb.finish : enOrdinal(ex.climb.finish) }) : null,
    ex.fastest ? fill(t.fastest, { driver: ex.fastest.driver.name, pos: ord(ex.fastest.position, lang), pts: pts(ex.fastest.points) }) : null,
  ].filter(Boolean);
  return (
    <div>
      <h3 className="nb-lab">
        <a href={path(`/seasons/${ex.year}/${ex.round}`)}>{fill(t.exampleH, { gp: ex.gp, year: ex.year, round: ex.round })}</a>
      </h3>
      <div className="nb-tbl" role="region" aria-labelledby="nb-ex-cap" tabIndex={0}>
        <table>
          <caption id="nb-ex-cap" className="sr-only">
            {fill(t.exampleH, { gp: ex.gp, year: ex.year, round: ex.round })}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t.cols.pos}</th>
              <th scope="col">{t.cols.driver}</th>
              <th scope="col" className="nb-r nb-c-grid">
                {t.cols.grid}
              </th>
              <th scope="col" className="nb-r">
                {t.cols.pts}
              </th>
            </tr>
          </thead>
          <tbody>
            {ex.rows.map((r) => (
              <tr key={r.driver.id} style={r.driver.team?.color ? ({ "--team": r.driver.team.color } as CSSProperties) : undefined}>
                <td className="nb-c-pos num">{r.position}</td>
                <td>
                  <div className="nb-drv">
                    <i className="nb-stripe" aria-hidden="true" />
                    <span className="nb-drv-n">
                      <a className="nb-ent" href={path(`/drivers/${r.driver.slug}`)}>
                        {r.driver.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="nb-av" src={r.driver.avatar} width={28} height={28} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <span className="nb-av nb-ini" aria-hidden="true">
                            {r.driver.initials}
                          </span>
                        )}
                        <span>{r.driver.name}</span>
                      </a>
                      {r.driver.team && (
                        <a className="nb-ent-t" href={path(`/teams/${r.driver.team.id}`)} translate="no">
                          {r.driver.team.name}
                        </a>
                      )}
                    </span>
                  </div>
                </td>
                <td className="nb-r nb-c-grid num">{r.grid === 0 ? pitlane : (r.grid ?? "—")}</td>
                <td className="nb-r nb-c-pts num">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notes.length > 0 && <p className="nb-note">{notes.join(" ")}</p>}
    </div>
  );
}

export default async function NewbiePage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const t = newbieText(lang);
  const page = await getNewbiePage(lang);
  const nextRace = await getRacePage(t.next.race.year, t.next.race.round, lang);
  const path = (p: string) => localizedPath(p, lang);
  const season = page.season;
  const tl = termLabels(lang, dict.glossary.more);

  const cars = page.cars || 22;
  const out = Math.max(0, (cars - 10) / 2);
  const left = cars - out;
  const vars = { season, cars, out, left, q1from: left + 1, q2to: left, carsOrd: ukOrdinal(cars), q2toOrd: ukOrdinal(left) };
  const sprintPlaces = new Intl.ListFormat(lang, { type: "conjunction" }).format(page.sprints.map((s) => s.place));
  const sprintNote = page.sprints.length > 0 ? fill(t.weekend.sprintNote, { season, list: sprintPlaces }) : null;
  const { text, terms } = markStrings(pageStrings(t, sprintNote, vars), lang);
  const R = (k: string) => <Rich c={text[k] ?? ([] as Inline[])} terms={terms} t={tl} />;
  const src = (s: SectionKey) => <Sources section={s} label={t.sourcesLabel} />;

  const glossary: GlossaryItem[] = getTerms(lang).map((x) => {
    const other = getTerms(lang === "uk" ? "en" : "uk").find((o) => o.id === x.id);
    const k = [x.term, x.orig, x.def, other?.term, other?.orig].filter(Boolean).join(" ");
    return { id: x.id, term: x.term, orig: x.orig, def: x.def, k: k.toLowerCase().replace(/[«»“”"]/g, "").replace(/[’ʼ`]/g, "'") };
  });

  const sessions = t.weekend.sessions;
  const formats = [
    { key: "standard" as const, n: page.rounds - page.sprints.length, days: [["fp1", "fp2"], ["fp3", "q"], ["r"]] },
    { key: "sprint" as const, n: page.sprints.length, days: [["fp1", "sq"], ["sr", "q"], ["r"]] },
  ];
  const sesClass: Record<string, string> = { q: "nb-k-q", sq: "nb-k-q", sr: "nb-k-s", r: "nb-k-r" };
  const dayKeys = ["fri", "sat", "sun"] as const;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: t.title,
    url: new URL(path("/newbie"), siteUrl()).href,
    inLanguage: lang,
    dateModified: newbieChecked(),
    hasPart: {
      "@type": "DefinedTermSet",
      name: t.glossary.title,
      hasDefinedTerm: glossary.map((g) => ({ "@type": "DefinedTerm", name: g.term, description: g.def, url: `${new URL(path("/newbie"), siteUrl()).href}#g-${g.id}` })),
    },
  };

  return (
    <div className="nb-page">
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbList(lang, [{ name: dict.nav.newbie, path: "/newbie" }])} />
      <section className="nb-hero">
        <div className="wrap">
          <div className="nb-hero-main">
            <p className="nb-stamp">{fill(t.hero.stamp, { season })}</p>
            <h1 className="display">
              {t.hero.h1[0]} <span>{t.hero.h1[1]}</span>
            </h1>
            <p className="nb-lead">{t.hero.lead}</p>
          </div>
          <div className="nb-gantry" role="group" aria-labelledby="nb-gantry-h">
            <h2 id="nb-gantry-h">{t.game.title}</h2>
            <StartLights t={t.game} locale={lang} />
          </div>
        </div>
      </section>

      <nav className="nb-toc" aria-label={t.tocLabel}>
        <ul className="wrap" role="list">
          {SECTIONS.map((s) => (
            <li key={s}>
              <a href={`#${s}`}>{fill(t.toc[s], { season })}</a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="basics" title={t.basics.title} lead={R("basics.lead")} sources={src("basics")}>
        <dl className="nb-facts">
          {page.teams > 0 && (
            <div>
              <dt className="num">{page.teams}</dt>
              <dd>{fill(t.basics.facts.teams, { season })}</dd>
            </div>
          )}
          {page.cars > 0 && (
            <div>
              <dt className="num">{page.cars}</dt>
              <dd>{t.basics.facts.cars}</dd>
            </div>
          )}
          <div>
            <dt className="num">{page.rounds}</dt>
            <dd>{fill(t.basics.facts.rounds, { season })}</dd>
          </div>
          <div>
            <dt className="num">2</dt>
            <dd>{t.basics.facts.titles}</dd>
          </div>
        </dl>
        <div className="nb-two nb-prose">
          {t.basics.cols.map((c, i) => (
            <div key={c.h}>
              <h3 className="nb-lab">{c.h}</h3>
              {c.p.map((_, j) => (
                <p key={j}>{R(`basics.${i}.${j}`)}</p>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section id="weekend" title={t.weekend.title} lead={R("weekend.lead")} sources={src("weekend")}>
        <div className="nb-fmt" role="table" aria-label={t.weekend.head.format}>
          <div className="nb-fmt-row nb-fmt-head" role="row">
            <span role="columnheader">{t.weekend.head.format}</span>
            {dayKeys.map((d) => (
              <span key={d} role="columnheader">
                {t.weekend.head[d]}
              </span>
            ))}
          </div>
          {formats.map((f) => (
            <div className="nb-fmt-row" role="row" key={f.key}>
              <span className="nb-fn" role="rowheader">
                {t.weekend[f.key].name}
                <small>{fill(plural(f.n, lang, t.weekend[f.key].count), { n: f.n, season })}</small>
              </span>
              {f.days.map((day, i) => (
                <span className="nb-ses" role="cell" key={i} data-day={t.weekend.dayShort[dayKeys[i]!]}>
                  {day.map((s) => (
                    <span key={s} className={sesClass[s]}>
                      {sessions[s as keyof typeof sessions]}
                    </span>
                  ))}
                </span>
              ))}
            </div>
          ))}
        </div>
        {page.sprints.length > 0 && <p className="nb-note">{R("weekend.sprint")}</p>}

        <div className="nb-quali">
          <div>
            <h3 className="nb-lab">{t.weekend.qualiH}</h3>
            {t.weekend.q.map((q, qi) => {
              const n = qi === 0 ? cars : qi === 1 ? left : 10;
              return (
                <div className="nb-qrow" key={q.name}>
                  <b>
                    {q.name}
                    <small>{q.min}</small>
                  </b>
                  <div className="nb-cells" role="img" aria-label={fill(q.label, vars)} style={{ "--n": cars } as CSSProperties}>
                    {Array.from({ length: cars }, (_, i) => (
                      <i key={i} className={i >= n ? "nb-none" : qi < 2 && i >= n - out ? "nb-out" : qi === 2 && i === 0 ? "nb-pole" : undefined} />
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="nb-qkey">
              <span>
                <i aria-hidden="true" />
                {t.weekend.key.in}
              </span>
              <span>
                <i className="nb-out" aria-hidden="true" />
                {t.weekend.key.out}
              </span>
              <span>
                <i className="nb-pole" aria-hidden="true" />
                {t.weekend.key.pole}
              </span>
            </p>
          </div>
          <div className="nb-prose">
            <h3 className="nb-lab">{t.weekend.readH}</h3>
            {t.weekend.read.map((_, i) => (
              <p key={i}>{R(`weekend.read.${i}`)}</p>
            ))}
          </div>
        </div>
      </Section>

      <Section id="points" title={t.points.title} lead={R("points.lead")} sources={src("points")}>
        <div className="nb-pts">
          <div>
            <h3 className="nb-lab">{t.points.gpH}</h3>
            <Bars values={GP_POINTS} cols={10} label={GP_POINTS.join(", ")} />
            <h3 className="nb-lab">{t.points.sprintH}</h3>
            <Bars values={SPRINT_POINTS} cols={10} label={SPRINT_POINTS.join(", ")} sprint />
            <ul className="nb-rules" role="list">
              {t.points.rules.map((_, i) => (
                <li key={i}>{R(`points.rule.${i}`)}</li>
              ))}
            </ul>
          </div>
          {page.example && <Example ex={page.example} t={t.points} lang={lang} pitlane={dict.racePage.pitlane} />}
        </div>
      </Section>

      <Section id="tyres" title={t.tyres.title} lead={R("tyres.lead")} sources={src("tyres")}>
        <ul className="nb-tyres" role="list">
          {t.tyres.items.map((x, i) => (
            <li className="nb-tyre" key={x.key} style={{ "--c": TYRE_COLORS[x.key] } as CSSProperties}>
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle className="nb-rub" cx="50" cy="50" r="48" />
                <circle className="nb-band" cx="50" cy="50" r="38" transform="rotate(-58 50 50)" pathLength="192" />
                <circle className="nb-rim" cx="50" cy="50" r="26" />
                <text className="nb-ltr" x="50" y="58">
                  {x.key}
                </text>
              </svg>
              <b>{x.name}</b>
              <span className="nb-when">{x.when}</span>
              <p>{R(`tyres.item.${i}`)}</p>
            </li>
          ))}
        </ul>
        <div className="nb-two">
          <div>
            <h3 className="nb-lab">{t.tyres.scaleH}</h3>
            <div className="nb-scale" role="img" aria-label={fill(t.tyres.scaleLabel, { picked: new Intl.ListFormat(lang).format(PICKED) })}>
              {["C1", "C2", "C3", "C4", "C5"].map((c) => (
                <span key={c} className={PICKED.includes(c) ? "nb-pick" : undefined}>
                  {c}
                </span>
              ))}
            </div>
            <div className="nb-scale-x" aria-hidden="true">
              <span>{t.tyres.hard}</span>
              <span>{t.tyres.soft}</span>
            </div>
            <p className="nb-note">{R("tyres.scale")}</p>
          </div>
          <div>
            <h3 className="nb-lab">{t.tyres.rulesH}</h3>
            <ul className="nb-rules" role="list">
              {t.tyres.rules.map((_, i) => (
                <li key={i}>{R(`tyres.rule.${i}`)}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="flags" title={t.flags.title} lead={R("flags.lead")} sources={src("flags")}>
        <ul className="nb-flags" role="list">
          {t.flags.items.map((f, i) => (
            <li className="nb-fl" key={f.key}>
              <i className={`nb-flag nb-f-${f.key}`} aria-hidden="true" />
              <div>
                <b>{f.name}</b>
                <p>{R(`flags.${i}`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="overtake" title={fill(t.overtake.title, { season })} lead={R("overtake.lead")} sources={src("overtake")}>
        <ul className="nb-modes" role="list">
          {t.overtake.modes.map((m, i) => (
            <li className="nb-mode" key={m.en}>
              {m.name !== m.en && (
                <span className="nb-mode-en" lang="en">
                  {m.en}
                </span>
              )}
              <b>{m.name}</b>
              <p>{R(`overtake.${i}`)}</p>
            </li>
          ))}
        </ul>
        <div className="nb-gone">
          <s lang="en">DRS</s>
          <p>{R("overtake.gone")}</p>
        </div>
      </Section>

      <Section id="glossary" title={t.glossary.title} lead={t.glossary.lead} sources={src("glossary")}>
        <GlossaryList items={glossary} t={t.glossary} />
      </Section>

      <p className="wrap nb-checked">{fill(t.checked, { date: dateFmt[lang].format(new Date(`${newbieChecked()}T00:00:00Z`)) })}</p>

      <nav className="nb-nbrs" aria-label={t.next.label}>
        {nextRace && (
          <a className="nb-nbr" href={path(`/seasons/${nextRace.year}/${nextRace.round}`)}>
            <span>{t.next.race.kicker}</span>
            <b>
              {nextRace.gp} {nextRace.year}
            </b>
          </a>
        )}
        <a className="nb-nbr nb-nbr-next" href={path(`/seasons/${t.next.season.year}`)}>
          <span>{t.next.season.kicker}</span>
          <b>{fill(t.next.season.label, { year: t.next.season.year })}</b>
        </a>
      </nav>

      <PageCredits groups={[{ title: t.credits, items: page.credits }]} />
    </div>
  );
}

function Bars({ values, cols, label, sprint = false }: { values: number[]; cols: number; label: string; sprint?: boolean }) {
  const max = values[0]!;
  return (
    <>
      <div className={sprint ? "nb-bars nb-bars-s" : "nb-bars"} role="img" aria-label={label}>
        {Array.from({ length: cols }, (_, i) => {
          const v = values[i];
          return v === undefined ? (
            <div key={i} className="nb-nil" />
          ) : (
            <div key={i} style={{ height: `${Math.max(14, Math.round((v / max) * 100))}%` }}>
              {v}
            </div>
          );
        })}
      </div>
      <div className="nb-bar-x" aria-hidden="true">
        {Array.from({ length: cols }, (_, i) => (
          <span key={i}>P{i + 1}</span>
        ))}
      </div>
    </>
  );
}
