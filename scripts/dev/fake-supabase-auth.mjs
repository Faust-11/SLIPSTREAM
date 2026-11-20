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
 * Тестові керування: GET /__auth/last-code?email= · POST /__auth/expire-code?email= · POST /__auth/reset-rate?email= (знімає паузу 60 с) · POST /__auth/ttl?email=&s= (термін
 *   access для нових токенів користувача) · POST /__auth/block?email= · POST /__auth/revoke?email= · GET /__auth/stats?email=
 */
import { generateKeyPairSync, randomBytes, randomUUID, sign, verify } from "node:crypto";
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

const NICK_BAD_CHARS = /[\u0000-\u001f\u007f-\u009f@\u00a0\u00ad\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\ufeff]/;
function nickError(nick) {
  const len = [...nick].length;
  if (typeof nick !== "string" || len < 3 || len > 24 || nick !== nick.trim() || NICK_BAD_CHARS.test(nick) || /^[Гг]равець /.test(nick)) return { status: 400, body: { code: "23514", message: 'new row for relation "profiles" violates check constraint "profiles_nick_chk"' } };
  const taken = [...users.values()].some((u) => u.nick && u.nick.toLowerCase() === nick.toLowerCase());
  if (taken) return { status: 409, body: { code: "23505", message: 'duplicate key value violates unique constraint "profiles_nick_lower_idx"' } };
  return null;
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
      u.nick = body.p_nick;
      return res.writeHead(204).end(), true;
    }
    if (u.blocked) { u.nick = null; return json(res, 200, "data_only_blocked"), true; }
    users.delete(u.email);
    for (const [t, r] of refresh) if (r.email === u.email) refresh.delete(t);
    return json(res, 200, "deleted"), true;
  }
  return false;
}
