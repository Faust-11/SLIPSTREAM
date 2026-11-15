import { NextResponse, type NextRequest } from "next/server";
import { adminEnv } from "@/lib/admin/env";
import { SESSION_COOKIE, verifySession } from "@/lib/admin/token";

/**
 * Лише /admin/**: без дійсної сесії адмінки «немає» — та сама відповідь, що й на будь-яку неіснуючу адресу
 * (до фази 7 /admin переписувався на /en/admin → 404 сайту; замір 15.11: 404, 42 052 Б, як /zzz). Це не межа
 * безпеки: кожна сторінка, server action і route handler адмінки сам викликає requireAdmin() (src/lib/admin/session.ts).
 */
const OPEN = new Set(["/admin/auth/login", "/admin/auth/callback"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const env = adminEnv();
  // Вхід і повернення з Google відкриті лише коли адмінку налаштовано; їхні невдачі ведуть на /admin (той самий 404).
  if (env && OPEN.has(pathname)) return NextResponse.next();
  const admin = env ? await verifySession(env, request.cookies.get(SESSION_COOKIE)?.value) : null;
  if (admin) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/en${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
