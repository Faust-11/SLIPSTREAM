import { NextResponse, type NextRequest } from "next/server";
import { adminEnv, sameKey } from "@/lib/admin/env";
import { FLOW_COOKIE, SESSION_COOKIE, verifySession } from "@/lib/admin/token";

/**
 * Лише /admin/**: без дійсної сесії адмінки «немає» — та сама відповідь, що й на будь-яку неіснуючу адресу
 * (до фази 7 /admin переписувався на /en/admin → 404 сайту; замір 15.11: 404, 42 052 Б, як /zzz). Це не межа
 * безпеки: кожна сторінка, server action і route handler адмінки сам викликає requireAdmin() (src/lib/admin/session.ts).
 */
/** Кроки входу, відкриті лише з ключем (next.config.ts переписує їх без ключа на 404). */
const KEYED = new Set(["/admin/auth/login", "/admin/auth/github", "/admin/auth/email", "/admin/auth/code", "/admin/auth/verify"]);

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const env = adminEnv();
  // Кроки входу — лише з ключем у адресі; повернення з GitHub — лише коли вхід почато (є cookie стану). Інакше — той самий
  // 404: без цього вхід видавав, що адмінка існує (рев'ю 7a).
  if (env && KEYED.has(pathname) && sameKey(searchParams.get("key") ?? "", env.loginKey)) return NextResponse.next();
  if (env && pathname === "/admin/auth/callback" && request.cookies.has(FLOW_COOKIE)) return NextResponse.next();
  const admin = env ? await verifySession(env, request.cookies.get(SESSION_COOKIE)?.value) : null;
  if (admin) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/en${pathname}`;
  return NextResponse.rewrite(url);
}

// Лише запити з cookie сесії, з ключем входу чи зі станом входу; решту стороннього /admin/** переписує next.config.ts
// (beforeFiles) — без заголовка x-middleware-rewrite, який додає rewrite у proxy. Тут rewrite лишається тільки для
// підробленої/простроченої сесії чи хибного ключа.
export const config = {
  matcher: [
    { source: "/admin", has: [{ type: "cookie", key: "ss_admin" }] },
    { source: "/admin/:path*", has: [{ type: "cookie", key: "ss_admin" }] },
    { source: "/admin/auth/:step(login|github|email|code|verify)", has: [{ type: "query", key: "key" }] },
    { source: "/admin/auth/callback", has: [{ type: "cookie", key: "ss_admin_flow" }] },
  ],
};
