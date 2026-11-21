import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/calendar/local-time";
import { RoundAction, RoundStatus } from "@/components/predictions/round-status";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getPredictionsData } from "@/lib/data/predictions";
import { fmtDay } from "@/lib/fmt";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const t = (await getDictionary(lang)).predictions;
  return pageMetadata({ locale: lang, path: "/predictions", title: t.title, description: t.metaDescription });
}

export default async function PredictionsPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const t = (await getDictionary(lang)).predictions;
  const data = await getPredictionsData(lang);
  // Етапи без результатів: найближчий і наступні. Проведені — це вже таблиця результатів сезону, не прогноз.
  const upcoming = data.rounds.filter((r) => r.state !== "done");
  return (
    <div className="au-page">
      <section className="au-hero">
        <div className="wrap">
          <p className="au-stamp">{fill(t.stamp, { season: data.season })}</p>
          <h1 className="display">{t.h1}</h1>
          <p className="au-lead">{t.lead}</p>
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
                return (
                  <li className="au-card pd-round" key={r.round}>
                    <p className="au-label">
                      {fill(t.roundN, { n: r.round })}
                      {r.sprint ? ` · ${t.sprint}` : ""}
                    </p>
                    <h3 className="au-h">
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
                    <RoundAction deadlineAt={r.deadlineAt} href={href} text={t} />
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
          <ul>
            {t.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
