/**
 * Перевірки вводу гравця — спільні для сервера й клієнта (без server-only). Правила ніка дзеркалять
 * play.profiles_nick_chk (supabase/migrations/0015_play_schema.sql): база лишається остаточним суддею, тут — швидка
 * відповідь без запиту й однакові повідомлення на обох боках.
 */
export const NICK_MIN = 3;
export const NICK_MAX = 24;

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

export type NickProblem = "short" | "long" | "chars" | "reserved";

/** Довжина — у символах (code points), як char_length у Postgres, а не в UTF-16. */
export function nickProblem(nick: string): NickProblem | null {
  const len = [...nick].length;
  if (len < NICK_MIN) return "short";
  if (len > NICK_MAX) return "long";
  if (nick !== nick.trim() || /[\u0000-\u001f\u007f-\u009f@]/.test(nick)) return "chars";
  if (/^[Гг]равець /.test(nick)) return "reserved";
  return null;
}

/** Лише відносний шлях цього ж сайту (захист від відкритого редиректу після входу). */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return null;
  return raw;
}
