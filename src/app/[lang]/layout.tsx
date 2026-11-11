import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { RouteFocus } from "@/components/site/route-focus";
import "@/components/site/site.css";
import { ThemeScript } from "@/components/theme/theme-script";
import { getDictionary } from "@/i18n/get-dictionary";
import { robotsMetadata, siteUrl } from "@/lib/seo";
import { fontVariables } from "../fonts";
import "../globals.css";

export const dynamicParams = false;

// Колір панелі браузера = колір шапки (вона темна в обох темах).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#16181d" },
    { media: "(prefers-color-scheme: dark)", color: "#07080a" },
  ],
};

export function generateStaticParams(): { lang: Locale }[] {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    metadataBase: siteUrl(),
    applicationName: dict.site.name,
    title: { default: dict.site.name, template: `%s · ${dict.site.name}` },
    // За замовчуванням для всіх сторінок (pageMetadata лише повторює те саме).
    robots: robotsMetadata(),
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    // suppressHydrationWarning: data-theme на <html> ставить ThemeScript до гідратації.
    <html lang={lang} className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <a className="skip-link" href="#main">
          {dict.header.skip}
        </a>
        <Header locale={lang} dict={dict} />
        <main id="main" tabIndex={-1} data-mnav-inert>
          {children}
        </main>
        <Footer locale={lang} dict={dict} />
        <RouteFocus />
      </body>
    </html>
  );
}
