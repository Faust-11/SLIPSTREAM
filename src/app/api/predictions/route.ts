import { playConfig } from "@/lib/play/config";
import { json, readJson, sameOrigin } from "@/lib/play/http";
import { allow, allowFrom } from "@/lib/play/limiter";
import { isClosed, parsePrediction, parseRoundKey, type PredictionKind } from "@/lib/play/predictions";
import { getDeadline, getMyPredictions, getRevealed, savePrediction, type MyPrediction } from "@/lib/play/predictions-rest";
import { getProfile } from "@/lib/play/rest";
import { currentPlayer } from "@/lib/play/session";

export const dynamic = "force-dynamic";

const mineJson = (p: MyPrediction) => ({ picks: p.picks, dnfTeam: p.dnfTeam, allFinish: p.allFinish, updatedAt: p.updatedAt });

/**
 * Стан етапу для сторінки прогнозу: GET /api/predictions?year=2026&round=22.
 *  - deadline — за годинником БАЗИ (play.deadline); now — час сервера (клієнт рахує відлік за різницею, а не за своїм
 *    годинником, який може йти неправильно). Дедлайн і так перевіряє тригер бази — це лише для показу.
 *  - signedIn — є дійсна сесія (cookie), навіть якщо профіль чи прогнози прочитати не вдалося; user — хто я: null або
 *    { nick, publicName } (nick: null — профілю ще немає, треба обрати нік; publicName — як мене бачать у таблиці: нік чи «Гравець XXXX»).
 *    «signedIn: true, user: null, unavailable: true» — ввійшов, але база недоступна: інтерфейс НЕ пропонує увійти (unknown ≠ «не ввійшов»);
 *  - mine — мої прогнози на етап (лише для ввійшлого); revealed — прогнози всіх гравців, ТІЛЬКИ коли дедлайн минув
 *    (подання бази й так нічого не віддасть раніше; зайвого запиту до дедлайну не робимо).
 * Email у відповідь не потрапляє ніколи. Без кешу.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const key = parseRoundKey(params.get("year"), params.get("round"));
  if (!key) return json(400, { error: "bad_request" });
  const cfg = playConfig();
  if (!cfg) return json(503, { error: "unavailable" });
  if (!allowFrom(request, "pred-get", 120, 60_000)) return json(429, { error: "rate_limited" });

  const deadline = await getDeadline(cfg, key.year, key.round);
  if (!deadline.ok) return json(503, { error: "unavailable" });
  const now = Date.now();
  const closed = isClosed(deadline.deadline ? Date.parse(deadline.deadline) : null, now);

  const state = await currentPlayer();
  let unavailable = !!state?.unavailable;
  let user: { nick: string | null; publicName: string | null } | null = null;
  let mine: Record<PredictionKind, ReturnType<typeof mineJson> | null> | null = null;
  if (state?.user) {
    const [profile, list] = await Promise.all([getProfile(cfg, state.user.accessToken), getMyPredictions(cfg, state.user.accessToken, key.year, key.round)]);
    if (profile.ok && list.ok) {
      user = { nick: profile.profile?.nick ?? null, publicName: profile.profile?.publicName ?? null };
      mine = { Q: null, R: null };
      for (const row of list.rows) mine[row.kind] = mineJson(row);
    } else unavailable = true;
  }

  let revealed = null;
  if (closed) {
    const res = await getRevealed(cfg, key.year, key.round, user?.publicName ?? null);
    if (res.ok) revealed = res.rows;
    else unavailable = true;
  }
  return json(200, { now, deadline: deadline.deadline, closed, signedIn: !!state?.user, user, mine, revealed, unavailable });
}

/**
 * Зберегти прогноз (одне поле «вид»: Q — кваліфікація, R — гонка). Перевірка вводу тут — для швидкої відповіді; запис і
 * дедлайн — остаточно в play.save_prediction (під JWT гравця): жодного user_id у тілі, лише токен із cookie сесії.
 * Коди: 400 — не пройшов перевірку; 401 — не ввійшов; 403 — немає ніка (no_profile) / заблоковано; 409 — дедлайн минув;
 * 429 — ліміт; 503 — база чи вхід недоступні.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { error: "origin" });
  const body = await readJson(request);
  const parsed = parsePrediction(body);
  if (!parsed.ok) return json(400, { error: "invalid", problem: parsed.problem });
  const state = await currentPlayer();
  if (!state || (state.unavailable && !state.user)) return json(503, { error: "unavailable" });
  if (!state.user) return json(401, { error: "unauthorized" });
  // М'який ліміт (не межа безпеки — див. limiter.ts): 2 види × кілька виправлень за вікенд — з запасом.
  if (!allow(`pred:${state.user.userId}`, 60, 10 * 60_000) || !allowFrom(request, "pred", 120, 10 * 60_000)) return json(429, { error: "rate_limited" });
  const res = await savePrediction(state.cfg, state.user.accessToken, parsed.value);
  if (res.ok) return json(200, { ok: true, kind: parsed.value.kind });
  const status = { closed: 409, no_profile: 403, blocked: 403, invalid: 400, unauthorized: 401, unavailable: 503 }[res.reason];
  return json(status, { error: res.reason });
}
