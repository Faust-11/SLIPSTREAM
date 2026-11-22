import { playConfig } from "@/lib/play/config";
import { sendCode } from "@/lib/play/gotrue";
import { json, readJson, sameOrigin } from "@/lib/play/http";
import { allowFrom } from "@/lib/play/limiter";
import { cleanCaptchaToken, turnstileSiteKey } from "@/lib/play/turnstile";
import { isValidEmail, normalizeEmail } from "@/lib/play/validate";

export const dynamic = "force-dynamic";

/**
 * Запит коду на пошту. Відповідь однакова для будь-якої адреси (нове чи наявне) — без перебору зареєстрованих. Помилки
 * лише про сам запит: формат адреси, ліміт (429), сервіс недоступний, перевірка Turnstile (400 captcha_required — токена
 * нема при ввімкненому ключі; 400 captcha — Supabase токен відхилив). Токен перевіряє Supabase, не ми (див. turnstile.ts).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { error: "origin" });
  const cfg = playConfig();
  if (!cfg) return json(503, { error: "unavailable" });
  // Токен Turnstile — до 2048 символів: ліміт тіла за замовчуванням (2 КБ) його б відсікав.
  const body = await readJson(request, 4096);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email)) return json(400, { error: "invalid_email" });
  const captchaToken = cleanCaptchaToken(body?.captchaToken);
  // Ключ віджета заданий — форма завжди присилає токен; без нього в Supabase не ходимо (і ліміт не витрачаємо).
  if (turnstileSiteKey() && !captchaToken) return json(400, { error: "captcha_required" });
  // М'який ліміт ЛИШЕ за джерелом (не межа безпеки — див. limiter.ts). Окремого ліміту на адресу немає: його міг би вичерпати
  // будь-хто, знаючи чужу пошту, і заблокувати власнику вхід; пауза на адресу — у Supabase (60 с).
  if (!allowFrom(request, "code", 8, 10 * 60_000)) return json(429, { error: "rate_limited" });
  const sent = await sendCode(cfg, email, captchaToken);
  if (!sent.ok) {
    const status = sent.reason === "rate_limited" ? 429 : sent.reason === "invalid_email" || sent.reason === "captcha" ? 400 : 503;
    return json(status, { error: sent.reason });
  }
  return json(200, { ok: true });
}
