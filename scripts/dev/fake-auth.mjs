#!/usr/bin/env node
/**
 * Фейкові GitHub OAuth і Resend для e2e адмінки — без справжніх ключів і мережі.
 *
 *   node scripts/dev/fake-auth.mjs [--port 4455]
 *   ADMIN_GITHUB_OAUTH_BASE=http://127.0.0.1:4455  ADMIN_RESEND_API=http://127.0.0.1:4455
 *   (адмінка приймає їх лише на localhost і не на Vercel — src/lib/admin/env.ts)
 *
 * GitHub: хто «входить» — cookie `fake_gh` на домені фейку: `<id>:<login>`; без неї — «скасував вхід».
 *   Перевіряє те саме, що GitHub: client_id/secret, redirect_uri, PKCE S256, одноразовий код; /user — за токеном.
 * Resend: POST /emails з ключем `test-resend-key` зберігає лист; GET /__mail?to=<адреса> — останній лист (для e2e).
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] || 4455);
const CLIENT_ID = "test-gh-client";
const CLIENT_SECRET = "test-gh-secret";
const RESEND_KEY = "test-resend-key";

/** code → { redirectUri, challenge, user, exp } */
const codes = new Map();
/** token → user */
const tokens = new Map();
/** адреса → останній лист */
const mail = new Map();

const b64url = (b) => Buffer.from(b).toString("base64url");
const json = (res, status, body) => res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
const body = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
function cookie(req, name) {
  for (const part of (req.headers.cookie ?? "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

  if (req.method === "GET" && url.pathname === "/login/oauth/authorize") {
    const p = url.searchParams;
    if (p.get("client_id") !== CLIENT_ID || p.get("code_challenge_method") !== "S256" || !p.get("code_challenge")) return res.writeHead(400).end("bad request");
    const redirect = new URL(p.get("redirect_uri") ?? "");
    const user = cookie(req, "fake_gh");
    if (!user) {
      redirect.searchParams.set("error", "access_denied");
    } else {
      const [id, login] = user.split(":");
      const code = b64url(randomBytes(20));
      codes.set(code, { redirectUri: redirect.href, challenge: p.get("code_challenge"), user: { id: Number(id), login }, exp: Date.now() + 60_000 });
      redirect.searchParams.set("code", code);
    }
    redirect.searchParams.set("state", p.get("state") ?? "");
    return res.writeHead(302, { location: redirect.href }).end();
  }

  if (req.method === "POST" && url.pathname === "/login/oauth/access_token") {
    const p = new URLSearchParams(await body(req));
    const entry = codes.get(p.get("code") ?? "");
    codes.delete(p.get("code") ?? "");
    const challenge = b64url(createHash("sha256").update(p.get("code_verifier") ?? "").digest());
    if (!entry || entry.exp < Date.now() || p.get("client_id") !== CLIENT_ID || p.get("client_secret") !== CLIENT_SECRET || p.get("redirect_uri") !== entry.redirectUri || challenge !== entry.challenge) {
      return json(res, 200, { error: "bad_verification_code" }); // GitHub так і відповідає — 200 з error
    }
    const token = b64url(randomBytes(20));
    tokens.set(token, entry.user);
    return json(res, 200, { access_token: token, token_type: "bearer", scope: "" });
  }

  if (req.method === "GET" && url.pathname === "/user") {
    const user = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /, ""));
    return user ? json(res, 200, user) : json(res, 401, { message: "Bad credentials" });
  }

  if (req.method === "POST" && url.pathname === "/emails") {
    if (req.headers.authorization !== `Bearer ${RESEND_KEY}`) return json(res, 401, { message: "invalid key" });
    const m = JSON.parse(await body(req));
    for (const to of m.to ?? []) mail.set(to, m);
    return json(res, 200, { id: b64url(randomBytes(8)) });
  }
  if (req.method === "GET" && url.pathname === "/__mail") {
    const m = mail.get(url.searchParams.get("to") ?? "");
    return m ? json(res, 200, m) : json(res, 404, {});
  }

  res.writeHead(404).end("not found");
}).listen(port, "127.0.0.1", () => console.log(`fake GitHub OAuth + Resend on http://127.0.0.1:${port}`));
