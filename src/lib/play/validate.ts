/**
 * Перевірки вводу гравця — спільні для сервера й клієнта (без server-only). Правила ніка — у nick-rules.mjs (allowlist, NFKC,
 * скелет) і дзеркалять play.nick_valid / play.nick_skeleton (міграція 0016): база лишається остаточним суддею, тут — швидка
 * відповідь без запиту й однакові повідомлення на обох боках.
 */
export { NICK_MAX, NICK_MIN, normalizeNick, nickProblem, nickSkeleton } from "./nick-rules.mjs";

export type NickProblem = "short" | "long" | "chars" | "mixed" | "reserved";

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email);
}

/** Код із листа: цифри (довжину задає Supabase — зараз 8; приймаємо 6–10, щоб зміна налаштування не ламала вхід). */
export function isValidCode(code: string): boolean {
  return /^\d{6,10}$/.test(code);
}

/** Лише відносний шлях цього ж сайту (захист від відкритого редиректу після входу). */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return null;
  return raw;
}
