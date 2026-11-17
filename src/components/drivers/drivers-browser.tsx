"use client";

import { fmtNumber } from "@/lib/fmt";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { localizedPath } from "@/i18n/paths";
import { driverPath } from "@/lib/driver-slug";
import type { DriverRow, PackedDriver } from "@/lib/data/drivers";
import {
  DEFAULT_DRIVERS_QUERY,
  DRIVER_DECADES,
  DRIVER_FILTERS,
  DRIVERS_PAGE_SIZE,
  driversQueryString,
  expandDriver,
  isDefaultView,
  firstLetter,
  paginate,
  parseDriversQuery,
  selectDrivers,
  type DriverFilter,
  type DriverSort,
  type DriversQuery,
} from "@/lib/drivers-list";

export type DriversBrowserLabels = {
  search: string;
  searchPlaceholder: string;
  filtersLabel: string;
  filters: Record<DriverFilter, string>;
  decade: string;
  decadeAll: string;
  decadeN: string;
  letters: string;
  lettersAll: string;
  cols: { n: string; yrs: string; st: string; w: string; pd: string; pl: string; t: string };
  titlesBadge: string;
  count: string;
  empty: string;
  reset: string;
  pages: string;
  prev: string;
  next: string;
  page: string;
};

type Props = { packed: PackedDriver[]; locale: Locale; labels: DriversBrowserLabels };

const COLS: { k: DriverSort | "yrs"; num?: boolean; hide?: boolean }[] = [
  { k: "n" },
  { k: "yrs", hide: true },
  { k: "st", num: true },
  { k: "w", num: true },
  { k: "pd", num: true },
  { k: "pl", num: true, hide: true },
  { k: "t", num: true, hide: true },
];
const VAL: Record<Exclude<DriverSort, "n">, keyof DriverRow> = { st: "starts", w: "wins", pd: "podiums", pl: "poles", t: "titles" };
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Стан з адреси (перший показ, Back/Forward) — окрема межа Suspense, щоб таблиця гідратувалась із серверного HTML. */
function QuerySync({ onParams }: { onParams: (q: DriversQuery) => void }) {
  const key = useSearchParams().toString();
  useEffect(() => onParams(parseDriversQuery(new URLSearchParams(key))), [key, onParams]);
  return null;
}

/** Адреса з новим станом; сторонні параметри (utm_*, fbclid…) лишаються. */
export function withDriversQuery(search: string, q: DriversQuery): string {
  const params = new URLSearchParams(search);
  for (const k of ["q", "f", "d", "l", "sort", "dir", "p"]) params.delete(k);
  const merged = new URLSearchParams([...new URLSearchParams(driversQueryString(q).slice(1)), ...params]);
  const s = merged.toString();
  return s ? `?${s}` : "";
}

export function DriverCell({ r, titlesBadge, locale }: { r: DriverRow; titlesBadge: string; locale: Locale }) {
  return (
    <span className="ent">
      {r.avatar ? (
        // Готові WebP 96 px (як картки команд), без next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="av" src={r.avatar} width={28} height={28} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="av av-ini" aria-hidden="true">
          {r.initials}
        </span>
      )}
      <span className="nm">
        <span>
          <a href={localizedPath(driverPath(r.id), locale)}>{r.name}</a>
          {r.titles > 0 && (
            <span className="star" title={fill(titlesBadge, { n: r.titles })}>
              ×{r.titles}
            </span>
          )}
        </span>
        <span className="sub" translate="no">
          {[r.countryCode, r.team].filter(Boolean).join(" · ")}
        </span>
      </span>
    </span>
  );
}

export function DriversTable({
  rows,
  from,
  labels,
  locale,
  sort,
  dir,
  onSort,
}: {
  rows: DriverRow[];
  from: number;
  labels: DriversBrowserLabels;
  locale: Locale;
  sort?: DriverSort;
  dir?: 1 | -1;
  onSort?: (k: DriverSort) => void;
}) {
  const nf = { format: (v: number) => fmtNumber(v, locale) };
  return (
    <div className="tscroll">
      <table className="dt">
        <thead>
          <tr>
            <th scope="col" className="rk">
              <span className="sr-only">№</span>
            </th>
            {COLS.map((c) => (
              <th
                key={c.k}
                scope="col"
                className={[c.num ? "r" : "", c.hide ? "c-hide" : ""].join(" ").trim() || undefined}
                aria-sort={c.k === sort ? (dir === 1 ? "ascending" : "descending") : undefined}
              >
                {onSort && c.k !== "yrs" ? (
                  <button type="button" onClick={() => onSort(c.k as DriverSort)}>
                    {labels.cols[c.k]}
                  </button>
                ) : (
                  <span>{labels.cols[c.k]}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="rk num">{from + i + 1}</td>
              <td>
                <DriverCell r={r} titlesBadge={labels.titlesBadge} locale={locale} />
              </td>
              <td className="c-hide cc num">{r.years[0] === r.years[1] ? r.years[0] : `${r.years[0]}–${r.years[1]}`}</td>
              {(["st", "w", "pd", "pl", "t"] as const).map((k) => {
                const v = r[VAL[k]] as number;
                return (
                  <td key={k} className={["n num", v ? "" : "z", k === "pl" || k === "t" ? "c-hide" : ""].join(" ").trim()}>
                    {nf.format(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Таблиця всіх пілотів: пошук, фільтр, десятиліття, літера, сортування, сторінки. Стан — у URL. */
export function DriversBrowser({ packed, locale, labels }: Props) {
  const rows = useMemo(() => packed.map(expandDriver), [packed]);
  const [query, setQuery] = useState<DriversQuery>(DEFAULT_DRIVERS_QUERY);
  const [synced, setSynced] = useState(false);
  // Типовий вигляд — рядки вже впорядковані сервером (packed у порядку selectDrivers за замовчуванням).
  const selected = useMemo(
    () => (isDefaultView(query) ? rows : selectDrivers(rows, query, locale)),
    [rows, query, locale],
  );
  const { items, page, pages } = paginate(selected, query.p);
  // Номер сторінки поза межами (?p=999) — показуємо найближчу, і в адресу пишемо її (рев'ю 12.11).
  const effectiveP = page;
  // Після зміни сторінки фокус і прокрутка — на лічильник над таблицею (кнопка «‹» могла стати disabled і забрати фокус).
  const top = useRef<HTMLParagraphElement>(null);
  const goPage = (p: number) => {
    set({ p });
    requestAnimationFrame(() => {
      top.current?.focus({ preventScroll: true });
      top.current?.scrollIntoView({ block: "start" });
    });
  };
  const letters = useMemo(() => new Set(rows.map((r) => firstLetter(r.surname))), [rows]);

  // Остання адреса, яку записали ми самі: її «луну» з useSearchParams ігноруємо, щоб застаріла адреса
  // не перезаписала новіший стан під час швидкого набору (code-review 12.11).
  const written = useRef<string | null>(null);
  // Ввід до гідратації (замір 13.11 на main: 2 з 6 ранніх наборів губилися — поле порожнє): (1) текст, набраний у
  // серверне поле до того, як React підключив onChange, підхоплюємо в useLayoutEffect; (2) перше читання адреси
  // (QuerySync) не затирає стан, який користувач уже змінив. Як у «Трасах» (фаза 3h).
  const input = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  useLayoutEffect(() => {
    const typed = input.current?.value ?? "";
    if (typed) {
      dirty.current = true;
      setQuery((prev) => (prev.q === typed ? prev : { ...prev, q: typed, p: 1 }));
    }
  }, []);
  const set = (patch: Partial<DriversQuery>) => {
    dirty.current = true;
    // Будь-яка зміна, крім сторінки, повертає на першу сторінку. Порівняння — за станом, а не за адресою
    // (адреса обрізає пробіли, і пробіл у пошуку губився: «ayrton senna» не набирався).
    const next = { ...query, ...patch, p: patch.p ?? 1 };
    if (JSON.stringify(next) !== JSON.stringify(query)) setQuery(next);
  };
  const onParams = useCallback((q: DriversQuery) => {
    const incoming = driversQueryString(q);
    // Перше читання адреси після вводу до гідратації: параметри посилання (фільтр, сортування) — з адреси, пошук —
    // той, що набрав користувач (code-review PR #18: інакше ?f=…&sort=… з посилання губились).
    if (written.current === null && dirty.current) {
      setQuery((prev) => ({ ...q, q: prev.q, p: 1 }));
      setSynced(true);
      return;
    }
    if (written.current !== null && incoming === written.current) {
      setSynced(true);
      return;
    }
    // Запізніла луна старішої власної адреси: адреса в рядку вже новіша — не наш перехід, ігноруємо (code-review
    // PR #18: written пам'ятає лише останню записану адресу). Справжній перехід (Back/Forward, меню) змінює і її.
    if (written.current !== null && incoming !== driversQueryString(parseDriversQuery(new URLSearchParams(window.location.search)))) {
      setSynced(true);
      return;
    }
    setQuery((prev) => (driversQueryString(prev) === incoming ? prev : q));
    setSynced(true);
  }, []);
  useEffect(() => {
    if (synced) document.documentElement.removeAttribute("data-list-query");
  }, [synced]);
  useEffect(() => {
    if (!synced) return;
    const shown = { ...query, p: effectiveP };
    written.current = driversQueryString(shown);
    const next = withDriversQuery(window.location.search, shown);
    if (next !== (window.location.search === "?" ? "" : window.location.search)) {
      window.history.replaceState(null, "", `${window.location.pathname}${next}${window.location.hash}`);
    }
  }, [query, synced, effectiveP]);

  const onSort = (k: DriverSort) =>
    set({ sort: k, dir: k === query.sort ? ((query.dir * -1) as 1 | -1) : k === "n" ? 1 : -1 });
  const from = (page - 1) * DRIVERS_PAGE_SIZE;
  const nums: number[] = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i);

  return (
    <div className="drv-browser">
      <Suspense fallback={null}>
        <QuerySync onParams={onParams} />
      </Suspense>
      <div className="tools">
        <label className="sr-only" htmlFor="drv-q">
          {labels.search}
        </label>
        <input
          id="drv-q"
          ref={input}
          type="search"
          autoComplete="off"
          placeholder={labels.searchPlaceholder}
          value={query.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        <div className="chips" role="group" aria-label={labels.filtersLabel}>
          {DRIVER_FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={query.f === f} onClick={() => set({ f })}>
              {labels.filters[f]}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="drv-d">
          {labels.decade}
        </label>
        <select id="drv-d" value={query.d} onChange={(e) => set({ d: Number(e.target.value) })}>
          <option value={0}>{labels.decadeAll}</option>
          {DRIVER_DECADES.map((d) => (
            <option key={d} value={d}>
              {fill(labels.decadeN, { d })}
            </option>
          ))}
        </select>
        {/* Ціль фокуса після зміни сторінки: диктор прочитає «26–50 з 793». */}
        <p className="count" role="status" ref={top} tabIndex={-1}>
          {selected.length ? fill(labels.count, { from: from + 1, to: from + items.length, n: selected.length }) : labels.empty}
        </p>
      </div>
      <div className="letters" role="group" aria-label={labels.letters}>
        <button type="button" className="all" aria-pressed={!query.l} onClick={() => set({ l: "" })}>
          {labels.lettersAll}
        </button>
        {LETTERS.map((l) => (
          <button key={l} type="button" aria-pressed={query.l === l} disabled={!letters.has(l)} onClick={() => set({ l })}>
            {l}
          </button>
        ))}
      </div>
      {items.length > 0 ? (
        <DriversTable rows={items} from={from} labels={labels} locale={locale} sort={query.sort} dir={query.dir} onSort={onSort} />
      ) : (
        <p className="empty">
          {labels.empty}{" "}
          <button type="button" className="link" onClick={() => setQuery(DEFAULT_DRIVERS_QUERY)}>
            {labels.reset}
          </button>
        </p>
      )}
      {pages > 1 && (
        <nav className="pager" aria-label={labels.pages}>
          <button type="button" disabled={page === 1} aria-label={labels.prev} onClick={() => goPage(page - 1)}>
            ‹
          </button>
          {nums.map((n, i) => (
            <span key={n} className="pg">
              {i > 0 && n - nums[i - 1]! > 1 && <span className="gap">…</span>}
              <button
                type="button"
                aria-current={n === page ? "page" : undefined}
                aria-label={fill(labels.page, { n })}
                onClick={() => goPage(n)}
              >
                {n}
              </button>
            </span>
          ))}
          <button type="button" disabled={page === pages} aria-label={labels.next} onClick={() => goPage(page + 1)}>
            ›
          </button>
        </nav>
      )}
    </div>
  );
}
