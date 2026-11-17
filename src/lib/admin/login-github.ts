import "server-only";
import * as oauth from "oauth4webapi";
import type { GitHubLogin } from "./env";
import type { Admin, Flow } from "./token";

/**
 * Вхід через GitHub (OAuth App, рішення користувача 17.11): код + PKCE + state (oauth4webapi), потім /user — числовий id
 * акаунта (логін можна змінити, id — ні). Адмін — лише id з ADMIN_GITHUB_IDS. Права токена не просимо (scope порожній):
 * для /user досить публічних даних, і токен ніде не зберігаємо.
 */

const server = (gh: GitHubLogin): oauth.AuthorizationServer => ({
  issuer: "https://github.com",
  authorization_endpoint: gh.authorize,
  token_endpoint: gh.token,
});
const opts = (gh: GitHubLogin) => (gh.insecure ? { [oauth.allowInsecureRequests]: true } : {});

export function githubCallback(origin: string): string {
  return new URL("/admin/auth/callback", origin).href;
}

export async function startGitHub(gh: GitHubLogin, origin: string): Promise<{ url: URL; flow: Extract<Flow, { kind: "github" }> }> {
  const flow = { kind: "github" as const, verifier: oauth.generateRandomCodeVerifier(), state: oauth.generateRandomState() };
  const url = new URL(gh.authorize);
  url.searchParams.set("client_id", gh.clientId);
  url.searchParams.set("redirect_uri", githubCallback(origin));
  url.searchParams.set("state", flow.state);
  url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(flow.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("allow_signup", "false");
  return { url, flow };
}

/** Адмін або null (будь-яка помилка протоколу, скасування, чужий акаунт). */
export async function finishGitHub(gh: GitHubLogin, origin: string, callback: URL, flow: Extract<Flow, { kind: "github" }>, fetchImpl: typeof fetch = fetch): Promise<Admin | null> {
  try {
    const as = server(gh);
    const client: oauth.Client = { client_id: gh.clientId };
    const params = oauth.validateAuthResponse(as, client, callback, flow.state);
    const res = await oauth.authorizationCodeGrantRequest(as, client, oauth.ClientSecretPost(gh.clientSecret), params, githubCallback(origin), flow.verifier, {
      ...opts(gh),
      [oauth.customFetch]: fetchImpl,
    });
    const token = await oauth.processAuthorizationCodeResponse(as, client, res);
    const user = await fetchImpl(`${gh.api}/user`, {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "slipstream-admin" },
      cache: "no-store",
    });
    if (!user.ok) return null;
    const { id, login } = (await user.json()) as { id?: unknown; login?: unknown };
    if (typeof id !== "number" || !gh.ids.has(id)) return null;
    return { sub: `github:${id}`, label: typeof login === "string" ? login : `GitHub ${id}` };
  } catch {
    return null;
  }
}
