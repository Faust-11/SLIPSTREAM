// @vitest-environment node
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { parseAdminEnv, sameKey, type AdminEnv } from "../env";
import { sendCode } from "../login-email";
import { finishGitHub, startGitHub } from "../login-github";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  SESSION_TTL_S,
  checkCode,
  codeHash,
  formatCode,
  isAdminSub,
  newCode,
  normalizeCode,
  signFlow,
  signSession,
  verifyFlow,
  verifySession,
} from "../token";

const BASE = {
  ADMIN_AUTH_SECRET: "x".repeat(32),
  ADMIN_LOGIN_KEY: "k".repeat(16),
  ADMIN_GITHUB_CLIENT_ID: "gh-client",
  ADMIN_GITHUB_CLIENT_SECRET: "gh-secret",
  ADMIN_GITHUB_IDS: "195572242, 7",
  ADMIN_EMAILS: "Owner@Example.com, second@example.com",
  ADMIN_RESEND_KEY: "re_key",
};
const env = parseAdminEnv(BASE) as AdminEnv;
const now = Date.UTC(2026, 10, 17, 12);
const OWNER = { sub: "github:195572242", label: "Faust-11" };

describe("parseAdminEnv — помилка конфігурації = адмінки немає", () => {
  it("обидва способи: справжні адреси GitHub і Resend, id числами, e-mail у нижньому регістрі", () => {
    expect(env.github).toMatchObject({ authorize: "https://github.com/login/oauth/authorize", api: "https://api.github.com", insecure: false });
    expect([...env.github!.ids]).toEqual([195572242, 7]);
    expect(env.email).toMatchObject({ api: "https://api.resend.com", from: "Outlap <onboarding@resend.dev>" });
    expect([...env.email!.emails]).toEqual(["owner@example.com", "second@example.com"]);
  });

  it("лише один спосіб — інший null; жодного — адмінки немає", () => {
    expect(parseAdminEnv({ ...BASE, ADMIN_RESEND_KEY: "" })?.email).toBeNull();
    expect(parseAdminEnv({ ...BASE, ADMIN_GITHUB_IDS: "Faust-11" })?.github).toBeNull(); // логін замість id — не приймаємо
    expect(parseAdminEnv({ ...BASE, ADMIN_RESEND_KEY: "", ADMIN_GITHUB_CLIENT_SECRET: "" })).toBeNull();
  });

  it.each([
    ["короткий ключ сесій", { ADMIN_AUTH_SECRET: "x".repeat(31) }],
    ["без ключа входу", { ADMIN_LOGIN_KEY: undefined }],
    ["короткий ключ входу", { ADMIN_LOGIN_KEY: "k".repeat(15) }],
    ["зламана дата відкликання", { ADMIN_SESSIONS_AFTER: "вчора" }],
    ["фейковий GitHub не на localhost", { ADMIN_GITHUB_OAUTH_BASE: "https://evil.example" }],
    ["фейковий GitHub на Vercel", { ADMIN_GITHUB_OAUTH_BASE: "http://127.0.0.1:4455", VERCEL: "1" }],
    ["фейковий Resend не на localhost", { ADMIN_RESEND_API: "http://10.0.0.1" }],
    ["зламана адреса фейку", { ADMIN_RESEND_API: "::" }],
  ])("%s → null", (_, patch) => {
    expect(parseAdminEnv({ ...BASE, ...patch })).toBeNull();
  });

  it("фейки для e2e — лише localhost", () => {
    const e = parseAdminEnv({ ...BASE, ADMIN_GITHUB_OAUTH_BASE: "http://127.0.0.1:4455", ADMIN_RESEND_API: "http://localhost:4455" })!;
    expect(e.github).toMatchObject({ authorize: "http://127.0.0.1:4455/login/oauth/authorize", api: "http://127.0.0.1:4455", insecure: true });
    expect(e.email?.api).toBe("http://localhost:4455");
  });
});

describe("сесія", () => {
  it("GitHub і пошта; суб'єкт поза списком — недійсна", async () => {
    expect(await verifySession(env, await signSession(env, OWNER, now), now + 1000)).toEqual(OWNER);
    const mail = { sub: "email:owner@example.com", label: "owner@example.com" };
    expect(await verifySession(env, await signSession(env, mail, now), now)).toEqual(mail);
    for (const sub of ["github:1", "email:stranger@example.com", "google:owner@example.com", "github:abc", "github:195572242.5"]) {
      expect(await verifySession(env, await signSession(env, { sub, label: "x" }, now), now), sub).toBeNull();
    }
  });

  it("після 12 год — недійсна; прибрали зі списку — недійсна одразу", async () => {
    const token = await signSession(env, OWNER, now);
    expect(await verifySession(env, token, now + (SESSION_TTL_S + 1) * 1000)).toBeNull();
    const narrowed = parseAdminEnv({ ...BASE, ADMIN_GITHUB_IDS: "7" }) as AdminEnv;
    expect(await verifySession(narrowed, token, now)).toBeNull();
  });

  it("ADMIN_SESSIONS_AFTER: видані раніше — недійсні, пізніші — діють", async () => {
    const revoked = parseAdminEnv({ ...BASE, ADMIN_SESSIONS_AFTER: new Date(now + 60_000).toISOString() }) as AdminEnv;
    expect(await verifySession(revoked, await signSession(env, OWNER, now), now + 120_000)).toBeNull();
    expect(await verifySession(revoked, await signSession(env, OWNER, now + 120_000), now + 130_000)).toEqual(OWNER);
  });

  it("інший ключ, alg none, стан входу замість сесії, без iat, сміття — null", async () => {
    const other = parseAdminEnv({ ...BASE, ADMIN_AUTH_SECRET: "y".repeat(32) }) as AdminEnv;
    expect(await verifySession(env, await signSession(other, OWNER, now), now)).toBeNull();
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(
      JSON.stringify({ sub: OWNER.sub, iss: "slipstream-admin", aud: "slipstream-admin/session" }),
    ).toString("base64url")}.`;
    expect(await verifySession(env, none, now)).toBeNull();
    expect(await verifySession(env, await signFlow(env, { kind: "github", verifier: "v", state: "s" }, now), now)).toBeNull();
    const noIat = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setIssuer("slipstream-admin").setAudience("slipstream-admin/session").setSubject(OWNER.sub).setExpirationTime(Math.floor(now / 1000) + 60).sign(env.secret);
    expect(await verifySession(env, noIat, now)).toBeNull();
    expect(await verifySession(env, "garbage", now)).toBeNull();
    expect(await verifySession(env, undefined, now)).toBeNull();
  });

  it("isAdminSub", () => {
    expect(isAdminSub(env, "github:7")).toBe(true);
    expect(isAdminSub(env, "email:second@example.com")).toBe(true);
    expect(isAdminSub(parseAdminEnv({ ...BASE, ADMIN_RESEND_KEY: "" })!, "email:second@example.com")).toBe(false);
  });
});

describe("стан входу", () => {
  it("GitHub і пошта туди й назад; через 10 хв — недійсний; сесія замість стану — null", async () => {
    for (const flow of [{ kind: "github" as const, verifier: "v".repeat(43), state: "s" }, { kind: "email" as const, email: "a@b.c", codeHash: "h" }]) {
      const token = await signFlow(env, flow, now);
      expect(await verifyFlow(env, token, now + 60_000)).toEqual(flow);
      expect(await verifyFlow(env, token, now + 11 * 60_000)).toBeNull();
    }
    expect(await verifyFlow(env, await signSession(env, OWNER, now), now)).toBeNull();
  });
});

describe("код на пошту", () => {
  it("8 символів лише з алфавіту без схожих знаків; рівномірно (відкидання)", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const c = newCode();
      expect(c).toMatch(new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`));
      for (const ch of c) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    expect(counts.size).toBe(27);
    // 16 000 символів / 27 ≈ 593 на символ; 450–750 — з великим запасом для випадковості, але ловить перекіс у 2 рази.
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(450);
      expect(n).toBeLessThan(750);
    }
    expect(CODE_ALPHABET).not.toMatch(/[0O1IL5S2Z]/);
  });

  it("normalizeCode: регістр, дефіс, пробіли, кирилиця-двійники; чужі знаки — null", () => {
    expect(normalizeCode("k7xq-m4pg")).toBe("K7XQM4PG");
    expect(normalizeCode(" К7ХQ М4РG ")).toBe("K7XQM4PG"); // кирилиця К, Х, М, Р
    expect(normalizeCode("K7XQM4P0")).toBeNull(); // 0 немає в алфавіті
    expect(normalizeCode("K7XQ")).toBeNull();
    expect(formatCode("K7XQM4PG")).toBe("K7XQ-M4PG");
  });

  it("checkCode: правильний код саме для цієї адреси; інший код чи адреса — ні", () => {
    const flow = { kind: "email" as const, email: "owner@example.com", codeHash: codeHash(env, "owner@example.com", "K7XQM4PG") };
    expect(checkCode(env, flow, "k7xq-m4pg")).toBe(true);
    expect(checkCode(env, flow, "K7XQM4PH")).toBe(false);
    expect(checkCode(env, { ...flow, email: "second@example.com" }, "K7XQM4PG")).toBe(false);
    expect(checkCode(env, flow, "")).toBe(false);
  });

  it("sendCode: Resend з ключем, лист з кодом XXXX-XXXX; помилка сервісу — false", async () => {
    const sent: { url: string; auth: string | null; body: { to: string[]; subject: string; text: string } }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      sent.push({ url, auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await sendCode(env.email!, "owner@example.com", "K7XQM4PG", ok)).toBe(true);
    expect(sent[0]).toMatchObject({ url: "https://api.resend.com/emails", auth: "Bearer re_key", body: { to: ["owner@example.com"] } });
    expect(sent[0]!.body.subject).toContain("K7XQ-M4PG");
    const fail = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    expect(await sendCode(env.email!, "owner@example.com", "K7XQM4PG", fail)).toBe(false);
  });
});

describe("вхід через GitHub", () => {
  const origin = "https://slipstream.example";

  /** Фейк: токен-ендпойнт перевіряє PKCE, /user віддає заданого користувача. */
  function fakeGitHub(user: unknown, tokenOk = true) {
    let verifier = "";
    return (async (url: string | URL, init: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/login/oauth/access_token")) {
        verifier = new URLSearchParams(String(init.body)).get("code_verifier") ?? "";
        return new Response(JSON.stringify(tokenOk ? { access_token: "t", token_type: "bearer", scope: "" } : { error: "bad_verification_code" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.endsWith("/user")) return new Response(JSON.stringify(user), { status: verifier ? 200 : 401, headers: { "content-type": "application/json" } });
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;
  }

  it("адреса авторизації: client_id, redirect_uri, state, PKCE S256, без права реєстрації", async () => {
    const { url, flow } = await startGitHub(env.github!, origin);
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "gh-client",
      redirect_uri: "https://slipstream.example/admin/auth/callback",
      state: flow.state,
      code_challenge_method: "S256",
      allow_signup: "false",
    });
    expect(url.searchParams.has("scope")).toBe(false);
  });

  it("свій акаунт (за id) — адмін; чужий id, той самий логін з іншим id, помилка токена, скасування, чужий state — null", async () => {
    const { flow } = await startGitHub(env.github!, origin);
    const cb = (params: Record<string, string>) => new URL(`${origin}/admin/auth/callback?${new URLSearchParams(params)}`);
    const good = cb({ code: "c", state: flow.state });
    expect(await finishGitHub(env.github!, origin, good, flow, fakeGitHub({ id: 195572242, login: "Faust-11" }))).toEqual(OWNER);
    expect(await finishGitHub(env.github!, origin, good, flow, fakeGitHub({ id: 99, login: "Faust-11" }))).toBeNull();
    expect(await finishGitHub(env.github!, origin, good, flow, fakeGitHub({ id: "195572242" }))).toBeNull();
    expect(await finishGitHub(env.github!, origin, good, flow, fakeGitHub({ id: 195572242 }, false))).toBeNull();
    expect(await finishGitHub(env.github!, origin, cb({ error: "access_denied", state: flow.state }), flow, fakeGitHub({ id: 195572242 }))).toBeNull();
    expect(await finishGitHub(env.github!, origin, cb({ code: "c", state: "forged" }), flow, fakeGitHub({ id: 195572242 }))).toBeNull();
  });
});

describe("sameKey", () => {
  it("лише повний збіг, порожній — ні", () => {
    expect(sameKey("k".repeat(16), "k".repeat(16))).toBe(true);
    expect(sameKey("k".repeat(16), "k".repeat(15) + "x")).toBe(false);
    expect(sameKey("", "")).toBe(false);
  });
});

describe("назви cookie у next.config.ts і src/proxy.ts (там — літерали: matcher і rewrites аналізуються статично)", () => {
  it("збігаються з token.ts", async () => {
    const { readFileSync } = await import("node:fs");
    const { FLOW_COOKIE, SESSION_COOKIE } = await import("../token");
    expect([SESSION_COOKIE, FLOW_COOKIE]).toEqual(["ss_admin", "ss_admin_flow"]);
    for (const file of ["next.config.ts", "src/proxy.ts"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain('key: "ss_admin" }');
      expect(src, file).toContain('key: "ss_admin_flow" }');
      expect(src, file).toContain('type: "query", key: "key"');
      expect(src, file).toContain("login|github|email|code|verify");
    }
  });
});
