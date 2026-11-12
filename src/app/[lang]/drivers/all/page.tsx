import type { Metadata } from "next";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getDriversIndex } from "@/lib/data/drivers";
import { DEFAULT_DRIVERS_QUERY, selectDrivers } from "@/lib/drivers-list";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const t = (await getDictionary(lang)).drivers;
  return pageMetadata({ locale: lang, path: "/drivers/all", title: t.allList, description: t.allList });
}

/**
 * Повний перелік пілотів простим текстом — для відвідувачів без JavaScript (на «Пілоти» таблиця працює лише з JS).
 * Окрема сторінка, а не <noscript> на «Пілоти»: там перелік на 793 рядки дублювався в даних React і
 * додавав ~95 КБ вбудованих скриптів (Lighthouse CI 12.11: TBT 374–408 мс).
 */
export default async function DriversAllPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const nf = new Intl.NumberFormat(lang);
  const rows = selectDrivers(await getDriversIndex(lang), DEFAULT_DRIVERS_QUERY, lang);
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <div className="wrap">
          <a href={localizedPath("/drivers", lang)}>{dict.nav.drivers}</a>
          <span className="sep" aria-hidden="true">/</span>
          <span aria-current="page">{dict.drivers.allList}</span>
        </div>
      </nav>
      <section className="sec drv">
        <div className="wrap">
          <div className="sec-head">
            <h1 className="display">{dict.drivers.allList}</h1>
            <span className="src">{dict.drivers.allListNote}</span>
          </div>
          <ol className="drv-noscript">
            {rows.map((r) => (
              <li key={r.id}>{`${r.name} (${r.years[0]}–${r.years[1]}): ${nf.format(r.wins)} / ${nf.format(r.starts)}`}</li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
