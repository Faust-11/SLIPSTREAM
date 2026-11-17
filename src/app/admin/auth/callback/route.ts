import { cookies } from "next/headers";
import { origin, redirect303 } from "@/lib/admin/auth-http";
import { adminEnv } from "@/lib/admin/env";
import { finishGitHub } from "@/lib/admin/login-github";
import { clearFlow, startSession } from "@/lib/admin/session";
import { FLOW_COOKIE, verifyFlow } from "@/lib/admin/token";

export const dynamic = "force-dynamic";

/**
 * Повернення з GitHub. Будь-яка невдача (чужий акаунт, підробка, прострочений чи скасований вхід) — без сесії на
 * /admin, де сторонньому відповідає звичайний 404 сайту.
 */
export async function GET(request: Request): Promise<Response> {
  const env = adminEnv();
  const flow = env ? await verifyFlow(env, (await cookies()).get(FLOW_COOKIE)?.value) : null;
  await clearFlow(); // стан входу одноразовий
  if (!env?.github || flow?.kind !== "github") return redirect303("/admin");
  const admin = await finishGitHub(env.github, origin(), new URL(request.url), flow);
  if (admin) await startSession(admin);
  return redirect303("/admin");
}
