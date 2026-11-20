import "server-only";
import { LOCAL_HOSTS } from "../../local";
import { parseCheckUrl } from "./ssrf";

/**
 * Web Archive (7c, задача 7). Два способи отримати копію джерела:
 *  1. Availability API — готова копія, якщо хтось уже архівував (замір 20.11: ~1,7 с на URL);
 *  2. Save Page Now — зберегти зараз. Замір 20.11 на 3 адресах: 302 до знімка за секунди, 86 с до знімка, 520 за 7,6 с.
 *     Синхронно це довше за ліміт функції, тож чекаємо не довше SAVE_TIMEOUT_MS: не дочекались — знімок може ще
 *     зберігатися, і «Знайти копії» підхопить його пізніше.
 * Усі запити — лише на archive.org (адреси зафіксовані); адреса джерела, яку архівуємо, проходить ту саму перевірку,
 * що й перевірка посилань (ssrf.ts), — бо archive.org піде за нею за нас, і це не привід архівувати внутрішні адреси.
 */
export const ARCHIVE_URL_RE = /^https:\/\/web\.archive\.org\/web\/\d{14}\/https?:\/\/\S+$/;

export const AVAILABILITY_TIMEOUT_MS = 10_000;
export const SAVE_TIMEOUT_MS = 45_000;

export type CopyResult = { state: "found"; archive: string; timestamp: string } | { state: "none" } | { state: "error"; detail: string };
export type SaveResult = { state: "saved"; archive: string } | { state: "pending" } | { state: "refused"; detail: string } | { state: "failed"; detail: string };

/** Лише для e2e: фейковий архів на localhost (ADMIN_ARCHIVE_FAKE), ніколи на Vercel. */
export function archiveFake(env: Record<string, string | undefined> = process.env): URL | null {
  if (!env.ADMIN_ARCHIVE_FAKE || env.VERCEL === "1") return null;
  try {
    const u = new URL(env.ADMIN_ARCHIVE_FAKE);
    return LOCAL_HOSTS.has(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

/** Адреса знімка з відповіді: лише https://web.archive.org/web/<14 цифр>/<http(s)://…>; `http://` з API піднімаємо до https. */
export function normalizeArchiveUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const https = raw.replace(/^http:\/\//, "https://");
  return ARCHIVE_URL_RE.test(https) ? https : null;
}

export async function findCopy(url: string, fetchImpl: typeof fetch = fetch): Promise<CopyResult> {
  const checked = parseCheckUrl(url);
  if (!checked.ok) return { state: "error", detail: `пропущено: ${checked.reason}` };
  const fake = archiveFake();
  const base = fake ? `${fake.origin}/wayback/available` : "https://archive.org/wayback/available";
  try {
    const res = await fetchImpl(`${base}?url=${encodeURIComponent(checked.url.href)}`, { signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return { state: "error", detail: `Web Archive: ${res.status}` };
    const body = (await res.json()) as { archived_snapshots?: { closest?: { available?: boolean; status?: string; url?: string; timestamp?: string } } };
    const c = body.archived_snapshots?.closest;
    if (!c?.available) return { state: "none" };
    const archive = normalizeArchiveUrl(c.url);
    if (!archive || (c.status && c.status !== "200")) return { state: "none" };
    return { state: "found", archive, timestamp: String(c.timestamp ?? "") };
  } catch {
    return { state: "error", detail: "Web Archive не відповів" };
  }
}

export async function savePage(url: string, fetchImpl: typeof fetch = fetch): Promise<SaveResult> {
  const checked = parseCheckUrl(url);
  if (!checked.ok) return { state: "refused", detail: checked.reason };
  const fake = archiveFake();
  const target = `${fake ? `${fake.origin}/save/` : "https://web.archive.org/save/"}${checked.url.href}`;
  try {
    const res = await fetchImpl(target, { redirect: "manual", signal: AbortSignal.timeout(SAVE_TIMEOUT_MS), cache: "no-store", headers: { "user-agent": "slipstream-admin" } });
    const loc = res.headers.get("location");
    const archive = normalizeArchiveUrl(loc ? new URL(loc, "https://web.archive.org").href : null);
    if (archive) return { state: "saved", archive };
    if (res.status === 429) return { state: "failed", detail: "забагато запитів до Web Archive — спробуйте за хвилину" };
    if (res.ok) return { state: "pending" }; // 200 без адреси знімка — підхопить «Знайти копії»
    return { state: "failed", detail: `Web Archive: ${res.status}` };
  } catch (e) {
    return (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError" ? { state: "pending" } : { state: "failed", detail: "Web Archive не відповів" };
  }
}
