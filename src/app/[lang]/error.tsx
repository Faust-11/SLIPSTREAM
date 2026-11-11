"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { defaultLocale, isLocale } from "@/i18n/config";
import en from "@/i18n/dictionaries/en.json";
import uk from "@/i18n/dictionaries/uk.json";
import { localizedPath } from "@/i18n/paths";

const TEXT = { en: en.error, uk: uk.error };

// Next 16.4: межа помилки отримує `retry` (docs: 03-file-conventions/error.md).
export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  const params = useParams<{ lang: string }>();
  const locale = isLocale(params.lang ?? "") ? (params.lang as keyof typeof TEXT) : defaultLocale;
  const t = TEXT[locale];

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
