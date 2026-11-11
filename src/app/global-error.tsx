"use client";

import { ERROR_TEXT } from "@/i18n/error-text";
import "./globals.css";

// Помилка в самому кореневому [lang]/layout: власний <html>, обидві мови (мова невідома), без зовнішніх залежностей.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 16px" }}>
          {(["en", "uk"] as const).map((locale) => (
            <section key={locale} lang={locale} style={{ marginBottom: 32 }}>
              <h1>{ERROR_TEXT[locale].title}</h1>
              <button type="button" className="btn" onClick={() => retry()}>
                {ERROR_TEXT[locale].retry}
              </button>
            </section>
          ))}
        </main>
      </body>
    </html>
  );
}
