import { json } from "@/lib/play/http";
import { getProfile } from "@/lib/play/rest";
import { currentPlayer } from "@/lib/play/session";

export const dynamic = "force-dynamic";

/**
 * Хто я: { user: null } або { user: { nick } } (nick: null — профілю ще немає). Без кешу. Клієнт питає лише коли є
 * позначка outlap_in (src/lib/play/cookie.ts). Email у відповідь не потрапляє ніколи.
 */
export async function GET() {
  const state = await currentPlayer();
  if (!state) return json(503, { error: "unavailable" });
  if (!state.user) return json(200, { user: null, unavailable: state.unavailable });
  const profile = await getProfile(state.cfg, state.user.accessToken);
  return json(200, { user: { nick: profile.ok ? (profile.profile?.nick ?? null) : null, profile: profile.ok }, unavailable: state.unavailable });
}
