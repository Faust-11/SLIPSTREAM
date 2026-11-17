import { keyedEnv, redirect303, sameOrigin, withKey } from "@/lib/admin/auth-http";
import { sendCode } from "@/lib/admin/login-email";
import { setFlow } from "@/lib/admin/session";
import { codeHash, newCode } from "@/lib/admin/token";

export const dynamic = "force-dynamic";

/**
 * Запит коду. Для будь-якої адреси — той самий результат (стан входу й перехід до вводу коду), тож список адмінів не
 * видно; лист — лише на адресу зі списку. Код сам у cookie не зберігається — лише HMAC.
 */
export async function POST(request: Request): Promise<Response> {
  const k = keyedEnv(request);
  if (!k?.env.email || !sameOrigin(request)) return redirect303("/admin");
  const form = await request.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const code = newCode();
  await setFlow({ kind: "email", email, codeHash: codeHash(k.env, email, code) });
  if (k.env.email.emails.has(email)) await sendCode(k.env.email, email, code);
  return redirect303(withKey("/admin/auth/code", k.key));
}
