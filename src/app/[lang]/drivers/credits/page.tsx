import type { Metadata } from "next";
import { PageCredits } from "@/components/teams/page-credits";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getDriversCredits } from "@/lib/data/drivers";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const t = (await getDictionary(lang)).drivers;
  return pageMetadata({ locale: lang, path: "/drivers/credits", title: t.credits, description: t.credits });
}

/**
 * Автори й ліцензії портретів пілотів — окрема сторінка: ~450 посилань на Commons займали ~190 КБ
 * з 400 КБ даних сторінки «Пілоти» (рев'ю 12.11). Зі сторінки «Пілоти» — посилання внизу.
 */
export default async function DriversCreditsPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const credits = await getDriversCredits();
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <div className="wrap">
          <a href={localizedPath("/drivers", lang)}>{dict.nav.drivers}</a>
          <span className="sep" aria-hidden="true">/</span>
          <span aria-current="page">{dict.drivers.credits}</span>
        </div>
      </nav>
      <h1 className="sr-only">{dict.drivers.credits}</h1>
      <PageCredits
        open
        groups={[{ title: dict.drivers.credits, items: credits.map((c) => ({ label: c.driver, href: c.page, author: c.author, license: c.license })) }]}
      />
    </>
  );
}
