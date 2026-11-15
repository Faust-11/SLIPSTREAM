import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { adminEnv } from "./env";
import { SESSION_COOKIE, SESSION_TTL_S, signSession, verifySession } from "./token";

/**
 * Шар доступу адмінки (DAL): кожна сторінка, server action і route handler адмінки викликає requireAdmin().
 * Proxy (src/proxy.ts) лише ховає адмінку від сторонніх — він не межа безпеки (docs: authentication.md, «Layouts and
 * auth checks»; proxy.md: Server Functions можуть вийти з-під matcher).
 */

export type Admin = { email: string };

export const getAdmin = cache(async (): Promise<Admin | null> => {
  const env = adminEnv();
  if (!env) return null;
  return verifySession(env, (await cookies()).get(SESSION_COOKIE)?.value);
});

/** Не адмін — 404 (адмінки «немає»), а не 401/403. */
export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) notFound();
  return admin;
}

export const sessionCookieOptions = {
  httpOnly: true,
  // Secure і на http://localhost: браузери вважають localhost захищеним контекстом (e2e це перевіряє).
  secure: true,
  sameSite: "lax" as const,
  path: "/admin",
  maxAge: SESSION_TTL_S,
};

export async function startSession(email: string): Promise<void> {
  const env = adminEnv();
  if (!env) throw new Error("адмінку не налаштовано");
  (await cookies()).set(SESSION_COOKIE, await signSession(env, email), sessionCookieOptions);
}

export async function endSession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
}
