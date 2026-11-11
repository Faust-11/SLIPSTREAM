import type { Metadata } from "next";
import { Brand } from "@/components/site/brand";
import { navItems } from "@/components/site/header";
import { Livery } from "@/components/site/livery";
import "@/components/site/site.css";
import { ThemeScript } from "@/components/theme/theme-script";
import { locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { fontVariables } from "./fonts";
import "./globals.css";

// Статична сторінка (динамічна разом із proxy ламала RSC-запити: InvariantError → 500). Без JS — обидві мови;
// з JS скрипт до першого кадру вибирає мову за адресою: html[lang] і видима секція.
// Заголовок вкладки однаковий для обох мов: React під час гідратації повертає текст <title>.
const LANG_SCRIPT = `(function(){var p=location.pathname,l=p==="/uk"||p.indexOf("/uk/")===0?"uk":"en",d=document.documentElement;d.lang=l;d.setAttribute("data-nf-lang",l)})()`;

export const metadata: Metadata = { title: "404 · Slipstream" };

export default async function GlobalNotFound() {
  const dicts = await Promise.all(locales.map(async (locale) => ({ locale, dict: await getDictionary(locale) })));

  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
        <script dangerouslySetInnerHTML={{ __html: LANG_SCRIPT }} />
      </head>
      <body>
        <header className="site-head">
          <div className="wrap">
            {dicts.map(({ locale, dict }) => (
              <div key={locale} data-nf={locale} lang={locale} className="nf-brand">
                <Brand href={localizedPath("/", locale)} label={dict.header.home} name="SLIPSTREAM" />
              </div>
            ))}
          </div>
        </header>
        <Livery />
        <main id="main">
          {dicts.map(({ locale, dict }) => (
            <section key={locale} lang={locale} data-nf={locale} className="section-hero not-found">
              <div className="wrap">
                <p className="eyebrow">404</p>
                <h1 className="display">{dict.notFound.title}</h1>
                <div className="hero-actions">
                  <a className="btn" href={localizedPath("/", locale)}>
                    {dict.notFound.home}
                  </a>
                </div>
                <nav aria-label={dict.notFound.sections} className="nf-sections">
                  <ul>
                    {navItems(locale, dict).map((item) => (
                      <li key={item.key}>
                        <a href={item.href}>{item.label}</a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </section>
          ))}
        </main>
        <footer className="site-foot">
          <div className="wrap">
            {dicts.map(({ locale, dict }) => (
              <div key={locale} data-nf={locale} lang={locale}>
                <span className="unofficial">{dict.footer.unofficial}</span>
                <p>{dict.footer.disclaimer}</p>
              </div>
            ))}
          </div>
        </footer>
      </body>
    </html>
  );
}
