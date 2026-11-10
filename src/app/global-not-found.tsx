import type { Metadata } from "next";
import { locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import "./globals.css";

// Статична сторінка (динамічна ламає RSC-запити: InvariantError → 500). Без JS — обидві мови;
// з JS скрипт до першого кадру вибирає мову за адресою: html[lang] і видима секція.
// Заголовок вкладки однаковий для обох мов: React під час гідратації повертає текст <title>.
const LANG_SCRIPT = `(function(){var p=location.pathname,l=p==="/uk"||p.indexOf("/uk/")===0?"uk":"en",d=document.documentElement;d.lang=l;d.setAttribute("data-nf-lang",l)})()`;

export const metadata: Metadata = { title: "404 · Slipstream" };

export default async function GlobalNotFound() {
  const dicts = await Promise.all(locales.map(async (locale) => ({ locale, dict: await getDictionary(locale) })));

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANG_SCRIPT }} />
      </head>
      <body>
        <main>
          {dicts.map(({ locale, dict }) => (
            <section key={locale} lang={locale} data-nf={locale}>
              <h1>{dict.notFound.title}</h1>
              <a href={localizedPath("/", locale)}>{dict.notFound.home}</a>
            </section>
          ))}
        </main>
      </body>
    </html>
  );
}
