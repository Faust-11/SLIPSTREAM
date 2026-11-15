import { cookies } from "next/headers";
import { adminEnv } from "@/lib/admin/env";
import { finishLogin } from "@/lib/admin/oidc";
import { startSession } from "@/lib/admin/session";
import { FLOW_COOKIE, verifyFlow } from "@/lib/admin/token";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

/**
 * Повернення з Google. Будь-яка невдача (не той акаунт, підробка, прострочений чи скасований вхід) — без сесії на
 * /admin, де сторонньому відповідає звичайний 404 сайту.
 */
export async function GET(request: Request): Promise<Response> {
  const env = adminEnv();
  const jar = await cookies();
  const flow = env ? await verifyFlow(env, jar.get(FLOW_COOKIE)?.value) : null;
  // Стан входу одноразовий — прибираємо за будь-якого результату.
  jar.set(FLOW_COOKIE, "", { path: "/admin/auth", maxAge: 0, httpOnly: true, secure: true, sameSite: "lax" });
  const origin = siteUrl().origin;
  const toAdmin = new Response(null, { status: 303, headers: { Location: new URL("/admin", origin).href, "Cache-Control": "no-store" } });
  if (!env || !flow) return toAdmin;

  const email = await finishLogin(env, origin, new URL(request.url), flow);
  if (email) await startSession(email);
  return toAdmin;
}
