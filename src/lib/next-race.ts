/**
 * Коли головна перестає показувати етап як «наступний» (рішення 22.11). Дані оновлюються з затримкою (джерело результатів
 * публікує гонку через години, плюс перезбірка сайту), а статична головна без цього тримала б завершену гонку «наступною».
 * Тому панель «Наступна гонка» клієнт перемикає на етап, що йде за нею, за годинником браузера.
 */

/** Типова тривалість гонки з запасом: Ф1 обмежує гонку 2 годинами (3 — з перервами за регламентом), тож через 3 год від старту гонка точно завершена. */
export const RACE_WINDOW_MS = 3 * 3600_000;
/** Гонка без відомого часу старту: raceAt — кінець дня за UTC (calendar.ts raceStart), тож додаємо ще пів доби. */
export const UNTIMED_WINDOW_MS = 12 * 3600_000;

/** Момент (мс), після якого етап вважаємо завершеним за часом; null — немає дати. */
export function raceEndAt(raceAt: string | null, timed: boolean): number | null {
  const start = raceAt ? Date.parse(raceAt) : NaN;
  if (Number.isNaN(start)) return null;
  return start + (timed ? RACE_WINDOW_MS : UNTIMED_WINDOW_MS);
}

/** true — етап (за збіркою «наступний») уже завершився за часом клієнта: показуємо наступний за ним. */
export function followingShown(now: number, endAt: number | null): boolean {
  return endAt !== null && now >= endAt;
}

/** Рядок для inline-скрипта: перемикає панель до першого кадру (без мерехтіння); клієнтський HmNextSwitch тримає стан далі. */
export const nextSwitchScript =
  "(function(){var s=document.currentScript,r=s&&s.closest('[data-section=home]');if(r&&Date.now()>=+s.dataset.end)r.setAttribute('data-hm-next','b')})()";
