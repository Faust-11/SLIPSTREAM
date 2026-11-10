import type { Metadata } from "next";
import { headers } from "next/headers";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { LOCALE_HEADER, localizedPath } from "@/i18n/paths";
import "./globals.css";

async function requestLocale(): Promise<Locale> {
  const value = (await headers()).get(LOCALE_HEADER) ?? "";
  return isLocale(value) ? value : defaultLocale;
}

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary(await requestLocale());
  return { title: `${dict.notFound.title} · ${dict.site.name}` };
}

// Next 16: notFound() зі сторінки віддає порожній HTML (vercel/next.js#62228), тому 404 для всіх
// невідомих адрес — тут, на рівні маршрутизації (unmatched URL і dynamicParams=false).
export default async function GlobalNotFound() {
  const locale = await requestLocale();
  const dict = await getDictionary(locale);

  return (
    <html lang={locale}>
      <body>
        <main>
          <h1>{dict.notFound.title}</h1>
          <a href={localizedPath("/", locale)}>{dict.notFound.home}</a>
        </main>
      </body>
    </html>
  );
}
