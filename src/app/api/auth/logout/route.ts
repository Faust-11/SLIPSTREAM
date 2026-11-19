import { json, sameOrigin } from "@/lib/play/http";
import { revokeSession } from "@/lib/play/gotrue";
import { clearPlaySession, currentPlayer } from "@/lib/play/session";

export const dynamic = "force-dynamic";

/**
 * Вихід: сесію відкликаємо в Supabase (спершу currentPlayer() оновлює прострочений access — з простроченим токеном logout дав би
 * 401 і refresh лишився б дійсним), cookie знімаємо завжди, навіть якщо Supabase недоступний.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { error: "origin" });
  const state = await currentPlayer();
  if (state?.user) await revokeSession(state.cfg, state.user.accessToken);
  await clearPlaySession();
  return json(200, { ok: true });
}
