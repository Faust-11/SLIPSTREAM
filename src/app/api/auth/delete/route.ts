import { json, readJson, sameOrigin } from "@/lib/play/http";
import { deleteAccount } from "@/lib/play/rest";
import { clearPlaySession, currentPlayer } from "@/lib/play/session";

export const dynamic = "force-dynamic";

/**
 * Повне видалення акаунта на запит гравця (play.delete_my_account, міграція 0016): користувач Supabase Auth, профіль,
 * прогнози, очки, титули. Заблокований модератором: видаляються лише дані гри, службовий запис лишається (kind
 * data_only_blocked) — інакше блок знімався б повторною реєстрацією. Потрібне явне підтвердження в тілі.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { error: "origin" });
  const body = await readJson(request);
  if (body?.confirm !== true) return json(400, { error: "confirm" });
  const state = await currentPlayer();
  if (!state) return json(503, { error: "unavailable" });
  if (!state.user) return json(401, { error: "unauthorized" });
  const res = await deleteAccount(state.cfg, state.user.accessToken);
  if (!res.ok) return json(res.reason === "unauthorized" ? 401 : 503, { error: res.reason });
  await clearPlaySession();
  return json(200, { ok: true, kind: res.kind });
}
