import { cookies } from "next/headers";
import { keyedEnv, redirect303, sameOrigin, withKey } from "@/lib/admin/auth-http";
import { clearFlow, startSession } from "@/lib/admin/session";
import { FLOW_COOKIE, checkCode, isAdminSub, verifyFlow } from "@/lib/admin/token";

export const dynamic = "force-dynamic";

/** Перевірка коду: правильний — сесія і стан входу видалено; ні — назад до вводу (до кінця 10 хв). */
export async function POST(request: Request): Promise<Response> {
  const k = keyedEnv(request);
  if (!k?.env.email || !sameOrigin(request)) return redirect303("/admin");
  const flow = await verifyFlow(k.env, (await cookies()).get(FLOW_COOKIE)?.value);
  if (flow?.kind !== "email") return redirect303(withKey("/admin/auth/login", k.key));
  const form = await request.formData().catch(() => null);
  const sub = `email:${flow.email}`;
  if (!checkCode(k.env, flow, String(form?.get("code") ?? "")) || !isAdminSub(k.env, sub)) {
    return redirect303(`${withKey("/admin/auth/code", k.key)}&e=1`);
  }
  await clearFlow();
  await startSession({ sub, label: flow.email });
  return redirect303("/admin");
}
