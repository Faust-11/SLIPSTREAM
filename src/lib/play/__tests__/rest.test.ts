import { afterEach, describe, expect, it, vi } from "vitest";
import { playConfig } from "../config";
import { deleteAccount, getProfile, setNick } from "../rest";

const cfg = playConfig({ SUPABASE_URL: "https://p.supabase.test", SUPABASE_ANON_KEY: "sb_publishable_x" })!;
const reply = (status: number, body?: unknown) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
afterEach(() => vi.restoreAllMocks());

describe("PostgREST схеми play", () => {
  it("профіль: Accept-Profile play, Bearer гравця; порожньо — профілю ще немає", async () => {
    const spy = reply(200, []);
    expect(await getProfile(cfg, "TOKEN")).toEqual({ ok: true, profile: null });
    const h = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(h["accept-profile"]).toBe("play");
    expect(h.authorization).toBe("Bearer TOKEN");
    expect(h.apikey).toBe("sb_publishable_x");
    reply(200, [{ nick: "Max", public_name: "Max" }]);
    expect(await getProfile(cfg, "T")).toEqual({ ok: true, profile: { nick: "Max", publicName: "Max" } });
    reply(406, { code: "PGRST106" }); // схему play не відкрито в Exposed schemas
    expect(await getProfile(cfg, "T")).toEqual({ ok: false });
  });
  it("set_nick: Content-Profile play; коди бази → причини", async () => {
    const spy = reply(204);
    expect(await setNick(cfg, "T", "Max")).toEqual({ ok: true });
    expect(spy.mock.calls[0]![0]).toBe("https://p.supabase.test/rest/v1/rpc/set_nick");
    expect((spy.mock.calls[0]![1]!.headers as Record<string, string>)["content-profile"]).toBe("play");
    expect(JSON.parse(String(spy.mock.calls[0]![1]!.body))).toEqual({ p_nick: "Max" });
    const cases: [number, object, string][] = [
      [409, { code: "23505" }, "taken"],
      [400, { code: "23514" }, "invalid"],
      [400, { code: "P0001", message: "blocked" }, "blocked"],
      [400, { code: "28000", message: "not_authenticated" }, "unauthorized"],
      [401, { code: "PGRST301" }, "unauthorized"],
      [500, { code: "XX000" }, "unavailable"],
    ];
    for (const [status, body, reason] of cases) {
      reply(status, body);
      expect(await setNick(cfg, "T", "Max"), reason).toEqual({ ok: false, reason });
    }
  });
  it("delete_my_account: deleted / data_only_blocked; інше — unavailable", async () => {
    reply(200, "deleted");
    expect(await deleteAccount(cfg, "T")).toEqual({ ok: true, kind: "deleted" });
    reply(200, "data_only_blocked");
    expect(await deleteAccount(cfg, "T")).toEqual({ ok: true, kind: "data_only_blocked" });
    reply(200, "weird");
    expect(await deleteAccount(cfg, "T")).toEqual({ ok: false, reason: "unavailable" });
    reply(401, {});
    expect(await deleteAccount(cfg, "T")).toEqual({ ok: false, reason: "unauthorized" });
  });
});
