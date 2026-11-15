import { NextResponse, type NextRequest } from "next/server";
import { adminEnv, sameKey } from "@/lib/admin/env";
import { FLOW_COOKIE, SESSION_COOKIE, verifySession } from "@/lib/admin/token";

/**
 * Лише /admin/**: без дійсної сесії адмінки «немає» — та сама відповідь, що й на будь-яку неіснуючу адресу
 * (до фази 7 /admin переписувався на /en/admin → 404 сайту; замір 15.11: 404, 42 052 Б, як /zzz). Це не межа
 * безпеки: кожна сторінка, server action і route handler адмінки сам викликає requireAdmin() (src/lib/admin/session.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const env = adminEnv();
  // Вхід — лише з ключем у адресі; повернення з Google — лише коли вхід почато (є cookie стану). Інакше — той самий 404:
  // без цього редирект на Google видавав, що адмінка існує (рев'ю 7a).
  if (env && pathname === "/admin/auth/login" && sameKey(searchParams.get("key") ?? "", env.loginKey)) return NextResponse.next();
  if (env && pathname === "/admin/auth/callback" && request.cookies.has(FLOW_COOKIE)) return NextResponse.next();
  const admin = env ? await verifySession(env, request.cookies.get(SESSION_COOKIE)?.value) : null;
  if (admin) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/en${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
