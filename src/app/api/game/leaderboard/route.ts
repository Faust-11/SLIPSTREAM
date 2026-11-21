import { isTrackKey } from "@/lib/game/physics";
import { json } from "@/lib/play/http";
import { playConfig } from "@/lib/play/config";
import { allowFrom } from "@/lib/play/limiter";
import { getBoard } from "@/lib/play/laps-rest";

export const dynamic = "force-dynamic";

/**
 * Таблиця лідерів траси: GET /api/game/leaderboard?track=lyman → { rows: [{ place, player, ticks, jump, at }], total }.
 * Публічна (нік або «Гравець XXXX», час, дата; user_id і пошти немає) й не залежить від сесії, тому кешується CDN на 30 с:
 * після нового кола таблиця оновиться за півхвилини, а не при кожному відкритті сторінки.
 */
export async function GET(request: Request) {
  const track = new URL(request.url).searchParams.get("track") ?? "";
  if (!isTrackKey(track)) return json(400, { error: "bad_request" });
  const cfg = playConfig();
  if (!cfg) return json(503, { error: "unavailable" });
  if (!allowFrom(request, "board", 120, 60_000)) return json(429, { error: "rate_limited" });
  const res = await getBoard(cfg, track);
  if (!res.ok) return json(503, { error: "unavailable" });
  return json(200, { track, rows: res.rows, total: res.total }, { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" });
}
