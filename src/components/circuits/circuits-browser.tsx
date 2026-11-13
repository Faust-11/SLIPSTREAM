"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { localizedPath } from "@/i18n/paths";
import {
  CIRCUITS_FILTERS,
  CIRCUITS_SORTS,
  circuitsQueryString,
  DEFAULT_CIRCUITS_QUERY,
  parseCircuitsQuery,
  selectCircuits,
  withCircuitsQuery,
  type CircuitsFilter,
  type CircuitsQuery,
  type CircuitsSort,
} from "@/lib/circuits-list";
import type { CircuitCard as CircuitCardData } from "@/lib/data/circuits";
import { plural } from "@/lib/plural";
import { CircuitCard, type CircuitCardLabels } from "./circuit-card";

type PluralForms = { one: string; few: string; many: string; other: string };

export type CircuitsBrowserLabels = {
  card: CircuitCardLabels;
  tools: string;
  search: string;
  searchPlaceholder: string;
  filtersLabel: string;
  filters: Record<CircuitsFilter, string>;
  sort: string;
  sorts: Record<CircuitsSort, string>;
  count: PluralForms;
  empty: string;
  reset: string;
  more: string;
};

type Props = { cards: CircuitCardData[]; locale: Locale; season: number; fromYear: number; pageSize: number; labels: CircuitsBrowserLabels };

/** Стан з адреси — у власній межі Suspense: решта списку гідратується з серверного HTML (урок «Команд»). */
function QuerySync({ onParams }: { onParams: (q: CircuitsQuery) => void }) {
  const key = useSearchParams().toString();
  useEffect(() => onParams(parseCircuitsQuery(new URLSearchParams(key))), [key, onParams]);
  return null;
}

/**
 * Список трас: пошук, фільтр, сортування; стан — у URL. Усі 78 карток у DOM (content-visibility: auto — поза
 * екраном не малюються); зміна порядку переставляє ті самі вузли (ключі React), результат оголошує один role="status"
 * (настанова «Handling dynamic user-triggered changes to sort order»).
 */
export function CircuitsBrowser({ cards, locale, season, fromYear, pageSize, labels }: Props) {
  const [query, setQuery] = useState<CircuitsQuery>(DEFAULT_CIRCUITS_QUERY);
  // Скільки показано — для конкретного стану (за ідентичністю об'єкта): нова зміна пошуку/фільтра скидає до pageSize.
  const [page, setPage] = useState<{ of: CircuitsQuery; n: number }>({ of: query, n: pageSize });
  const [synced, setSynced] = useState(false);
  const tools = useRef<HTMLDivElement>(null);
  const focusFrom = useRef<number | null>(null);
  const selected = useMemo(() => selectCircuits(cards, query, locale), [cards, query, locale]);
  const defaultOrder = useMemo(() => selectCircuits(cards, DEFAULT_CIRCUITS_QUERY, locale), [cards, locale]);
  const shown = page.of === query ? page.n : pageSize;
  const visible = selected.slice(0, shown);
  const left = Math.max(0, selected.length - shown);
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  useEffect(() => {
    if (focusFrom.current === null) return;
    const target = document.querySelectorAll<HTMLElement>(".ct-grid .ct-card h3 a")[focusFrom.current];
    focusFrom.current = null;
    target?.focus();
  }, [shown]);

  const set = (patch: Partial<CircuitsQuery>) => {
    const next = { ...query, ...patch };
    if (circuitsQueryString(next) !== circuitsQueryString(query)) setQuery(next);
  };
  const onParams = useCallback((q: CircuitsQuery) => {
    setQuery((prev) => (circuitsQueryString(prev) === circuitsQueryString(q) ? prev : q));
    setSynced(true);
  }, []);

  useEffect(() => {
    if (!synced) return;
    const next = withCircuitsQuery(window.location.search, query);
    if (next !== (window.location.search === "?" ? "" : window.location.search)) {
      window.history.replaceState(null, "", `${window.location.pathname}${next}${window.location.hash}`);
    }
  }, [query, synced]);

  useEffect(() => {
    if (synced) document.documentElement.removeAttribute("data-list-query");
  }, [synced]);

  // Висота липкої панелі → scroll-padding-top (фокус не ховається під панеллю).
  useEffect(() => {
    const el = tools.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--ct-tools-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--ct-tools-h");
    };
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <QuerySync onParams={onParams} />
      </Suspense>
      <div className="ct-tools" ref={tools} role="search" aria-label={labels.tools}>
        <div className="wrap">
          <div className="ct-search">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
            </svg>
            <input
              type="search"
              className="ct-q"
              name="q"
              aria-label={labels.search}
              placeholder={labels.searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              maxLength={100}
              value={query.q}
              onChange={(e) => set({ q: e.target.value })}
            />
          </div>
          <div className="ct-chips" role="group" aria-label={labels.filtersLabel}>
            {CIRCUITS_FILTERS.map((f) => (
              <button key={f} type="button" className="ct-chip" aria-pressed={query.f === f} onClick={() => set({ f })}>
                {fill(labels.filters[f], { season })}
              </button>
            ))}
          </div>
          <label className="ct-sort">
            <span>{labels.sort}</span>
            <select value={query.sort} onChange={(e) => set({ sort: e.target.value as CircuitsSort })}>
              {CIRCUITS_SORTS.map((s) => (
                <option key={s} value={s}>
                  {labels.sorts[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="wrap ct-body">
        <p className="ct-count num" role="status">
          {fill(plural(selected.length, locale, labels.count), { n: selected.length })}
        </p>
        <ul className="ct-grid">
          {visible.map((c) => (
            <li key={c.ref}>
              <CircuitCard c={c} labels={labels.card} locale={locale} season={season} fromYear={fromYear} />
            </li>
          ))}
        </ul>
        {/* Без JS — решта трас компактним переліком (з JS вміст <noscript> не потрапляє в DOM): повні 78 карток —
            ~300 КБ HTML, що з JS лише розбирається (урок «Команд»: TBT > 400 мс). */}
        <noscript>
          <ol className="ct-rest" start={pageSize + 1}>
            {defaultOrder.slice(pageSize).map((c) => (
              <li key={c.ref}>
                <a href={localizedPath(`/circuits/${c.slug}`, locale)} translate="no">
                  {c.name}
                </a>{" "}
                · {[c.place, c.country].filter(Boolean).join(", ")} · {labels.card.races} {nf.format(c.races)}
              </li>
            ))}
          </ol>
        </noscript>
        {selected.length === 0 && (
          <div className="ct-empty">
            <p>{labels.empty}</p>
            <button
              type="button"
              className="ct-reset"
              onClick={() => {
                setQuery({ ...DEFAULT_CIRCUITS_QUERY });
                document.querySelector<HTMLInputElement>(".ct-q")?.focus();
              }}
            >
              {labels.reset}
            </button>
          </div>
        )}
        {left > 0 && (
          <button
            type="button"
            className="ct-more"
            onClick={() => {
              focusFrom.current = shown;
              setPage({ of: query, n: shown + pageSize });
            }}
          >
            {fill(labels.more, { n: Math.min(left, pageSize), left })}
          </button>
        )}
      </div>
    </>
  );
}
