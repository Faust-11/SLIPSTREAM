import type { Metadata } from "next";
import "@/components/history/history.css";
import { JsonLd } from "@/components/site/json-ld";
import { TodayLink } from "@/components/history/today-link";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getHistoryCounts } from "@/lib/data/on-this-day";
import { fill } from "@/i18n/fill";
import { breadcrumbList } from "@/lib/jsonld";
import { allDayKeys, parseDayKey } from "@/lib/on-this-day";
import { pageMetadata, siteUrl } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const t = (await getDictionary(lang)).onThisDay;
  return pageMetadata({ locale: lang, path: "/history", title: t.title, description: t.metaDescription });
}

/** Перелік дат року: дні з подіями — посилання на /history/ММ-ДД, інші — без посилання. */
export default async function HistoryPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const t = (await getDictionary(lang)).onThisDay;
  const counts = await getHistoryCounts();
  const keys = allDayKeys();
  const base = localizedPath("/history", lang);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t.title,
    description: t.metaDescription,
    inLanguage: lang,
    url: new URL(base, siteUrl()).href,
  };
  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbList(lang, [{ name: t.title, path: "/history" }])} />
      <section className="sec oth">
        <div className="wrap">
          <div className="sec-head">
            <h1 className="display">{t.title}</h1>
          </div>
          <p className="oth-lead">{t.intro}</p>
          <TodayLink base={base} label={t.today} />
          <p className="oth-note">{t.sourceNote}</p>
          {t.monthsNom.map((month, mi) => (
            <div key={month} className="oth-month">
              <h2>{month}</h2>
              <ol className="oth-days" aria-label={`${t.mapLabel}: ${month}`}>
                {keys
                  .filter((k) => parseDayKey(k)!.month === mi + 1)
                  .map((k) => {
                    const { day } = parseDayKey(k)!;
                    const label = fill(t.dayTitle, { day: `${day} ${t.monthsGen[mi]}` });
                    return (
                      <li key={k}>
                        {counts.has(k) ? (
                          <a href={`${base}/${k}`} aria-label={label}>
                            {day}
                          </a>
                        ) : (
                          <span aria-hidden="true">{day}</span>
                        )}
                      </li>
                    );
                  })}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
