import { json } from "@/lib/play/http";
import { getProfile } from "@/lib/play/rest";
import { clearPlaySession, currentPlayer } from "@/lib/play/session";

export const dynamic = "force-dynamic";

/**
 * Хто я: { user: null } або { user: { nick } } (nick: null — профілю ще немає). Без кешу. Клієнт питає лише коли є
 * позначка outlap_in (src/lib/play/cookie.ts). Email у відповідь не потрапляє ніколи.
 */
export async function GET() {
  const state = await currentPlayer();
  if (!state) return json(503, { error: "unavailable" });
  if (!state.user) {
    // Сесії немає (немає/не розбирається cookie) і це не збій — знімаємо й позначку outlap_in: інакше клієнт питає /api/session на кожній
    // сторінці до 30 діб. При збої (unavailable) нічого не знімаємо — сесія може бути справжньою.
    if (!state.unavailable) await clearPlaySession();
    return json(200, { user: null, unavailable: state.unavailable });
  }
  const profile = await getProfile(state.cfg, state.user.accessToken);
  return json(200, { user: { nick: profile.ok ? (profile.profile?.nick ?? null) : null, profile: profile.ok }, unavailable: state.unavailable });
}
