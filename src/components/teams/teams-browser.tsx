"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import type { TeamCard as TeamCardData } from "@/lib/data/teams";
import { plural } from "@/lib/plural";
import {
  parseTeamsQuery,
  selectTeams,
  TEAMS_FILTERS,
  TEAMS_SORTS,
  teamsQueryString,
  type TeamsFilter,
  type TeamsQuery,
  type TeamsSort,
} from "@/lib/teams-list";
import { TeamCard, type TeamCardLabels } from "./team-card";

type PluralForms = { one: string; few: string; many: string; other: string };

export type TeamsBrowserLabels = {
  card: TeamCardLabels;
  search: string;
  searchPlaceholder: string;
  filtersLabel: string;
  filters: Record<TeamsFilter, string>;
  sortLabel: string;
  sorts: Record<TeamsSort, string>;
  empty: string;
  emptyQuery: string;
  reset: string;
  more: string;
  found: PluralForms;
};

type Props = {
  /** Порядок за замовчуванням (sort=p вже застосовано на сервері). */
  cards: TeamCardData[];
  locale: Locale;
  season: number;
  pageSize: number;
  labels: TeamsBrowserLabels;
};

const DEFAULT_QUERY: TeamsQuery = { q: "", f: "all", sort: "p" };

/**
 * Читає стан списку з адреси й повідомляє про кожну зміну (перший показ, клік «Команди» в шапці,
 * Back/Forward). Окремий компонент у власному Suspense: `useSearchParams` на статичній сторінці
 * переводить у клієнтський рендер лише свою межу Suspense (docs use-search-params.md) — тож сам
 * список гідратується з серверного HTML, а не перемальовується наново (рев'ю: 164 картки знищувались).
 */
function QuerySync({ onParams }: { onParams: (q: TeamsQuery) => void }) {
  const params = useSearchParams();
  const key = params.toString();
  useEffect(() => {
    onParams(parseTeamsQuery(new URLSearchParams(key)));
  }, [key, onParams]);
  return null;
}

/** Адреса з новим станом списку; сторонні параметри (utm_*, fbclid…) і #хеш лишаються. */
export function withTeamsQuery(search: string, query: TeamsQuery): string {
  const params = new URLSearchParams(search);
  for (const k of ["q", "f", "sort"]) params.delete(k);
  const ours = new URLSearchParams(teamsQueryString(query).slice(1));
  const merged = new URLSearchParams([...ours, ...params]);
  const s = merged.toString();
  return s ? `?${s}` : "";
}

/**
 * Список команд: пошук, фільтр, сортування, «Показати ще». Стан — у URL (`?q=&f=&sort=`).
 * Сервер віддає перші `pageSize` карток у порядку за замовчуванням (їх гідратує React) і решту — у
 * `<noscript>`: без JS видно всі, з JS їх немає в DOM. Після гідратації QuerySync застосовує стан з адреси.
 */
export function TeamsBrowser({ cards, locale, season, pageSize, labels }: Props) {
  const [query, setQuery] = useState<TeamsQuery>(DEFAULT_QUERY);
  // Скільки показано — для конкретного стану списку (за ідентичністю об'єкта): будь-яка справжня зміна
  // пошуку/фільтра/сортування (новий об'єкт) скидає до pageSize; повторний клік активного чипа — ні.
  const [page, setPage] = useState<{ of: TeamsQuery; n: number }>({ of: query, n: pageSize });
  const [synced, setSynced] = useState(false);
  const shown = page.of === query ? page.n : pageSize;
  // Перша нововідкрита картка після «Показати ще» — отримує фокус (кнопка може зникнути).
  const focusFrom = useRef<number | null>(null);
  const tools = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => selectTeams(cards, query, locale), [cards, query, locale]);
  const left = Math.max(0, selected.length - shown);
  const visible = selected.slice(0, shown);

  const set = (patch: Partial<TeamsQuery>) => {
    const next = { ...query, ...patch };
    if (teamsQueryString(next) !== teamsQueryString(query)) setQuery(next);
  };

  // Стан з адреси — лише якщо він інший (наш власний replaceState повертається сюди ж і нічого не змінює).
  const onParams = useCallback((q: TeamsQuery) => {
    setQuery((prev) => (teamsQueryString(prev) === teamsQueryString(q) ? prev : q));
    setSynced(true);
  }, []);

  // Стан → адреса (replaceState: без нових записів історії; Next синхронізує useSearchParams).
  // До першої синхронізації не пишемо, інакше стан за замовчуванням затер би параметри посилання.
  useEffect(() => {
    if (!synced) return;
    const next = withTeamsQuery(window.location.search, query);
    if (next !== (window.location.search === "?" ? "" : window.location.search)) {
      window.history.replaceState(null, "", `${window.location.pathname}${next}${window.location.hash}`);
    }
  }, [query, synced]);

  // Список відфільтровано — показуємо (див. data-list-query у themeScriptSource).
  useEffect(() => {
    if (synced) document.documentElement.removeAttribute("data-list-query");
  }, [synced]);

  useEffect(() => {
    if (focusFrom.current === null) return;
    const target = document.querySelectorAll<HTMLElement>(".teams-grid .tc")[focusFrom.current];
    focusFrom.current = null;
    target?.focus();
  }, [shown]);

  // Висота липкої панелі (1 чи 2 ряди) → scroll-padding-top, щоб панель не перекривала елемент у фокусі.
  useEffect(() => {
    const el = tools.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--teams-tools-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--teams-tools-h");
    };
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <QuerySync onParams={onParams} />
      </Suspense>
      <div className="teams-tools" ref={tools}>
        <div className="wrap">
          <div className="teams-search">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
            </svg>
            <input
              type="search"
              className="teams-q"
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
          <div className="chips" role="group" aria-label={labels.filtersLabel}>
            {TEAMS_FILTERS.map((f) => (
              <button key={f} type="button" className="chip" aria-pressed={query.f === f} onClick={() => set({ f })}>
                {fill(labels.filters[f], { year: season })}
              </button>
            ))}
          </div>
          <label className="sort">
            <span>{labels.sortLabel}</span>
            <select value={query.sort} onChange={(e) => set({ sort: e.target.value as TeamsSort })}>
              {TEAMS_SORTS.map((s) => (
                <option key={s} value={s}>
                  {fill(labels.sorts[s], { year: season })}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="wrap teams-body">
        <p className="teams-count num" role="status">
          {fill(plural(selected.length, locale, labels.found), { n: selected.length })}
        </p>
        <div className="teams-grid">
          {visible.map((card, i) => (
            <TeamCard key={card.id} card={card} labels={labels.card} locale={locale} season={season} index={i} />
          ))}
        </div>
        {/* Без JS — решта карток (з JS вміст <noscript> не потрапляє в DOM). */}
        <noscript>
          <div className="teams-grid teams-grid-rest">
            {cards.slice(pageSize).map((card, i) => (
              <TeamCard key={card.id} card={card} labels={labels.card} locale={locale} season={season} index={pageSize + i} />
            ))}
          </div>
        </noscript>
        {selected.length === 0 && (
          <div className="teams-empty">
            <p>{query.q.trim() ? fill(labels.emptyQuery, { q: query.q.trim() }) : labels.empty}</p>
            <button
              type="button"
              className="btn-line"
              onClick={() => {
                setQuery({ ...DEFAULT_QUERY });
                document.querySelector<HTMLInputElement>(".teams-q")?.focus();
              }}
            >
              {labels.reset}
            </button>
          </div>
        )}
        {left > 0 && (
          <button
            type="button"
            className="teams-more"
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
