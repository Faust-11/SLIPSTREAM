import { checkLap, parseLapBody } from "@/lib/game/lap-check";
import { isTrackKey } from "@/lib/game/physics";
import { json, readJson, sameOrigin } from "@/lib/play/http";
import { allow, allowFrom } from "@/lib/play/limiter";
import { getMyLap, saveLap } from "@/lib/play/laps-rest";
import { currentPlayer } from "@/lib/play/session";

export const dynamic = "force-dynamic";

/** Тіло — ввід RLE до 30 КБ + службові поля. */
const MAX_BODY = 32 * 1024;
/** Секрет сервера для play.save_lap (див. laps-rest.ts): без нього запис вимкнено, таблиця лишається лише для читання. */
const secret = () => {
  const s = process.env.GAME_LAP_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
};

/**
 * Зберегти коло в таблиці лідерів: POST /api/game/laps { track, inputs (RLE), jump }. Час клієнт не передає — сервер повторює
 * заїзд за вводом тією самою фізикою (src/lib/game/lap-check.ts) і лише тоді просить базу записати (з секретом, якого немає в
 * браузері). Коди: 400 — не коло (форма, не фініш, швидше за фізику); 401 — не ввійшов; 403 — немає ніка / заблоковано;
 * 429 — ліміт; 503 — запис вимкнено (немає секрету) чи база недоступна. Відповідь: { saved, ticks, jump, place } —
 * saved=false означає, що власне коло гравця на трасі не гірше (воно й повертається).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { error: "origin" });
  const lapSecret = secret();
  if (!lapSecret) return json(503, { error: "unavailable" });
  const parsed = parseLapBody(await readJson(request, MAX_BODY));
  if (!parsed.ok) return json(400, { error: "invalid", problem: parsed.problem });
  const state = await currentPlayer();
  if (!state || (state.unavailable && !state.user)) return json(503, { error: "unavailable" });
  if (!state.user) return json(401, { error: "unauthorized" });
  // М'який ліміт (не межа безпеки — див. limiter.ts): повтор кола коштує ~10–25 мс процесора, тож стеля нижча, ніж для прогнозів.
  if (!allow(`lap:${state.user.userId}`, 40, 10 * 60_000) || !allowFrom(request, "lap", 80, 10 * 60_000)) return json(429, { error: "rate_limited" });
  const lap = checkLap(parsed.track, parsed.inputs, parsed.jump);
  if (!lap.ok) return json(400, { error: "invalid", problem: lap.problem });
  const res = await saveLap(state.cfg, state.user.accessToken, lapSecret, { track: parsed.track, ticks: lap.ticks, jump: lap.jump, inputs: parsed.inputs });
  if (res.ok) return json(200, { ok: true, ...res.lap });
  const status = { no_profile: 403, blocked: 403, invalid: 400, unauthorized: 401, unavailable: 503 }[res.reason];
  return json(status, { error: res.reason });
}

/** Моє коло на трасі й місце: GET /api/game/laps?track=lyman. Лише для ввійшлого; без кешу. */
export async function GET(request: Request) {
  const track = new URL(request.url).searchParams.get("track") ?? "";
  if (!isTrackKey(track)) return json(400, { error: "bad_request" });
  if (!allowFrom(request, "lap-get", 120, 60_000)) return json(429, { error: "rate_limited" });
  const state = await currentPlayer();
  if (!state || (state.unavailable && !state.user)) return json(503, { error: "unavailable" });
  if (!state.user) return json(200, { signedIn: false, mine: null });
  const res = await getMyLap(state.cfg, state.user.accessToken, track);
  if (!res.ok) return json(503, { error: "unavailable" });
  return json(200, { signedIn: true, mine: res.lap });
}
