import { keyedEnv, origin, redirect303 } from "@/lib/admin/auth-http";
import { startGitHub } from "@/lib/admin/login-github";
import { setFlow } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

/** Вхід через GitHub: перенаправлення на github.com зі станом входу в cookie. */
export async function GET(request: Request): Promise<Response> {
  const k = keyedEnv(request);
  if (!k?.env.github) return redirect303("/admin");
  const { url, flow } = await startGitHub(k.env.github, origin());
  await setFlow(flow);
  return new Response(null, { status: 302, headers: { Location: url.href, "Cache-Control": "no-store" } });
}
