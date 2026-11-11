import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dbSelect } from "../db";

const ENV = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key" };

describe("dbSelect (PostgREST Supabase, схема f1)", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", ENV.SUPABASE_URL);
    vi.stubEnv("SUPABASE_ANON_KEY", ENV.SUPABASE_ANON_KEY);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("запит до /rest/v1/<view> зі схемою f1 і ключем anon; повертає JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ id: "mclaren" }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(dbSelect("team_index", "select=id")).resolves.toEqual([{ id: "mclaren" }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/rest/v1/team_index?select=id");
    const headers = new Headers(init.headers);
    expect(headers.get("accept-profile")).toBe("f1");
    expect(headers.get("apikey")).toBe("anon-key");
    expect(headers.get("authorization")).toBeNull(); // publishable — не JWT, лише apikey
  });

  it("без SUPABASE_URL чи ключа — ясна помилка (збірка падає, а не викладає порожню сторінку)", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    await expect(dbSelect("team_index", "select=id")).rejects.toThrow("SUPABASE_URL не задано");
    vi.stubEnv("SUPABASE_URL", ENV.SUPABASE_URL);
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    await expect(dbSelect("team_index", "select=id")).rejects.toThrow("SUPABASE_ANON_KEY не задано");
  });

  it("відповідь не 200 — помилка з кодом і назвою подання", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("relation does not exist", { status: 404 })));
    await expect(dbSelect("team_index", "select=id")).rejects.toThrow(/team_index.*404/);
  });

  it("порожня відповідь — помилка (дані мають бути завжди)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    await expect(dbSelect("team_index", "select=id")).rejects.toThrow(/порожн/);
  });

  it("назва подання — лише [a-z_]: без ін'єкцій у шлях", async () => {
    await expect(dbSelect("team_index/../x", "select=id")).rejects.toThrow(/подання/);
  });
});
