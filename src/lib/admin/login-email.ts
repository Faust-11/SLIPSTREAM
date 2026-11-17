import "server-only";
import type { EmailLogin } from "./env";
import { formatCode } from "./token";

/**
 * Код на пошту (рішення користувача 17.11) — лист через Resend. Надсилаємо лише на адреси зі списку; відповідь сторінки
 * однакова для будь-якої адреси, тож список адмінів назовні не видно.
 */
export async function sendCode(mail: EmailLogin, to: string, code: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const pretty = formatCode(code);
  try {
    const res = await fetchImpl(`${mail.api}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${mail.apiKey}`, "Content-Type": "application/json", "User-Agent": "slipstream-admin" },
      body: JSON.stringify({
        from: mail.from,
        to: [to],
        subject: `Код входу в адмінку Slipstream: ${pretty}`,
        text: `Код входу: ${pretty}\n\nДіє 10 хвилин і лише в тому браузері, де ви його запросили.\nЯкщо ви не входили в адмінку — просто проігноруйте цей лист.`,
      }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
