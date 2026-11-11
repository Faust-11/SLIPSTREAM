"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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

type ViewProps = Props & {
  query: TeamsQuery;
  shown: number;
  /** Немає — серверний фолбек: усі картки в DOM (без JS видно всі), інструменти неактивні до гідратації. */
  live?: {
    setQuery: (q: TeamsQuery) => void;
    showMore: () => void;
    reset: () => void;
  };
};

function TeamsView({ cards, locale, season, pageSize, labels, query, shown, live }: ViewProps) {
  const selected = useMemo(() => selectTeams(cards, query, locale), [cards, query, locale]);
  const left = Math.max(0, selected.length - shown);
  const visible = live ? selected.slice(0, shown) : selected;
  const set = (patch: Partial<TeamsQuery>) => live?.setQuery({ ...query, ...patch });

  return (
    <>
      <div className="teams-tools">
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
              readOnly={!live}
              onChange={(e) => set({ q: e.target.value })}
            />
          </div>
          <div className="chips" role="group" aria-label={labels.filtersLabel}>
            {TEAMS_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className="chip"
                aria-pressed={query.f === f}
                onClick={() => set({ f })}
              >
                {fill(labels.filters[f], { year: season })}
              </button>
            ))}
          </div>
          <label className="sort">
            <span>{labels.sortLabel}</span>
            <select value={query.sort} onChange={(e) => set({ sort: e.target.value as TeamsSort })} disabled={!live}>
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
        <p className="sr-only" role="status">
          {live ? fill(plural(selected.length, locale, labels.found), { n: selected.length }) : ""}
        </p>
        <div className="teams-grid">
          {visible.map((card, i) => (
            <TeamCard
              key={card.id}
              card={card}
              labels={labels.card}
              season={season}
              index={i}
              later={!live && i >= shown}
            />
          ))}
        </div>
        {selected.length === 0 && (
          <div className="teams-empty">
            <p>{labels.empty}</p>
            <button type="button" className="btn-line" onClick={live?.reset}>
              {labels.reset}
            </button>
          </div>
        )}
        {left > 0 && (
          <button type="button" className="teams-more" onClick={live?.showMore}>
            {fill(labels.more, { n: Math.min(left, pageSize), left })}
          </button>
        )}
      </div>
    </>
  );
}

function LiveTeams(props: Props) {
  const params = useSearchParams();
  const [query, setQueryState] = useState<TeamsQuery>(() => parseTeamsQuery(new URLSearchParams(params.toString())));
  const [shown, setShown] = useState(props.pageSize);
  // Перша нововідкрита картка після «Показати ще» — отримує фокус (кнопка може зникнути).
  const focusFrom = useRef<number | null>(null);

  useEffect(() => {
    const qs = teamsQueryString(query);
    if (qs !== (window.location.search === "?" ? "" : window.location.search)) {
      // replaceState: не засмічуємо історію на кожну літеру; Next синхронізує useSearchParams (перемикач мови).
      window.history.replaceState(null, "", `${window.location.pathname}${qs}${window.location.hash}`);
    }
  }, [query]);

  useEffect(() => {
    if (focusFrom.current === null) return;
    const target = document.querySelectorAll<HTMLElement>(".teams-grid .tc")[focusFrom.current];
    focusFrom.current = null;
    target?.focus();
  }, [shown]);

  return (
    <TeamsView
      {...props}
      query={query}
      shown={shown}
      live={{
        setQuery: (q) => {
          setQueryState(q);
          setShown(props.pageSize);
        },
        showMore: () => {
          focusFrom.current = shown;
          setShown(shown + props.pageSize);
        },
        reset: () => {
          setQueryState(DEFAULT_QUERY);
          setShown(props.pageSize);
          document.querySelector<HTMLInputElement>(".teams-q")?.focus();
        },
      }}
    />
  );
}

/**
 * Список команд: пошук, фільтр, сортування, «Показати ще». Стан — у URL (`?q=&f=&sort=`).
 * Сервер (статичний пререндер) віддає фолбек з усіма картками в порядку за замовчуванням —
 * без JS видно всі; після гідратації клієнт читає query й показує по `pageSize`.
 */
export function TeamsBrowser(props: Props) {
  return (
    <Suspense fallback={<TeamsView {...props} query={DEFAULT_QUERY} shown={props.pageSize} />}>
      <LiveTeams {...props} />
    </Suspense>
  );
}
