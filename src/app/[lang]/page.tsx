import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  const meta = pageMetadata({ locale: lang, path: "/", title: dict.meta.home.title, description: dict.meta.home.description });
  // Головна — повна назва без шаблону «… · Slipstream».
  return { ...meta, title: { absolute: dict.meta.home.title } };
}

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <section className="section-hero" data-section="home">
      <div className="wrap">
        <h1 className="display">{dict.site.name}</h1>
        <p className="hero-tagline">{dict.site.tagline}</p>
      </div>
    </section>
  );
}
