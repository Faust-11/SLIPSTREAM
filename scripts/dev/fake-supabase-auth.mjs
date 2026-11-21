/**
 * Фейковий Supabase Auth (GoTrue) і PostgREST схеми play — для e2e входу відвідувачів (фаза 9a). Підключається до
 * scripts/dev/fake-postgrest.mjs (той самий порт, SUPABASE_URL): сайт ходить у /auth/v1/* і /rest/v1/* як у справжнього
 * Supabase. Лише localhost; справжніх листів немає — код лежить у пам'яті й читається через GET /__auth/last-code.
 *
 * Поведінка, звірена з документацією й кодом supabase/auth (19.11):
 *   POST /auth/v1/otp {email, create_user}      → 200; на ту саму адресу частіше ніж раз на 60 с — 429
 *   POST /auth/v1/verify {type:"email",email,token} → 200 сесія | 403 {error_code:"otp_expired"} (невірний і прострочений код)
 *   POST /auth/v1/token?grant_type=refresh_token → 200 нова пара (refresh одноразовий; повтор у межах 10 с віддає ту саму)
 *                                                   | 400 {error_code:"refresh_token_not_found"}
 *   POST /auth/v1/logout?scope=local (Bearer)   → 204, refresh-токени користувача недійсні
 *   GET  /auth/v1/.well-known/jwks.json         → публічний ключ ES256 (як на справжньому проєкті — замір 19.11)
 *   GET  /rest/v1/profiles (Accept-Profile: play) · POST /rest/v1/rpc/set_nick · POST /rest/v1/rpc/delete_my_account
 *                                               — перевірка JWT, ті самі коди помилок, що в базі (23505, 23514, P0001 blocked)
 *   Прогнози (фаза 9c): POST /rest/v1/rpc/deadline (анонімно) · POST /rest/v1/rpc/save_prediction (JWT; ті самі перевірки й коди,
 *   що play.save_prediction з 0015) · GET /rest/v1/predictions (свої) · GET /rest/v1/revealed_predictions (анонімно, лише після дедлайну).
 *   Дедлайн етапу: за замовчуванням етапи ≤ 21 закриті, ≥ 22 відкриті (від «зараз», тож тести не залежать від дати запуску);
 *   POST /__play/deadline?year=&round=&in=<с | null> ставить абсолютний момент від «зараз»; GET /__play/predictions?email= — збережене.
 * Тестові керування: GET /__auth/last-code?email= · POST /__auth/expire-code?email= · POST /__auth/reset-rate?email= (знімає паузу 60 с) · POST /__auth/ttl?email=&s= (термін
 *   access для нових токенів користувача) · POST /__auth/block?email= · POST /__auth/revoke?email= · GET /__auth/stats?email=
 */
import { generateKeyPairSync, randomBytes, randomUUID, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { nickProblem, nickSkeleton } from "../../src/lib/play/nick-rules.mjs";
const b64u = (v) => Buffer.from(v).toString("base64url");
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KID = "fake-es256-key";
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "ES256", use: "sig", key_ops: ["verify"], ext: true };

/** email → {id, nick, blocked, ttl, stats} */
const users = new Map();
/** email → {code, sentAt, exp} */
const codes = new Map();
/** refresh → {email, child?, usedAt?} */
const refresh = new Map();

const json = (res, status, body, headers = {}) => res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers }).end(body === undefined ? undefined : JSON.stringify(body));
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
const parse = (s) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };

function userOf(email, create) {
  let u = users.get(email);
  if (!u && create) {
    u = { id: randomUUID(), email, nick: null, blocked: false, ttl: 3600, stats: { refreshes: 0, logins: 0, codes: 0 }, revokedAt: 0 };
    users.set(email, u);
  }
  return u;
}

function accessToken(origin, u) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "ES256", typ: "JWT", kid: KID }));
  const body = b64u(JSON.stringify({ iss: `${origin}/auth/v1`, aud: "authenticated", sub: u.id, role: "authenticated", email: u.email, iat: now, exp: now + u.ttl }));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}

function newSession(origin, u) {
  const token = `r-${randomBytes(12).toString("hex")}`;
  refresh.set(token, { email: u.email });
  return { access_token: accessToken(origin, u), token_type: "bearer", expires_in: u.ttl, refresh_token: token, user: { id: u.id, email: u.email } };
}

/** JWT з Authorization: перевіряє підпис ES256, issuer, audience, exp; повертає користувача або null. */
function bearerUser(req, origin) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  const parts = m?.[1]?.split(".");
  if (!parts || parts.length !== 3) return null;
  try {
    const ok = require_verify(parts);
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!ok || claims.iss !== `${origin}/auth/v1` || claims.aud !== "authenticated" || claims.exp < Date.now() / 1000) return null;
    return [...users.values()].find((u) => u.id === claims.sub) ?? null;
  } catch {
    return null;
  }
}
const require_verify = (p) => verify("sha256", Buffer.from(`${p[0]}.${p[1]}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(p[2], "base64url"));

function nickError(raw) {
  // Те саме, що play.set_nick: NFKC → play.nick_valid (23514) → унікальність за скелетом (23505). Правила — src/lib/play/nick-rules.mjs.
  const nick = String(raw ?? "").normalize("NFKC");
  if (nickProblem(nick)) return { status: 400, body: { code: "23514", message: 'new row for relation "profiles" violates check constraint "profiles_nick_chk"' } };
  const key = nickSkeleton(nick);
  if ([...users.values()].some((u) => u.nick && nickSkeleton(u.nick) === key)) return { status: 409, body: { code: "23505", message: 'duplicate key value violates unique constraint "profiles_nick_key_idx"' } };
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Прогнози (фаза 9c). Знання пілотів і команд — з тих самих фікстур, що й збірка сайту (e2e/fixtures/db): так id, які бачить
// форма, збігаються з тими, що «знає» база (play.save_prediction → unknown_driver / unknown_team).
// ---------------------------------------------------------------------------------------------------------------------
const fixture = (name) => JSON.parse(readFileSync(new URL(`../../e2e/fixtures/db/${name}.json`, import.meta.url), "utf8"));
const KNOWN_DRIVERS = new Set(fixture("drivers").map((d) => d.id));
const KNOWN_TEAMS = new Set(fixture("results").map((r) => r.team_id));
/** "рік/етап" → абсолютний момент дедлайну (мс) або null (невідомий) — лише ті, що поставив тест. */
const deadlineSet = new Map();
/** {userId, year, round, kind, picks, dnfTeam, allFinish, updatedAt} */
let predictions = [];

function deadlineMs(year, round) {
  const key = `${year}/${round}`;
  if (deadlineSet.has(key)) return deadlineSet.get(key);
  return Date.now() + (round <= 21 ? -3_600_000 : 3 * 86_400_000);
}
const pgError = (res, status, code, message) => json(res, status, { code, message, details: null, hint: null });

function picksValid(p) {
  if (!Array.isArray(p) || p.length !== 10 || !p.every((v) => v === null || Number.isSafeInteger(v))) return false;
  if (p[0] === null || p[1] === null || p[2] === null) return false;
  const chosen = p.filter((v) => v !== null);
  return new Set(chosen).size === chosen.length;
}

/** Перевірки play.save_prediction у тому ж порядку, що й у міграції 0015; дедлайн — останнім (тригер). */
function savePredictionError(u, a) {
  if (u.blocked) return "blocked";
  if (!u.nick) return "no_profile";
  if (a.p_kind !== "Q" && a.p_kind !== "R") return "bad_kind";
  if (a.p_year !== 2026 || !Number.isInteger(a.p_round) || a.p_round < 1 || a.p_round > 23) return "unknown_round";
  if (!picksValid(a.p_picks)) return "bad_picks";
  if (a.p_picks.some((d) => d !== null && !KNOWN_DRIVERS.has(d))) return "unknown_driver";
  if (a.p_kind === "Q" && (a.p_dnf_team != null || a.p_all_finish === true)) return "bad_extras";
  if (a.p_dnf_team != null && !KNOWN_TEAMS.has(a.p_dnf_team)) return "unknown_team";
  if (a.p_all_finish === true && a.p_dnf_team != null) return "bad_extras";
  const dl = deadlineMs(a.p_year, a.p_round);
  if (dl === null || Date.now() >= dl) return "prediction_closed";
  return null;
}

const eq = (url, name) => {
  const v = url.searchParams.get(name);
  return v?.startsWith("eq.") ? Number(v.slice(3)) : NaN;
};
/** Текстовий фільтр `name=eq.<значення>` (searchParams уже декодовано один раз, як у PostgREST); немає фільтра — null. */
const str = (url, name) => {
  const v = url.searchParams.get(name);
  return v?.startsWith("eq.") ? v.slice(3) : null;
};
const project = (rows, select, allowed, res) => {
  const cols = (select ?? "*") === "*" ? allowed : select.split(",");
  const bad = cols.find((c) => !allowed.includes(c));
  if (bad) return void pgError(res, 400, "42703", `column ${bad} does not exist`);
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
};

/** Прогнози й тестові керування; true — запит оброблено. */
async function handlePredictionsFake(req, res, url, origin) {
  const p = url.pathname;
  if (p === "/__play/deadline" && req.method === "POST") {
    const raw = url.searchParams.get("in");
    deadlineSet.set(`${url.searchParams.get("year")}/${url.searchParams.get("round")}`, raw === "null" ? null : Date.now() + Number(raw) * 1000);
    return json(res, 200, { ok: true }), true;
  }
  if (p === "/__play/predictions" && req.method === "GET") {
    const u = users.get((url.searchParams.get("email") ?? "").toLowerCase());
    return json(res, 200, predictions.filter((x) => u && x.userId === u.id)), true;
  }

  if (p === "/rest/v1/rpc/deadline" && req.method === "POST") {
    if (!req.headers.apikey) return json(res, 401, { message: "No API key found in request" }), true;
    if (req.headers["content-profile"] !== "play") return pgError(res, 406, "PGRST106", "The schema must be one of the following: f1"), true;
    const a = parse(await readBody(req));
    const dl = deadlineMs(a.p_year, a.p_round);
    return json(res, 200, dl === null ? null : new Date(dl).toISOString()), true;
  }

  if (p === "/rest/v1/revealed_predictions" && req.method === "GET") {
    if (!req.headers.apikey) return json(res, 401, { message: "No API key found in request" }), true;
    if (req.headers["accept-profile"] !== "play") return pgError(res, 406, "PGRST106", "The schema must be one of the following: f1"), true;
    const year = eq(url, "season_year");
    const round = eq(url, "round");
    // Подання бази показує прогнози лише після дедлайну й лише гравців з ніком, що не заблоковані.
    const byId = new Map([...users.values()].map((x) => [x.id, x]));
    const rows = predictions
      .filter((x) => x.year === year && x.round === round)
      .filter((x) => {
        const dl = deadlineMs(x.year, x.round);
        const owner = byId.get(x.userId);
        return dl !== null && Date.now() >= dl && owner?.nick && !owner.blocked;
      })
      .map((x) => ({ id: 1, season_year: x.year, round: x.round, kind: x.kind, player: byId.get(x.userId).nick, picks: x.picks, dnf_team_id: x.dnfTeam, all_finish: x.allFinish, points: null }))
      .sort((a, b) => a.player.localeCompare(b.player))
      // Фільтри PostgREST, які ставить сайт (рев'ю 21.11): вид (kind=eq.Q), «мій» рядок (player=eq.<ім'я>) і limit — як у базі.
      .filter((x) => (str(url, "kind") ?? x.kind) === x.kind && (str(url, "player") ?? x.player) === x.player)
      .slice(0, Number(url.searchParams.get("limit")) || undefined);
    const out = project(rows, url.searchParams.get("select"), ["id", "season_year", "round", "kind", "player", "picks", "dnf_team_id", "all_finish", "points"], res);
    return out ? (json(res, 200, out), true) : true;
  }

  const own = p === "/rest/v1/predictions" && req.method === "GET";
  const save = p === "/rest/v1/rpc/save_prediction" && req.method === "POST";
  if (!own && !save) return false;
  if (!req.headers.apikey) return json(res, 401, { message: "No API key found in request" }), true;
  const profile = own ? req.headers["accept-profile"] : req.headers["content-profile"];
  if (profile !== "play") return pgError(res, 406, "PGRST106", "The schema must be one of the following: f1"), true;
  const u = bearerUser(req, origin);
  if (!u) return pgError(res, 401, "PGRST301", "JWT expired or invalid"), true;

  if (own) {
    const year = eq(url, "season_year");
    const round = eq(url, "round");
    const rows = predictions
      .filter((x) => x.userId === u.id && x.year === year && x.round === round)
      .map((x) => ({ kind: x.kind, picks: x.picks, dnf_team_id: x.dnfTeam, all_finish: x.allFinish, updated_at: new Date(x.updatedAt).toISOString() }));
    const out = project(rows, url.searchParams.get("select"), ["kind", "picks", "dnf_team_id", "all_finish", "updated_at"], res);
    return out ? (json(res, 200, out), true) : true;
  }

  const a = parse(await readBody(req));
  const err = savePredictionError(u, a);
  if (err) return pgError(res, 400, "P0001", err), true;
  const row = { userId: u.id, year: a.p_year, round: a.p_round, kind: a.p_kind, picks: a.p_picks, dnfTeam: a.p_dnf_team ?? null, allFinish: a.p_all_finish === true, updatedAt: Date.now() };
  predictions = predictions.filter((x) => !(x.userId === u.id && x.year === row.year && x.round === row.round && x.kind === row.kind));
  predictions.push(row);
  return res.writeHead(204).end(), true;
}

/** Повертає true, якщо запит оброблено (інакше — далі фейковий PostgREST зі схемою f1). */
export async function handleSupabaseFake(req, res, url, port) {
  const origin = `http://127.0.0.1:${port}`;
  const p = url.pathname;

  if (p.startsWith("/__auth/")) {
    const email = (url.searchParams.get("email") ?? "").toLowerCase();
    if (p === "/__auth/last-code") {
      const c = codes.get(email);
      return json(res, c ? 200 : 404, c ? { code: c.code } : { error: "no code" }), true;
    }
    if (p === "/__auth/expire-code") { const c = codes.get(email); if (c) c.exp = 0; return json(res, 200, { ok: true }), true; }
    if (p === "/__auth/reset-rate") { const c = codes.get(email); if (c) c.sentAt = 0; return json(res, 200, { ok: true }), true; }
    if (p === "/__auth/ttl") { const u = userOf(email, true); u.ttl = Number(url.searchParams.get("s") ?? 3600); return json(res, 200, { ttl: u.ttl }), true; }
    if (p === "/__auth/block") { const u = userOf(email, true); u.blocked = true; return json(res, 200, { ok: true }), true; }
    if (p === "/__auth/revoke") { for (const [t, r] of refresh) if (r.email === email) refresh.delete(t); return json(res, 200, { ok: true }), true; }
    if (p === "/__auth/stats") { const u = users.get(email); return json(res, 200, u ? { ...u.stats, exists: true, nick: u.nick, blocked: u.blocked } : { exists: false }), true; }
    return json(res, 404, { error: "unknown hook" }), true;
  }

  if (p === "/auth/v1/.well-known/jwks.json") return json(res, 200, { keys: [jwk] }), true;

  if (p.startsWith("/auth/v1/")) {
    if (!req.headers.apikey) return json(res, 401, { message: "No API key found in request" }), true;
    const body = parse(req.method === "POST" ? await readBody(req) : "");

    if (p === "/auth/v1/otp" && req.method === "POST") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 422, { code: 422, error_code: "validation_failed", msg: "Unable to validate email address: invalid format" }), true;
      const prev = codes.get(email);
      if (prev && Date.now() - prev.sentAt < 60_000) return json(res, 429, { code: 429, error_code: "over_email_send_rate_limit", msg: "For security purposes, you can only request this after 60 seconds." }), true;
      const u = userOf(email, body.create_user !== false);
      if (!u) return json(res, 400, { code: 400, error_code: "otp_disabled", msg: "Signups not allowed for otp" }), true;
      u.stats.codes++;
      codes.set(email, { code: String(Math.floor(Math.random() * 1e8)).padStart(8, "0"), sentAt: Date.now(), exp: Date.now() + 600_000 });
      return json(res, 200, {}), true;
    }
    if (p === "/auth/v1/verify" && req.method === "POST") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const c = codes.get(email);
      if (body.type !== "email" || !c || c.exp < Date.now() || c.code !== String(body.token ?? "")) return json(res, 403, { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" }), true;
      codes.delete(email); // одноразовий
      const u = userOf(email, true);
      u.stats.logins++;
      return json(res, 200, newSession(origin, u)), true;
    }
    if (p === "/auth/v1/token" && req.method === "POST" && url.searchParams.get("grant_type") === "refresh_token") {
      const rec = refresh.get(String(body.refresh_token ?? ""));
      const u = rec && users.get(rec.email);
      if (!rec || !u) return json(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" }), true;
      u.stats.refreshes++;
      // Повторне використання в межах 10 с віддає ту саму нову пару (interval reuse), інакше — старий токен недійсний.
      if (rec.child && Date.now() - rec.usedAt < 10_000) return json(res, 200, rec.child), true;
      const session = newSession(origin, u);
      rec.child = session;
      rec.usedAt = Date.now();
      return json(res, 200, session), true;
    }
    if (p === "/auth/v1/logout" && req.method === "POST") {
      const u = bearerUser(req, origin);
      if (!u) return json(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" }), true;
      for (const [t, r] of refresh) if (r.email === u.email) refresh.delete(t);
      return res.writeHead(204).end(), true;
    }
    if (p === "/auth/v1/user" && req.method === "GET") {
      const u = bearerUser(req, origin);
      return u ? json(res, 200, { id: u.id, email: u.email }) : json(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" }), true;
    }
    return json(res, 404, { msg: "not found" }), true;
  }

  if (await handlePredictionsFake(req, res, url, origin)) return true;
  if (p.startsWith("/__play/")) return json(res, 404, { error: "unknown hook" }), true;

  const rpc = /^\/rest\/v1\/rpc\/(set_nick|delete_my_account)$/.exec(p);
  const isProfiles = p === "/rest/v1/profiles" && req.method === "GET";
  if ((rpc && req.method === "POST") || isProfiles) {
    if (!req.headers.apikey) return json(res, 401, { message: "No API key found in request" }), true;
    const profile = isProfiles ? req.headers["accept-profile"] : req.headers["content-profile"];
    if (profile !== "play") return json(res, 406, { code: "PGRST106", message: "The schema must be one of the following: f1" }), true;
    const u = bearerUser(req, origin);
    if (!u) return json(res, 401, { code: "PGRST301", message: "JWT expired or invalid" }), true;
    if (isProfiles) return json(res, 200, u.nick ? [{ nick: u.nick, public_name: u.nick }] : []), true;
    const body = parse(await readBody(req));
    if (rpc[1] === "set_nick") {
      if (u.blocked) return json(res, 400, { code: "P0001", message: "blocked" }), true;
      const err = nickError(body.p_nick);
      if (err) return json(res, err.status, err.body), true;
      u.nick = String(body.p_nick).normalize("NFKC");
      return res.writeHead(204).end(), true;
    }
    predictions = predictions.filter((x) => x.userId !== u.id); // каскад у базі: профіль → прогнози
    if (u.blocked) { u.nick = null; return json(res, 200, "data_only_blocked"), true; }
    users.delete(u.email);
    for (const [t, r] of refresh) if (r.email === u.email) refresh.delete(t);
    return json(res, 200, "deleted"), true;
  }
  return false;
}
