"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { normalizeSearch } from "@/lib/teams-list";
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
 * Список трас: пошук, фільтр, сортування; стан — у URL. Перші pageSize карток + «Показати ще» (без JS — решта в
 * <noscript>, урок TBT «Команд»; поза екраном картки не малюються — content-visibility: auto); зміна порядку
 * переставляє ті самі вузли (ключі React), результат оголошує один role="status"
 * (настанова «Handling dynamic user-triggered changes to sort order»).
 */
/** Ключ вибірки для «Показати ще»: нормалізований пошук + фільтр + сортування. */
const viewKey = (x: CircuitsQuery) => JSON.stringify([normalizeSearch(x.q), x.f, x.sort]);

export function CircuitsBrowser({ cards, locale, season, fromYear, pageSize, labels }: Props) {
  const [query, setQuery] = useState<CircuitsQuery>(DEFAULT_CIRCUITS_QUERY);
  // Скільки показано — для конкретного стану (за ідентичністю об'єкта): нова зміна пошуку/фільтра скидає до pageSize.
  const [page, setPage] = useState<{ of: CircuitsQuery; n: number }>({ of: query, n: pageSize });
  const [synced, setSynced] = useState(false);
  const tools = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const focusFrom = useRef<number | null>(null);
  const selected = useMemo(() => selectCircuits(cards, query, locale), [cards, query, locale]);
  const defaultOrder = useMemo(() => selectCircuits(cards, DEFAULT_CIRCUITS_QUERY, locale), [cards, locale]);
  // «Показати ще» скидається лише при іншій вибірці: пробіл у кінці слова — та сама вибірка (code-review PR #18).
  const shown = viewKey(page.of) === viewKey(query) ? page.n : pageSize;
  const visible = selected.slice(0, shown);
  const left = Math.max(0, selected.length - shown);
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  useEffect(() => {
    if (focusFrom.current === null) return;
    const target = document.querySelectorAll<HTMLElement>(".ct-grid .ct-card .ct-title a")[focusFrom.current];
    focusFrom.current = null;
    target?.focus();
  }, [shown]);

  // Остання адреса, яку записали ми самі: її «луну» з useSearchParams ігноруємо — інакше застаріла адреса
  // перезаписує новіший стан під час швидкого набору (рев'ю 13.11: «siverstone», як було в «Пілотах» до 12.11).
  const written = useRef<string | null>(null);
  // Користувач змінив стан до першої синхронізації з адресою (набрав пошук до гідратації QuerySync) — перше читання
  // адреси не має затерти його ввід (e2e 13.11: «японія» → 24 картки замість 3).
  const dirty = useRef(false);
  // Текст, набраний у серверне поле до гідратації (onChange ще не працює), — підхопити до першого рендеру з
  // ефектами; useLayoutEffect — до того, як React звірить контрольоване поле зі станом (замір 13.11: 1 з 2 ранніх
  // наборів губився — поле порожнє, 24 картки).
  useLayoutEffect(() => {
    const typed = input.current?.value ?? "";
    if (typed) {
      dirty.current = true;
      setQuery((prev) => (prev.q === typed ? prev : { ...prev, q: typed }));
    }
  }, []);
  const set = (patch: Partial<CircuitsQuery>) => {
    dirty.current = true;
    // Порівняння — за станом, а не за адресою: адреса обрізає пробіли, і пробіл у пошуку губився.
    const next = { ...query, ...patch };
    if (JSON.stringify(next) === JSON.stringify(query)) return;
    // Інша вибірка — «Показати ще» з початку, навіть якщо згодом повернуться до попередньої (Усі → Переможці → Усі).
    if (viewKey(next) !== viewKey(query)) setPage({ of: next, n: pageSize });
    setQuery(next);
  };
  const onParams = useCallback((q: CircuitsQuery) => {
    const incoming = circuitsQueryString(q);
    // Перше читання адреси після вводу до гідратації: параметри посилання (фільтр, сортування) — з адреси, пошук —
    // той, що набрав користувач (code-review PR #18: інакше ?f=…&sort=… з посилання губились).
    if (written.current === null && dirty.current) {
      setQuery((prev) => ({ ...q, q: prev.q }));
      setSynced(true);
      return;
    }
    if (written.current !== null && incoming === written.current) {
      setSynced(true);
      return;
    }
    // Запізніла луна старішої власної адреси: адреса в рядку вже новіша — не наш перехід, ігноруємо (code-review
    // PR #18: written пам'ятає лише останню записану адресу). Справжній перехід (Back/Forward, меню) змінює і її.
    if (written.current !== null && incoming !== circuitsQueryString(parseCircuitsQuery(new URLSearchParams(window.location.search)))) {
      setSynced(true);
      return;
    }
    setQuery((prev) => (circuitsQueryString(prev) === incoming ? prev : q));
    setSynced(true);
  }, []);

  useEffect(() => {
    if (!synced) return;
    written.current = circuitsQueryString(query);
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
              ref={input}
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
