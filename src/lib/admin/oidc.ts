import "server-only";
import * as oauth from "oauth4webapi";
import type { AdminEnv } from "./env";
import type { Flow } from "./token";

/**
 * Вхід через Google (OpenID Connect, код + PKCE + state + nonce) — бібліотека oauth4webapi. ID-токен приходить з
 * токен-ендпойнта по TLS, тож за OIDC Core 3.1.3.7 підпис можна не перевіряти; issuer, audience, строк і nonce
 * перевіряє бібліотека. Адмін — лише з `email_verified: true` і e-mail у ADMIN_EMAILS.
 */

const discovered = new Map<string, Promise<oauth.AuthorizationServer>>();

function options(env: AdminEnv) {
  return env.insecureIssuer ? { [oauth.allowInsecureRequests]: true } : {};
}

function server(env: AdminEnv): Promise<oauth.AuthorizationServer> {
  const key = env.issuer.href;
  let as = discovered.get(key);
  if (!as) {
    as = oauth
      .discoveryRequest(env.issuer, options(env))
      .then((res) => oauth.processDiscoveryResponse(env.issuer, res));
    // Помилку не кешуємо: наступна спроба входу перезапитає.
    as.catch(() => discovered.delete(key));
    discovered.set(key, as);
  }
  return as;
}

export function redirectUri(origin: string): string {
  return new URL("/admin/auth/callback", origin).href;
}

export async function startLogin(env: AdminEnv, origin: string): Promise<{ url: URL; flow: Flow }> {
  const as = await server(env);
  if (!as.authorization_endpoint) throw new Error("OIDC: немає authorization_endpoint");
  const flow: Flow = { verifier: oauth.generateRandomCodeVerifier(), state: oauth.generateRandomState(), nonce: oauth.generateRandomNonce() };
  const url = new URL(as.authorization_endpoint);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", redirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(flow.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", flow.state);
  url.searchParams.set("nonce", flow.nonce);
  url.searchParams.set("prompt", "select_account");
  return { url, flow };
}

/** E-mail адміна або null (будь-яка помилка протоколу, не підтверджений чи не той e-mail). */
export async function finishLogin(env: AdminEnv, origin: string, callback: URL, flow: Flow): Promise<string | null> {
  try {
    const as = await server(env);
    const client: oauth.Client = { client_id: env.clientId };
    const params = oauth.validateAuthResponse(as, client, callback, flow.state);
    const res = await oauth.authorizationCodeGrantRequest(
      as,
      client,
      oauth.ClientSecretPost(env.clientSecret),
      params,
      redirectUri(origin),
      flow.verifier,
      options(env),
    );
    const result = await oauth.processAuthorizationCodeResponse(as, client, res, { expectedNonce: flow.nonce, requireIdToken: true });
    const claims = oauth.getValidatedIdTokenClaims(result);
    const email = typeof claims?.email === "string" ? claims.email.toLowerCase() : "";
    return claims?.email_verified === true && env.admins.has(email) ? email : null;
  } catch {
    return null;
  }
}
