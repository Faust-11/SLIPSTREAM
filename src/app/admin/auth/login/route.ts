import { adminEnv } from "@/lib/admin/env";
import { startLogin } from "@/lib/admin/oidc";
import { FLOW_COOKIE, FLOW_TTL_S, signFlow } from "@/lib/admin/token";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Невдача — на /admin: стороннім там звичайний 404 сайту (src/proxy.ts), окремої сторінки помилки немає. */
const toAdmin = () => new Response(null, { status: 303, headers: { Location: new URL("/admin", siteUrl()).href, "Cache-Control": "no-store" } });

/** Вхід адміна: перенаправлення на Google. */
export async function GET(): Promise<Response> {
  const env = adminEnv();
  if (!env) return toAdmin();
  try {
    const { url, flow } = await startLogin(env, siteUrl().origin);
    const cookie = [
      `${FLOW_COOKIE}=${await signFlow(env, flow)}`,
      "Path=/admin/auth",
      `Max-Age=${FLOW_TTL_S}`,
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
    ].join("; ");
    return new Response(null, { status: 302, headers: { Location: url.href, "Set-Cookie": cookie, "Cache-Control": "no-store" } });
  } catch {
    return toAdmin();
  }
}
