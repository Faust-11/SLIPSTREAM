"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import type { TeamCard as TeamCardData } from "@/lib/data/teams";
import { plural } from "@/lib/plural";
import { seasonsText } from "@/lib/season-strip";
import {
  normalizeSearch,
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
  /** Усі команди (порядок знімка; порядок показу визначає selectTeams). */
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
/** Ключ вибірки для «Показати ще»: нормалізований пошук + фільтр + сортування. */
const viewKey = (x: TeamsQuery) => JSON.stringify([normalizeSearch(x.q), x.f, x.sort]);

export function TeamsBrowser({ cards, locale, season, pageSize, labels }: Props) {
  const [query, setQuery] = useState<TeamsQuery>(DEFAULT_QUERY);
  // Скільки показано — для конкретного стану списку (за ідентичністю об'єкта): будь-яка справжня зміна
  // пошуку/фільтра/сортування (новий об'єкт) скидає до pageSize; повторний клік активного чипа — ні.
  const [page, setPage] = useState<{ of: TeamsQuery; n: number }>({ of: query, n: pageSize });
  const [synced, setSynced] = useState(false);
  // «Показати ще» скидається лише при іншій вибірці: пробіл у кінці слова — та сама вибірка (code-review PR #18).
  const shown = viewKey(page.of) === viewKey(query) ? page.n : pageSize;
  // Перша нововідкрита картка після «Показати ще» — отримує фокус (кнопка може зникнути).
  const focusFrom = useRef<number | null>(null);
  const tools = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => selectTeams(cards, query, locale), [cards, query, locale]);
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  // Порядок за замовчуванням (sort=p) — для серверних перших 24 і <noscript>-решти: обидва з одного
  // списку, інакше без JS частина команд двічі, а частина — ніде (code-review PR #5: знімок упорядкований інакше).
  const defaultOrder = useMemo(() => selectTeams(cards, DEFAULT_QUERY, locale), [cards, locale]);
  const left = Math.max(0, selected.length - shown);
  const visible = selected.slice(0, shown);

  // Остання адреса, яку записали ми самі: її «луну» з useSearchParams ігноруємо — інакше застаріла адреса
  // перезаписує новіший стан під час швидкого набору (замір 13.11 на main: 4 з 6 наборів «mclaren mercedes»
  // зіпсовано; як у «Пілотах» з 12.11 і «Трасах»).
  const written = useRef<string | null>(null);
  // Ввід до гідратації (замір 13.11: 2 з 6 ранніх наборів губилися): текст із серверного поля підхоплюємо в
  // useLayoutEffect, а перше читання адреси не затирає стан, який користувач уже змінив.
  const input = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  useLayoutEffect(() => {
    const typed = input.current?.value ?? "";
    if (typed) {
      dirty.current = true;
      setQuery((prev) => (prev.q === typed ? prev : { ...prev, q: typed }));
    }
  }, []);
  const set = (patch: Partial<TeamsQuery>) => {
    dirty.current = true;
    // Порівняння — за станом, а не за адресою: адреса обрізає пробіли, і пробіл на початку слова губився б.
    const next = { ...query, ...patch };
    if (JSON.stringify(next) === JSON.stringify(query)) return;
    // Інша вибірка — «Показати ще» з початку, навіть якщо згодом повернуться до попередньої (Усі → Переможці → Усі).
    if (viewKey(next) !== viewKey(query)) setPage({ of: next, n: pageSize });
    setQuery(next);
  };

  // Стан з адреси — лише якщо він інший (наш власний replaceState повертається сюди ж і нічого не змінює).
  const onParams = useCallback((q: TeamsQuery) => {
    const incoming = teamsQueryString(q);
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
    if (written.current !== null && incoming !== teamsQueryString(parseTeamsQuery(new URLSearchParams(window.location.search)))) {
      setSynced(true);
      return;
    }
    setQuery((prev) => (teamsQueryString(prev) === incoming ? prev : q));
    setSynced(true);
  }, []);

  // Стан → адреса (replaceState: без нових записів історії; Next синхронізує useSearchParams).
  // До першої синхронізації не пишемо, інакше стан за замовчуванням затер би параметри посилання.
  useEffect(() => {
    if (!synced) return;
    written.current = teamsQueryString(query);
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
              ref={input}
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
        {/* Без JS — решта команд компактним списком (з JS вміст <noscript> не потрапляє в DOM).
            Не повні картки: 140 карток із фото — 203 КБ HTML, що з JS лише розбирається (Lighthouse CI:
            TBT 437–452 мс > 400). */}
        <noscript>
          <ol className="teams-rest" start={pageSize + 1}>
            {defaultOrder.slice(pageSize).map((card) => (
              <li key={card.id}>
                <b translate="no">{card.name}</b> · {card.country} · <span className="num">{seasonsText(card.seasons)}</span> ·{" "}
                {labels.card.stats.grandsPrix} {nf.format(card.grandsPrix)} · {labels.card.stats.wins} {nf.format(card.wins)} ·{" "}
                {labels.card.stats.titles} {nf.format(card.titles)}
              </li>
            ))}
          </ol>
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
