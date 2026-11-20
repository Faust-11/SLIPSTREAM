import { playConfig } from "@/lib/play/config";
import { verifyCode } from "@/lib/play/gotrue";
import { json, readJson, sameOrigin } from "@/lib/play/http";
import { allow, clientKey } from "@/lib/play/limiter";
import { getProfile } from "@/lib/play/rest";
import { startPlaySession } from "@/lib/play/session";
import { isValidCode, isValidEmail, normalizeEmail } from "@/lib/play/validate";

export const dynamic = "force-dynamic";

/** Код із листа → сесія. Невірний і прострочений код Supabase не розрізняє (403 otp_expired) — і ми теж. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { error: "origin" });
  const cfg = playConfig();
  if (!cfg) return json(503, { error: "unavailable" });
  const body = await readJson(request);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const code = typeof body?.code === "string" ? body.code.replace(/\s/g, "") : "";
  if (!isValidEmail(email) || !isValidCode(code)) return json(400, { error: "invalid_code" });
  // Перебір коду: 8 цифр = 10⁸ варіантів; м'яко — 10 спроб за 10 хв на ПАРУ «джерело + адреса» і 30 на джерело. Лише адреса як ключ
  // дозволила б будь-кому «спалити» спроби власника (рев'ю 20.11); перебір з багатьох джерел обмежує сам Supabase.
  const ip = clientKey(request);
  if (ip && (!allow(`verify:pair:${ip}:${email}`, 10, 10 * 60_000) || !allow(`verify:ip:${ip}`, 30, 10 * 60_000))) return json(429, { error: "rate_limited" });
  const verified = await verifyCode(cfg, email, code);
  if (!verified.ok) return json(verified.reason === "rate_limited" ? 429 : verified.reason === "invalid_code" ? 400 : 503, { error: verified.reason });
  await startPlaySession(verified.value);
  const profile = await getProfile(cfg, verified.value.access_token);
  // Профіль не дістали (схему play ще не відкрито чи збій) — вхід усе одно вдалий; нік покаже /api/session.
  return json(200, { ok: true, nick: profile.ok ? (profile.profile?.nick ?? null) : null, profile: profile.ok });
}
