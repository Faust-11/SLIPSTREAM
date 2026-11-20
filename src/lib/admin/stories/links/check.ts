import "server-only";
import { lookup as dnsLookup } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { LOCAL_HOSTS } from "../../local";
import { isPublicAddress, parseCheckUrl } from "./ssrf";

/**
 * Перевірка посилання (7c, задача 7): працює / мертве / не вдалося перевірити. Класи — за заміром 19.11: 2xx/3xx = працює;
 * 404/410, немає домену (DNS), зіпсований сертифікат = мертве; 401/403/429/5xx, таймаут, обрив з'єднання = «не вдалося
 * перевірити» (сайти часто закривають від ботів — це не тривога). Тіло відповіді не читаємо: лише рядок статусу.
 */
export type LinkState = "ok" | "dead" | "unknown";
export type LinkResult = { state: LinkState; detail: string; status?: number; finalUrl?: string };

const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;
/** Усі перенаправлення однієї адреси разом: пачка з 6 адрес не має висіти довше за ліміт функції. */
const TOTAL_MS = 20_000;
const UA = "Mozilla/5.0 (compatible; OutlapLinkCheck/1.0; +https://outlap.org)";

type Hop = { status: number; location?: string };
export type Transport = (url: URL) => Promise<Hop>;

/** `lookup` перевіряє адресу на кожному з'єднанні (захист від DNS rebinding): приватна адреса — відмова ще до connect. */
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { family: options.family, hints: options.hints, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error("blocked address"), { code: "ECHECK_BLOCKED" }) as NodeJS.ErrnoException, "", 0);
    }
    // Node 24 просить усі адреси (autoSelectFamily) — віддаємо список; інакше першу.
    if (options.all) return (callback as unknown as (e: null, a: typeof addresses) => void)(null, addresses);
    return callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

const realTransport: Transport = (url) =>
  new Promise((resolve, reject) => {
    const guard: { timer?: ReturnType<typeof setTimeout> } = {};
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        agent: false,
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: { "user-agent": UA, accept: "text/html,application/pdf;q=0.9,*/*;q=0.5" },
      },
      (res) => {
        clearTimeout(guard.timer);
        resolve({ status: res.statusCode ?? 0, location: typeof res.headers.location === "string" ? res.headers.location : undefined });
        res.destroy(); // тіло не потрібне
      },
    );
    // Абсолютний дедлайн до отримання заголовків: `timeout` сокета рахує лише простій, і сайт, що віддає заголовки по байту, тримав би з'єднання.
    guard.timer = setTimeout(() => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), TIMEOUT_MS);
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", (e) => {
      clearTimeout(guard.timer);
      reject(e);
    });
    req.end();
  });

/**
 * Лише для e2e: усі запити йдуть на фейковий сервер на localhost, а справжня адреса — в параметрі `u`. Вмикається змінною
 * ADMIN_LINKS_FAKE і ніколи на Vercel — як ADMIN_GITHUB_API. Перевірка адреси (parseCheckUrl) працює так само.
 */
export function fakeBase(env: Record<string, string | undefined> = process.env): URL | null {
  if (!env.ADMIN_LINKS_FAKE || env.VERCEL === "1") return null;
  try {
    const u = new URL(env.ADMIN_LINKS_FAKE);
    return LOCAL_HOSTS.has(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

function fakeTransport(base: URL): Transport {
  return async (url) => {
    const res = await fetch(`${base.origin}/__link?u=${encodeURIComponent(url.href)}`, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { status: res.status, location: res.headers.get("location") ?? undefined };
  };
}

const DEAD_CODES = new Set(["ENOTFOUND", "EAI_NODATA", "ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"]);

export function classify(status: number): LinkResult {
  if (status >= 200 && status < 400) return { state: "ok", detail: `${status}`, status };
  if (status === 404 || status === 410) return { state: "dead", detail: `${status}`, status };
  return { state: "unknown", detail: status === 429 ? "429 — забагато запитів" : status === 403 || status === 401 ? `${status} — сайт не пускає ботів` : `${status}`, status };
}

export async function checkUrl(raw: string, transport: Transport = fakeBase() ? fakeTransport(fakeBase()!) : realTransport): Promise<LinkResult> {
  let current = parseCheckUrl(raw);
  if (!current.ok) return { state: "unknown", detail: `пропущено: ${current.reason}` };
  let url = current.url;
  const until = Date.now() + TOTAL_MS;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (Date.now() > until) return { state: "unknown", detail: "таймаут" };
      const res = await transport(url);
      if (res.status >= 300 && res.status < 400 && res.location) {
        if (hop === MAX_REDIRECTS) return { state: "unknown", detail: "забагато перенаправлень" };
        const next = parseCheckUrl(new URL(res.location, url).href);
        if (!next.ok) return { state: "unknown", detail: `перенаправлення відхилено: ${next.reason}` };
        current = next;
        url = next.url;
        continue;
      }
      const out = classify(res.status);
      return url.href === new URL(raw).href ? out : { ...out, finalUrl: url.href };
    }
    return { state: "unknown", detail: "забагато перенаправлень" };
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (code === "ECHECK_BLOCKED") return { state: "unknown", detail: "пропущено: приватна адреса" };
    if (DEAD_CODES.has(code)) return { state: "dead", detail: code === "ENOTFOUND" || code === "EAI_NODATA" ? "домену немає" : "помилка сертифіката" };
    if (code === "ETIMEDOUT" || (e as Error).name === "TimeoutError") return { state: "unknown", detail: "таймаут" };
    return { state: "unknown", detail: code || "помилка з'єднання" };
  }
}

/** Перевірка пачки: паралельно, але не більше `size` одночасно на пачку (виклик — пачками по 6). */
export async function checkMany(urls: string[], transport?: Transport): Promise<LinkResult[]> {
  return Promise.all(urls.map((u) => checkUrl(u, transport)));
}
