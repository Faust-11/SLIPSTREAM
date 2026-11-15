import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/** Де дозволені фейкові провайдери для e2e (OIDC, GitHub) — лише ці хости й ніколи на Vercel. */
export const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Порівняння секретів за сталий час (хеші однакової довжини — без раннього виходу на довжині). */
export function sameKey(a: string, b: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b)) && a.length > 0;
}
