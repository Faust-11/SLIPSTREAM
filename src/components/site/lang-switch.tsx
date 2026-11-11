"use client";

import Link from "next/link";
import { useSearchParams, useSelectedLayoutSegments } from "next/navigation";
import { Suspense } from "react";
import { FOCUS_MAIN_FLAG } from "./route-focus";
import { barePathFromSegments } from "@/config/nav";
import type { Locale } from "@/i18n/config";
import { switchLocalePath } from "@/i18n/paths";

type Props = { current: Locale; label: string; names: Record<Locale, string> };

// Порядок як у макеті: UK | EN.
const ORDER: readonly Locale[] = ["uk", "en"];

/** Шлях сторінки без мови — з дерева маршрутів (стабільно при rewrites, без розбіжності гідратації). */
function useBarePath(): string {
  return barePathFromSegments(useSelectedLayoutSegments());
}

/** Зміна мови перемонтовує кореневий layout — просимо RouteFocus після неї сфокусувати зміст. */
function markFocusMain() {
  try {
    sessionStorage.setItem(FOCUS_MAIN_FLAG, "1");
  } catch {
    // без сховища фокус лишиться за замовчуванням
  }
}

function Links({ current, label, names, query }: Props & { query: string }) {
  const bare = useBarePath();
  return (
    <div className="lang" role="group" aria-label={label}>
      {ORDER.map((locale) =>
        locale === current ? (
          <span key={locale} className="lang-item is-current" aria-current="true" lang={locale} title={names[locale]}>
            {locale.toUpperCase()}
          </span>
        ) : (
          <Link
            key={locale}
            className="lang-item"
            href={switchLocalePath(bare + query, locale)}
            hrefLang={locale}
            lang={locale}
            // Мову перемикають рідко — не передзавантажуємо іншомовну версію на кожній сторінці.
            prefetch={false}
            onClick={markFocusMain}
          >
            {/* Доступна назва містить видимий текст (WCAG 2.5.3): «UK — Українська». */}
            {locale.toUpperCase()}
            <span className="sr-only"> — {names[locale]}</span>
          </Link>
        ),
      )}
    </div>
  );
}

function WithQuery(props: Props) {
  const search = useSearchParams().toString();
  return <Links {...props} query={search ? `?${search}` : ""} />;
}

/**
 * Перемикач мови: та сама сторінка й параметри іншою мовою. Query доступний лише в браузері:
 * на сервері (статичний пререндер) — посилання без нього, після гідратації — з ним.
 */
export function LangSwitch(props: Props) {
  return (
    <Suspense fallback={<Links {...props} query="" />}>
      <WithQuery {...props} />
    </Suspense>
  );
}
