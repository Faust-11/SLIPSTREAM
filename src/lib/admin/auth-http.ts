import "server-only";
import { adminEnv, sameKey, type AdminEnv } from "./env";
import { siteUrl } from "@/lib/seo";

/** Спільне для маршрутів входу: ключ у адресі, походження форми, редиректи без кешу. */

export function origin(): string {
  return siteUrl().origin;
}

export function redirect303(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: new URL(path, origin()).href, "Cache-Control": "no-store" } });
}

/** Налаштування, якщо ключ входу в адресі правильний; інакше null (маршрут веде на /admin — стороннім там 404). */
export function keyedEnv(request: Request): { env: AdminEnv; key: string } | null {
  const env = adminEnv();
  const key = new URL(request.url).searchParams.get("key") ?? "";
  return env && sameKey(key, env.loginKey) ? { env, key } : null;
}

/** POST лише з нашого ж походження (форма адмінки). */
export function sameOrigin(request: Request): boolean {
  return request.headers.get("origin") === origin();
}

export const withKey = (path: string, key: string) => `${path}?key=${encodeURIComponent(key)}`;
