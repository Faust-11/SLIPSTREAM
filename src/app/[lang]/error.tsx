"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { defaultLocale, isLocale } from "@/i18n/config";
import { ERROR_TEXT } from "@/i18n/error-text";
import { localizedPath } from "@/i18n/paths";

// Next 16.4: межа помилки отримує `retry` (docs: 03-file-conventions/error.md).
// Серверна помилка під час рендеру віддає порожній документ (той самий клас, що vercel/next.js#62228):
// цей UI з'являється після гідратації; при клієнтському переході — одразу.
export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  const params = useParams<{ lang: string }>();
  const value = params.lang ?? "";
  const locale = isLocale(value) ? value : defaultLocale;
  const t = ERROR_TEXT[locale];

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="section-hero" data-section="error">
      <div className="wrap">
        <h1 className="display">{t.title}</h1>
        <div className="hero-actions">
          <button type="button" className="btn" onClick={() => retry()}>
            {t.retry}
          </button>
          <Link className="btn btn-ghost" href={localizedPath("/", locale)}>
            {t.home}
          </Link>
        </div>
      </div>
    </section>
  );
}
