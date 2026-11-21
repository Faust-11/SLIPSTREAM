/**
 * Погода уікенду на сторінці гонки: чиста логіка без мережі й бази (її перевіряють unit-тести). Джерела:
 * замір на трасі — OpenF1 /weather (з 2023, раз на хвилину), прогноз до сесії — MET Norway locationforecast 2.0 compact.
 * Збирання запитів і кеш — src/lib/data/weather.ts; відображення — src/components/race/race-weather.tsx.
 */

/** З цього сезону OpenF1 віддає історію безкоштовно (до 2023 замірів нема — блок не показуємо). */
export const WEATHER_FROM_YEAR = 2023;

export type SessionKind = "FP1" | "FP2" | "FP3" | "Q" | "SQ" | "SR" | "R";
export type Condition = "clear" | "partly" | "cloudy" | "fog" | "rain" | "heavyrain" | "thunder" | "snow";

/** Назви сесій OpenF1 → наші види (у 2023 спринт-кваліфікація називалась «Sprint Shootout»). */
const SESSION_NAMES: Record<string, SessionKind> = {
  "Practice 1": "FP1",
  "Practice 2": "FP2",
  "Practice 3": "FP3",
  Qualifying: "Q",
  "Sprint Qualifying": "SQ",
  "Sprint Shootout": "SQ",
  Sprint: "SR",
  Race: "R",
};
export const kindOfSessionName = (name: string): SessionKind | null => SESSION_NAMES[name] ?? null;

/** Запас тривалості, коли OpenF1 ще не знає сесії, а наш розклад — знає (хв). */
const FALLBACK_MIN: Record<SessionKind, number> = { FP1: 60, FP2: 60, FP3: 60, Q: 60, SQ: 45, SR: 35, R: 120 };

export type OpenSession = { session_key: number; meeting_key: number; session_name: string; date_start: string; date_end: string; is_cancelled?: boolean };
export type Sample = {
  session_key?: number;
  date: string;
  air_temperature: number | null;
  track_temperature: number | null;
  humidity: number | null;
  wind_speed: number | null;
  wind_direction: number | null;
  rainfall: number | null;
};
export type PageSession = { kind: SessionKind; at: string | null; real: boolean };

const DAY = 86_400_000;
const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
const nums = (xs: (number | null | undefined)[]): number[] => xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
const range = (xs: number[]): [number, number] | null => (xs.length ? [round(Math.min(...xs), 1), round(Math.max(...xs), 1)] : null);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Середній вітер як вектор: напрямок (градуси, ЗВІДКИ дме) усереднюється за колом і зважується швидкістю — у штиль OpenF1
 * віддає напрямок 0°, і без ваги він тягнув би середнє на північ (замір Бразилії 2026: 20 нулів на 562 заміри).
 * 350° і 10° дають 0°, а не 180°. Штиль на всьому проміжку або протилежні вітри — напрямку нема (null).
 */
export function meanWind(speeds: number[], dirs: number[]): { speed: number; from: number | null } | null {
  const n = Math.min(speeds.length, dirs.length);
  if (!n) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  let s = 0;
  let c = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += speeds[i]!;
    s += speeds[i]! * Math.sin(rad(dirs[i]!));
    c += speeds[i]! * Math.cos(rad(dirs[i]!));
  }
  const speed = sum / n;
  const mag = Math.hypot(s, c) / n;
  // Вектор майже скомпенсувався (вітер крутився навколо) або вітру фактично нема — напрямок не показуємо.
  const from = mag < 0.1 * Math.max(speed, 1e-9) || speed < 0.1 ? null : Math.round(((Math.atan2(s, c) * 180) / Math.PI + 360) % 360) % 360;
  return { speed, from };
}

/** Індекс із 8 румбів (0 — північ, 1 — північний схід …) за напрямком, звідки дме вітер. */
export const compassIndex = (deg: number): number => Math.round((((deg % 360) + 360) % 360) / 45) % 8;

export type WeatherData = {
  /** Повітря, °C: мін–макс за сесію (для прогнозу — одне значення двічі). */
  air: [number, number];
  /** Трасу OpenF1 міряє, прогноз її не дає. */
  track: [number, number] | null;
  humidity: number | null;
  /** Швидкість, км/год (в OpenF1 м/с × 3,6) і напрямок, ЗВІДКИ дме вітер. */
  wind: { kmh: number; from: number | null } | null;
  /** Частка замірів із дощем (0–1) — лише для замірів. */
  rainShare: number | null;
  /** Прогноз: опади за наступну годину, мм (лише коли точка погодинна), і стан неба. */
  mm: number | null;
  condition: Condition | null;
};

const MS_TO_KMH = 3.6;

/** Зведення замірів сесії; без жодного придатного заміру повітря — null. */
export function summarize(samples: Sample[]): WeatherData | null {
  const air = range(nums(samples.map((s) => s.air_temperature)));
  if (!air) return null;
  const hum = nums(samples.map((s) => s.humidity));
  const withWind = samples.filter((s) => typeof s.wind_speed === "number" && typeof s.wind_direction === "number");
  const wind = meanWind(withWind.map((s) => s.wind_speed!), withWind.map((s) => s.wind_direction!));
  const rain = nums(samples.map((s) => s.rainfall));
  return {
    air,
    // Датчик траси час від часу віддає рівно 0,0 (4 із 562 замірів Бразилії 2026) — це збій, а не температура.
    track: range(nums(samples.map((s) => s.track_temperature)).filter((t) => t !== 0)),
    humidity: hum.length ? round(mean(hum), 1) : null,
    wind: wind ? { kmh: round(wind.speed * MS_TO_KMH, 1), from: wind.from } : null,
    rainShare: rain.length ? round(rain.filter((r) => r > 0).length / rain.length, 3) : null,
    mm: null,
    condition: null,
  };
}

/** Заміри в межах сесії; замірів у вікні майже нема (сесію зсунули) — беремо всі, що OpenF1 віддав для сесії. */
export function inWindow(samples: Sample[], startMs: number, endMs: number): Sample[] {
  const inside = samples.filter((s) => {
    const t = Date.parse(s.date);
    return t >= startMs && t <= endMs;
  });
  return inside.length >= 3 ? inside : samples;
}

/** Сесія OpenF1 «Race», що відповідає нашій гонці за датою (допуск ±1 день: пояси); найближча виграє. */
export function findRaceSession(sessions: OpenSession[], raceDate: string): OpenSession | null {
  const target = Date.parse(`${raceDate}T00:00:00Z`);
  if (!Number.isFinite(target)) return null;
  let best: { s: OpenSession; diff: number } | null = null;
  for (const s of sessions) {
    if (s.session_name !== "Race" || s.is_cancelled) continue;
    const day = Date.parse(`${s.date_start.slice(0, 10)}T00:00:00Z`);
    const diff = Math.abs(day - target);
    if (diff <= DAY && (!best || diff < best.diff)) best = { s, diff };
  }
  return best?.s ?? null;
}

/* ---------- прогноз MET Norway ---------- */

type MetWindow = { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
export type MetPoint = {
  time: string;
  data: {
    instant: { details: { air_temperature?: number; relative_humidity?: number; wind_speed?: number; wind_from_direction?: number } };
    next_1_hours?: MetWindow;
    next_6_hours?: MetWindow;
    next_12_hours?: MetWindow;
  };
};

/** symbol_code MET («lightrainshowers_day», «heavyrainandthunder») → група стану для підпису. */
export function conditionOf(symbol: string | undefined): Condition | null {
  if (!symbol) return null;
  const s = symbol.replace(/_(day|night|polartwilight)$/, "");
  if (s.includes("thunder")) return "thunder";
  if (s.includes("snow") || s.includes("sleet")) return "snow";
  if (s.includes("heavyrain")) return "heavyrain";
  if (s.includes("rain")) return "rain";
  if (s === "fog") return "fog";
  if (s === "clearsky" || s === "fair") return "clear";
  if (s === "partlycloudy") return "partly";
  if (s === "cloudy") return "cloudy";
  return null;
}

/** Точка прогнозу, найближча до моменту `atMs`; далі за `maxGapMs` (погодинні точки — до 60 год, потім раз на 6) — нічого. */
export function pickForecast(series: MetPoint[], atMs: number, maxGapMs = 3 * 3_600_000): WeatherData | null {
  let best: { p: MetPoint; gap: number } | null = null;
  for (const p of series) {
    const gap = Math.abs(Date.parse(p.time) - atMs);
    if (!best || gap < best.gap) best = { p, gap };
  }
  if (!best || best.gap > maxGapMs) return null;
  const d = best.p.data.instant.details;
  if (typeof d.air_temperature !== "number") return null;
  const win = best.p.data.next_1_hours ?? best.p.data.next_6_hours;
  const air = round(d.air_temperature, 1);
  return {
    air: [air, air],
    track: null,
    humidity: typeof d.relative_humidity === "number" ? round(d.relative_humidity, 1) : null,
    wind: typeof d.wind_speed === "number" && typeof d.wind_from_direction === "number" ? { kmh: round(d.wind_speed * MS_TO_KMH, 1), from: Math.round(d.wind_from_direction) % 360 } : null,
    rainShare: null,
    mm: best.p.data.next_1_hours?.details?.precipitation_amount ?? null,
    condition: conditionOf(win?.summary?.symbol_code),
  };
}

/* ---------- сесії уікенду ---------- */

export type SessionState = "done" | "live" | "forecast" | "none";
export type WeatherSession = {
  kind: SessionKind;
  start: string | null;
  end: string | null;
  state: SessionState;
  source: "openf1" | "met" | null;
  data: WeatherData | null;
};

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Рядки погоди за нашим розкладом уікенду (той самий порядок і види, що в блоці «Вікенд»). Час — OpenF1, коли сесію
 * вже знає, інакше наш (лише «справжній» — не північ дати). Стан рахується на `now`: до старту — прогноз, між стартом
 * і кінцем — «іде зараз» (заміри до цієї хвилини), після — заміри за час сесії.
 */
export function buildSessions(input: { sessions: PageSession[]; open: OpenSession[]; samples: Sample[]; forecast: MetPoint[] | null; now: number }): WeatherSession[] {
  const { sessions, open, samples, forecast, now } = input;
  return sessions.map((s): WeatherSession => {
    const o = open.find((x) => kindOfSessionName(x.session_name) === s.kind && !x.is_cancelled) ?? null;
    const startMs = o ? Date.parse(o.date_start) : s.real && s.at ? Date.parse(s.at) : NaN;
    if (!Number.isFinite(startMs)) return { kind: s.kind, start: null, end: null, state: "none", source: null, data: null };
    const endParsed = o ? Date.parse(o.date_end) : NaN;
    const endMs = Number.isFinite(endParsed) ? endParsed : startMs + FALLBACK_MIN[s.kind] * 60_000;
    const base = { kind: s.kind, start: iso(startMs), end: iso(endMs) };
    if (now < startMs) {
      const data = forecast ? pickForecast(forecast, (startMs + endMs) / 2) : null;
      return { ...base, state: data ? "forecast" : "none", source: data ? "met" : null, data };
    }
    const state: SessionState = now <= endMs ? "live" : "done";
    const own = o ? samples.filter((x) => x.session_key === o.session_key) : [];
    const data = own.length ? summarize(inWindow(own, startMs, endMs)) : null;
    return { ...base, state: data ? state : "none", source: data ? "openf1" : null, data };
  });
}

/* ---------- розклад із календаря (етапи, що ще не мають сторінки гонки) ---------- */

/** Види сесій у f1.calendar_sessions: кваліфікація буває Q1/QB/QA (історичні формати), спринт-кваліфікація — SQ1. */
const CALENDAR_KINDS: Record<string, SessionKind> = { FP1: "FP1", FP2: "FP2", FP3: "FP3", Q1: "Q", QB: "Q", QA: "Q", SQ1: "SQ", SR: "SR", R: "R" };

/**
 * Розклад етапу з календаря → наш (як у race-page.ts: одна кваліфікація на уїкенд, порядок збережено). Невідомий вид
 * пропускаємо, а не вгадуємо.
 */
export function sessionsFromCalendar(list: { kind: string; at: string | null; real: boolean }[]): PageSession[] {
  const seen = new Set<SessionKind>();
  const out: PageSession[] = [];
  for (const s of list) {
    const kind = CALENDAR_KINDS[s.kind];
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    out.push({ kind, at: s.at, real: s.real });
  }
  return out;
}

/** Блок «Погода вікенду» в картці наступної гонки показуємо, коли гонка не далі ніж через 12 діб (прогноз MET — до ~9 діб) і не раніше ніж 3 доби тому. */
export const WEEKEND_WEATHER_AHEAD_DAYS = 12;
const BEHIND_DAYS = 3;
export function weekendWeatherDue(raceAt: string | null | undefined, now: number): boolean {
  const t = raceAt ? Date.parse(raceAt) : NaN;
  if (!Number.isFinite(t)) return false;
  return t - now <= WEEKEND_WEATHER_AHEAD_DAYS * DAY && now - t <= BEHIND_DAYS * DAY;
}
