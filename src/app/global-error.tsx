"use client";

import { useEffect } from "react";
import "@/components/site/site.css";
import { ERROR_TEXT } from "@/i18n/error-text";
import { readStoredTheme } from "@/lib/theme";
import "./globals.css";

// Помилка в самому кореневому [lang]/layout: власний <html>, обидві мови (мова невідома).
// Рендериться лише на клієнті після збою — тему зі сховища застосовуємо ефектом.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    let theme = null;
    try {
      theme = readStoredTheme(window.localStorage);
    } catch {
      // сховище недоступне — системна тема
    }
    if (theme) document.documentElement.setAttribute("data-theme", theme);
  }, []);

  return (
    <html lang="en">
      <body>
        <main className="wrap" style={{ paddingBlock: 64 }}>
          {(["en", "uk"] as const).map((locale) => (
            <section key={locale} lang={locale} style={{ marginBottom: 32 }}>
              <h1 className="display">{ERROR_TEXT[locale].title}</h1>
              <div className="hero-actions">
                <button type="button" className="btn" onClick={() => retry()}>
                  {ERROR_TEXT[locale].retry}
                </button>
              </div>
            </section>
          ))}
        </main>
      </body>
    </html>
  );
}
