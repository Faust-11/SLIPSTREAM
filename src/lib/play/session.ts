import "server-only";
import { cookies, headers } from "next/headers";
import { accessShape, verifyAccess } from "./access";
import { playConfig, type PlayConfig } from "./config";
import { SESSION_COOKIE, SIGNED_IN_COOKIE, decodeSession, encodeSession, flagCookieOptions, sessionCookieOptions } from "./cookie";
import { refreshSession, type Session } from "./gotrue";
import { allow, sourceKey } from "./limiter";

/** Не оновлюємо, поки до кінця дії access більше цього запасу (с). */
const REFRESH_MARGIN_S = 30;
/** М'яка стеля оновлень за джерелом (див. limiter.ts): законному гравцю потрібне раз на годину, а не 30 за 10 хв. */
const REFRESH_PER_SOURCE = 30;

export type PlayUser = { userId: string; accessToken: string };
export type SessionState = { cfg: PlayConfig; user: PlayUser | null; unavailable: boolean };

export async function startPlaySession(session: Session): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, encodeSession({ a: session.access_token, r: session.refresh_token }), sessionCookieOptions);
  jar.set(SIGNED_IN_COOKIE, "1", flagCookieOptions);
}

export async function clearPlaySession(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  jar.set(SIGNED_IN_COOKIE, "", { ...flagCookieOptions, maxAge: 0 });
}

/**
 * Поточний гравець — лише в route handlers і server actions (cookie змінюються тут). Access перевіряємо за JWKS; якщо
 * його термін майже вийшов — оновлюємо за refresh і ставимо нову cookie. Refresh відхилено (відкликано, користувача
 * видалено) — сесію знімаємо. Збій мережі — `unavailable`, cookie не чіпаємо.
 * Гонка двох паралельних оновлень: Supabase віддає той самий результат упродовж інтервалу повторного використання
 * refresh-токена (типово 10 с), тож обидва запити отримують дійсну пару.
 */
export async function currentPlayer(): Promise<SessionState | null> {
  const cfg = playConfig();
  if (!cfg) return null;
  const pair = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!pair) return { cfg, user: null, unavailable: false };
  const access = await verifyAccess(cfg, pair.a);
  if (access && access.exp - Date.now() / 1000 > REFRESH_MARGIN_S) return { cfg, user: { userId: access.userId, accessToken: pair.a }, unavailable: false };
  if (!access) {
    const shape = accessShape(cfg, pair.a);
    // Не схоже на наш access-токен (сміття в cookie) — це не сесія: не турбуємо GoTrue, знімаємо cookie (рев'ю 20.11).
    if (shape === "junk") {
      await clearPlaySession();
      return { cfg, user: null, unavailable: false };
    }
    // Токен нашого проєкту, але alg поза ES256/RS256 (HS256 — відкат ключів): справжня сесія, яку ми не вміємо перевірити. Це збій
    // налаштувань, а не відкликання: cookie не знімаємо (вхід не «успішний і одразу скинутий», код не горить) і refresh не ротуємо
    // даремно (токен одноразовий, а новий був би таким самим) — «недоступно».
    if (shape === "foreign_alg") return { cfg, user: null, unavailable: true };
  }
  // Підробка зі схожою структурою пройшла б вище, тож стеля на джерело: інакше анонім міг би змушувати функції Vercel слати в GoTrue
  // стільки POST /token, скільки встигне, і вичерпати ліміт GoTrue по IP для всіх. Вичерпано — як збій: нічого не знімаємо.
  const source = sourceKey(await headers());
  if (source && !allow(`refresh:ip:${source}`, REFRESH_PER_SOURCE, 10 * 60_000)) {
    return access ? { cfg, user: { userId: access.userId, accessToken: pair.a }, unavailable: true } : { cfg, user: null, unavailable: true };
  }
  const renewed = await refreshSession(cfg, pair.r);
  if (!renewed.ok) {
    if (renewed.reason === "unavailable") {
      // Access ще дійсний (лише близький до кінця) — користуємось ним, не розлогінюємо через збій мережі.
      return access ? { cfg, user: { userId: access.userId, accessToken: pair.a }, unavailable: true } : { cfg, user: null, unavailable: true };
    }
    await clearPlaySession();
    return { cfg, user: null, unavailable: false };
  }
  // Нову пару зберігаємо ОДРАЗУ: refresh-токен Supabase одноразовий — якщо не записати новий, у cookie лишиться вже використаний,
  // і наступне оновлення (після інтервалу повторного використання) розлогінить користувача (рев'ю 20.11).
  await startPlaySession(renewed.value);
  const fresh = await verifyAccess(cfg, renewed.value.access_token);
  // Свіжий токен не пройшов перевірку підпису (JWKS недоступний чи проєкт змінив ключ) — сесію не знімаємо: це збій
  // сервісу, а не відкликання; користувач бачить «недоступно», а не мовчки розлогінюється.
  if (!fresh) return { cfg, user: null, unavailable: true };
  return { cfg, user: { userId: fresh.userId, accessToken: renewed.value.access_token }, unavailable: false };
}
