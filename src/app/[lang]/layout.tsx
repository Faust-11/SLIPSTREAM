import type { Metadata, Viewport } from "next";
import { locales, type Locale } from "@/i18n/config";
import { requireLocale } from "@/i18n/require-locale";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { RouteFocus } from "@/components/site/route-focus";
import "@/components/site/site.css";
// Стилі розділів — у спільному файлі, а не на сторінці: prefetch пунктів меню передзавантажує CSS
// маршруту, і на кожній іншій сторінці браузер попереджав «preloaded but not used» (замір 11.11).
import "@/components/teams/teams.css";
import "@/components/team/team.css";
import "@/components/drivers/drivers.css";
import "@/components/driver/driver.css";
import "@/components/seasons/seasons.css";
import "@/components/season/season.css";
import "@/components/race/race.css";
import "@/components/circuits/circuits.css";
import "@/components/calendar/calendar.css";
import "@/components/news/news.css";
import "@/components/home/home.css";
import "@/components/game/game.css";
import "@/components/stories/stories.css";
import "@/components/glossary/glossary.css";
import "@/components/newbie/newbie.css";
import { ThemeRestore } from "@/components/theme/theme-restore";
import { ThemeScript } from "@/components/theme/theme-script";
import { getDictionary } from "@/i18n/get-dictionary";
import { robotsMetadata, SITE_ICONS, siteUrl } from "@/lib/seo";
import { THEME_COLOR } from "@/lib/theme";
import { fontVariables } from "../fonts";
import "../globals.css";

export const dynamicParams = false;

// Колір панелі браузера = колір шапки (--head-bg) за системною темою; явний вибір перемикача
// переписує його в браузері (applyThemeColor).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
};

export function generateStaticParams(): { lang: Locale }[] {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  return {
    metadataBase: siteUrl(),
    applicationName: dict.site.name,
    title: { default: dict.site.name, template: `%s · ${dict.site.name}` },
    // За замовчуванням для всіх сторінок (pageMetadata лише повторює те саме).
    robots: robotsMetadata(),
    ...SITE_ICONS,
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);

  return (
    // suppressHydrationWarning: data-theme на <html> ставить ThemeScript до гідратації.
    <html lang={lang} className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeRestore />
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
