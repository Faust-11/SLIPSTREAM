import { json, readJson, sameOrigin } from "@/lib/play/http";
import { allow, allowFrom } from "@/lib/play/limiter";
import { setNick } from "@/lib/play/rest";
import { currentPlayer } from "@/lib/play/session";
import { nickProblem } from "@/lib/play/validate";

export const dynamic = "force-dynamic";

/** Вибір або зміна ніка (play.set_nick). Формат перевіряємо тут для швидкої відповіді; остаточно — база. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { error: "origin" });
  const body = await readJson(request);
  const nick = typeof body?.nick === "string" ? body.nick.trim() : "";
  const problem = nickProblem(nick);
  if (problem) return json(400, { error: "invalid", problem });
  const state = await currentPlayer();
  if (!state || (state.unavailable && !state.user)) return json(503, { error: "unavailable" });
  if (!state.user) return json(401, { error: "unauthorized" });
  if (!allow(`nick:${state.user.userId}`, 10, 10 * 60_000) || !allowFrom(request, "nick", 30, 10 * 60_000)) return json(429, { error: "rate_limited" });
  const res = await setNick(state.cfg, state.user.accessToken, nick);
  if (res.ok) return json(200, { ok: true, nick });
  const status = res.reason === "taken" ? 409 : res.reason === "invalid" ? 400 : res.reason === "blocked" ? 403 : res.reason === "unauthorized" ? 401 : 503;
  return json(status, { error: res.reason });
}
