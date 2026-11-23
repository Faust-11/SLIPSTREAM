import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/calendar/local-time";
import { HeroTimer } from "@/components/predictions/hero-timer";
import { RoundAction, RoundStatus } from "@/components/predictions/round-status";
import { RoundTicket } from "@/components/predictions/round-ticket";
import { PageCredits } from "@/components/teams/page-credits";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { circuitMedia, type CircuitMedia } from "@/lib/data/circuits";
import { getPredictionsData } from "@/lib/data/predictions";
import { fmtDay } from "@/lib/fmt";
import { SeasonPhoto } from "@/components/seasons/season-photo";
import { HERO_PHOTO } from "@/lib/hero-photo";
import { circuitPhotoAlt } from "@/lib/image-alt";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const t = (await getDictionary(lang)).predictions;
  return pageMetadata({ locale: lang, path: "/predictions", title: t.title, description: t.metaDescription });
}

export default async function PredictionsPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const t = dict.predictions;
  const data = await getPredictionsData(lang);
  // Етапи без результатів: найближчий і наступні. Проведені — це вже таблиця результатів сезону, не прогноз.
  const upcoming = data.rounds.filter((r) => r.state !== "done");
  // Фото й схеми трас для карток (куровані дані місця; без звернень до бази).
  const media = new Map<number, CircuitMedia>(await Promise.all(upcoming.map(async (r) => [r.round, await circuitMedia(r.circuitSlug)] as const)));
  const credits = upcoming.flatMap((r) => {
    const c = media.get(r.round)?.photo?.credit;
    return c ? [{ label: r.place, href: c.page, author: c.author, license: c.license }] : [];
  });
  const loginHref = localizedPath("/login", lang);
  const [h1First = "", ...h1Rest] = t.h1.split(" ");
  const heroRounds = upcoming.map((r) => ({ round: r.round, gp: r.gp, deadlineAt: r.deadlineAt, href: localizedPath(`/predictions/${r.round}`, lang) }));
  const cal = dict.calendarPage;
  return (
    <div className="au-page">
      <section className="au-hero pd-hero pd-hero-main">
        {/* Фон шапки — стартова решітка (Спа 2008, як на головній) під темним градієнтом; автор і ліцензія — внизу сторінки. */}
        {/* Клієнтський компонент навмисно: серверний <img> потрапляв би в RSC-дані, і prefetch пункту меню «Прогнози» передзавантажував
            це фото на головній («preloaded but not used», smoke; граблі №10). */}
        <SeasonPhoto
          className="pd-hero-img"
          src={HERO_PHOTO.src}
          srcSet={HERO_PHOTO.srcSet}
          sizes="100vw"
          width={HERO_PHOTO.width}
          height={HERO_PHOTO.height}
          alt=""
          priority={false}
          eager
        />
        <div className="wrap">
          <div className="pd-hero-text">
            <p className="au-stamp">{fill(t.stamp, { season: data.season })}</p>
            <h1 className="display">
              <span className="pd-accent">{h1First}</span> {h1Rest.join(" ")}
            </h1>
            <p className="au-lead">{t.lead}</p>
          </div>
          <HeroTimer
            rounds={heroRounds}
            locale={lang}
            text={t}
            units={{ days: cal.days, hours: cal.hours, minutes: cal.minutes, seconds: cal.seconds }}
            timerLabel={t.round.deadlineLabel}
            loginHref={loginHref}
          />
        </div>
      </section>
      <div className="wrap au-body pd-body">
        <section aria-labelledby="pd-rounds-h">
          <h2 className="au-h" id="pd-rounds-h">
            {t.roundsH}
          </h2>
          {upcoming.length === 0 ? (
            <p className="au-note pd-empty">{t.empty}</p>
          ) : (
            <ol className="pd-rounds">
              {upcoming.map((r) => {
                const href = localizedPath(`/predictions/${r.round}`, lang);
                const m = media.get(r.round);
                return (
                  <RoundTicket key={r.round} deadlineAt={r.deadlineAt}>
                    <article className="pd-ticket">
                      <div className="pd-pic">
                        {m?.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.photo.src}
                            srcSet={m.photo.srcSet}
                            sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 400px"
                            width={m.photo.width}
                            height={m.photo.height}
                            alt={circuitPhotoAlt(dict.circuitPage.heroAlt, r.place, r.place)}
                            loading="lazy"
                            decoding="async"
                            style={{ objectPosition: m.photo.focus }}
                          />
                        ) : m?.layout ? (
                          <svg className="pd-pic-layout" viewBox={`-40 -40 ${m.layout.w + 80} ${m.layout.h + 80}`} aria-hidden="true" focusable="false">
                            <path className="pd-pic-casing" d={m.layout.d} />
                            <path className="pd-pic-line" d={m.layout.d} />
                          </svg>
                        ) : null}
                        <span className="pd-no" aria-hidden="true">
                          {r.round}
                        </span>
                        {/* Штамп видно лише в закритого етапу (data-state="closed" на <li>, CSS). */}
                        <span className="pd-void" aria-hidden="true">
                          {t.closed}
                        </span>
                      </div>
                      <div className="pd-tear" aria-hidden="true" />
                      <div className="pd-round-body">
                        <p className="pd-eyebrow">
                          {fill(t.roundN, { n: r.round })}
                          {r.sprint ? <span className="pd-chip">{t.sprint}</span> : null}
                        </p>
                        <h3 className="display">
                          <Link href={href}>{r.gp}</Link>
                        </h3>
                        <p className="au-hint">
                          {r.place}
                          {r.date ? ` · ${fmtDay(r.date, lang, true)}` : ""}
                        </p>
                        {r.deadlineAt ? (
                          <p className="pd-dl">
                            {t.deadline} <LocalTime iso={r.deadlineAt} locale={lang} />
                          </p>
                        ) : null}
                        <RoundStatus deadlineAt={r.deadlineAt} locale={lang} text={t} />
                        <RoundAction deadlineAt={r.deadlineAt} href={href} text={t} loginHref={loginHref} />
                      </div>
                    </article>
                  </RoundTicket>
                );
              })}
            </ol>
          )}
        </section>

        <section className="pd-rules" aria-labelledby="pd-rules-h">
          <h2 className="au-h" id="pd-rules-h">
            {t.howH}
          </h2>
          {/* Бонуси — плитками (варіант A); за місце (10 / 8 / 6 / 3) і решта правил — у картках нижче (варіант C, пункти 1, 5, 6). */}
          <ul className="pd-tiles">
            {t.tiles.map((tile) => (
              <li key={tile.t}>
                <b className="num">{tile.v}</b>
                <p>{tile.t}</p>
              </li>
            ))}
          </ul>
          <ol className="pd-rows pd-rule-list">
            {[t.rules[0], t.rules[4], t.rules[5]].map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </section>
      </div>
      <PageCredits groups={[{ title: t.creditsPhotos, items: [HERO_PHOTO.credit, ...credits] }]} />
    </div>
  );
}
