import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NAV, type NavKey } from "@/config/nav";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { pageMetadata } from "@/lib/seo";
import { SectionHero } from "./section-hero";

type Props = { params: Promise<{ lang: string }> };

/** Сторінка розділу-заготовки: перший екран + метадані (спільні для 9 розділів фази 1). */
export function sectionPage(section: NavKey) {
  const path = NAV.find((item) => item.key === section)!.href;

  async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    if (!isLocale(lang)) return {};
    const dict = await getDictionary(lang);
    return pageMetadata({ locale: lang, path, title: dict.nav[section], description: dict.meta.sections[section] });
  }

  async function Page({ params }: Props) {
    const { lang } = await params;
    if (!isLocale(lang)) notFound();
    const dict = await getDictionary(lang);
    return <SectionHero section={section} title={dict.nav[section]} />;
  }

  return { generateMetadata, Page };
}
