#!/usr/bin/env node
/**
 * Фейковий OpenID-провайдер («Google») для e2e адмінки — без справжніх ключів і мережі.
 *
 *   node scripts/dev/fake-oidc.mjs [--port 4455]
 *   ADMIN_OIDC_ISSUER=http://127.0.0.1:4455 (адмінка приймає його лише на localhost і не на Vercel — src/lib/admin/env.ts)
 *
 * Хто «входить»: cookie `fake_user` на домені провайдера (e2e ставить її перед входом; паралельні тести не заважають
 * одне одному). Формат: `<email>` або `<email>|unverified`. Без cookie — сторінка з відмовою (як «скасував вхід»).
 * Перевіряє те саме, що Google: client_id/secret, redirect_uri, PKCE S256, одноразовий код; ID-токен — RS256 з nonce.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] || 4455);
const issuer = `http://127.0.0.1:${port}`;
const CLIENT_ID = process.env.FAKE_OIDC_CLIENT_ID || "test-client";
const CLIENT_SECRET = process.env.FAKE_OIDC_CLIENT_SECRET || "test-secret";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "fake-1", alg: "RS256", use: "sig" };
/** code → { clientId, redirectUri, challenge, nonce, email, verified, exp } */
const codes = new Map();

const json = (res, status, body) => res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
const b64url = (buf) => Buffer.from(buf).toString("base64url");

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

function cookie(req, name) {
  for (const part of (req.headers.cookie ?? "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return undefined;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", issuer);

  if (req.method === "GET" && url.pathname === "/.well-known/openid-configuration") {
    return json(res, 200, {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_post"],
    });
  }
  if (req.method === "GET" && url.pathname === "/jwks") return json(res, 200, { keys: [jwk] });

  if (req.method === "GET" && url.pathname === "/authorize") {
    const p = url.searchParams;
    if (p.get("client_id") !== CLIENT_ID || p.get("response_type") !== "code" || p.get("code_challenge_method") !== "S256") {
      return res.writeHead(400).end("bad authorization request");
    }
    const redirect = new URL(p.get("redirect_uri") ?? "");
    const user = cookie(req, "fake_user");
    if (!user) {
      redirect.searchParams.set("error", "access_denied");
    } else {
      const [email, flag] = user.split("|");
      const code = b64url(randomBytes(24));
      codes.set(code, {
        clientId: CLIENT_ID,
        redirectUri: redirect.href,
        challenge: p.get("code_challenge"),
        nonce: p.get("nonce"),
        email,
        verified: flag !== "unverified",
        exp: Date.now() + 60_000,
      });
      redirect.searchParams.set("code", code);
    }
    redirect.searchParams.set("state", p.get("state") ?? "");
    redirect.searchParams.set("iss", issuer);
    return res.writeHead(302, { location: redirect.href }).end();
  }

  if (req.method === "POST" && url.pathname === "/token") {
    const p = new URLSearchParams(await readBody(req));
    const entry = codes.get(p.get("code") ?? "");
    codes.delete(p.get("code") ?? "");
    const challenge = b64url(createHash("sha256").update(p.get("code_verifier") ?? "").digest());
    if (
      !entry ||
      entry.exp < Date.now() ||
      p.get("grant_type") !== "authorization_code" ||
      p.get("client_id") !== CLIENT_ID ||
      p.get("client_secret") !== CLIENT_SECRET ||
      p.get("redirect_uri") !== entry.redirectUri ||
      challenge !== entry.challenge
    ) {
      return json(res, 400, { error: "invalid_grant" });
    }
    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({ email: entry.email, email_verified: entry.verified, nonce: entry.nonce })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience(CLIENT_ID)
      .setSubject(createHash("sha256").update(entry.email).digest("hex").slice(0, 21))
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);
    return json(res, 200, { access_token: b64url(randomBytes(24)), token_type: "Bearer", expires_in: 3600, scope: "openid email", id_token: idToken });
  }

  res.writeHead(404).end("not found");
}).listen(port, "127.0.0.1", () => console.log(`fake OIDC on ${issuer}`));
