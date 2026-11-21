import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/calendar/local-time";
import { RoundAction, RoundStatus } from "@/components/predictions/round-status";
import { PageCredits } from "@/components/teams/page-credits";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { circuitMedia, type CircuitMedia } from "@/lib/data/circuits";
import { getPredictionsData } from "@/lib/data/predictions";
import { fmtDay } from "@/lib/fmt";
import { circuitPhotoAlt } from "@/lib/image-alt";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const t = (await getDictionary(lang)).predictions;
  return pageMetadata({ locale: lang, path: "/predictions", title: t.title, description: t.metaDescription });
}

/** Очки за місце: підпис у картці «Як рахуємо очки» (дублює перший пункт правил — лише для швидкого погляду). */
const SCALE: readonly (readonly [string, number])[] = [
  ["P1", 10],
  ["P2", 8],
  ["P3", 6],
  ["P4–10", 3],
];

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
  return (
    <div className="au-page">
      <section className="au-hero pd-hero">
        <div className="wrap">
          <p className="au-stamp">{fill(t.stamp, { season: data.season })}</p>
          <h1 className="display">{t.h1}</h1>
          <p className="au-lead">{t.lead}</p>
          {/* Прикраса: подіум 2-1-3. */}
          <ol className="pd-podium" aria-hidden="true">
            <li>2</li>
            <li>1</li>
            <li>3</li>
          </ol>
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
                  <li className="pd-round" key={r.round}>
                    <div className="pd-pic">
                      {m?.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.photo.src}
                          srcSet={m.photo.srcSet}
                          sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 400px"
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
                      <span className="pd-roundel" aria-hidden="true">
                        {r.round}
                      </span>
                      <div className="pd-pic-label">
                        <p className="pd-eyebrow">
                          {fill(t.roundN, { n: r.round })}
                          {r.sprint ? <span className="pd-chip">{t.sprint}</span> : null}
                        </p>
                        <h3 className="display">
                          <Link href={href}>{r.gp}</Link>
                        </h3>
                      </div>
                    </div>
                    <div className="pd-round-body">
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
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="pd-rules" aria-labelledby="pd-rules-h">
          <h2 className="au-h" id="pd-rules-h">
            {t.howH}
          </h2>
          <ul className="pd-scale" aria-hidden="true">
            {SCALE.map(([place, pts]) => (
              <li key={place}>
                <span>{place}</span>
                <b className="num">{pts}</b>
              </li>
            ))}
          </ul>
          <ul className="pd-rule-list">
            {t.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
      </div>
      <PageCredits groups={[{ title: t.creditsPhotos, items: credits }]} />
    </div>
  );
}
