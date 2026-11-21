import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBoard, getMyLap, saveLap } from "../laps-rest";

const CFG = { url: "https://p.supabase.test", key: "KEY", issuer: "i", jwks: "j" };
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const lap = { track: "lyman" as const, ticks: 3592, jump: false, inputs: "1.100" };

describe("saveLap", () => {
  it("викликає RPC від імені гравця (його JWT) із секретом сервера в тілі", async () => {
    fetchMock.mockResolvedValue(res(200, { saved: true, ticks: 3592, jump: false, place: 3 }));
    const r = await saveLap(CFG, "TOK", "SECRET-0123456789abcdef", lap);
    expect(r).toEqual({ ok: true, lap: { saved: true, ticks: 3592, jump: false, place: 3 } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://p.supabase.test/rest/v1/rpc/save_lap");
    expect(init.headers).toMatchObject({ apikey: "KEY", authorization: "Bearer TOK", "content-profile": "play" });
    expect(JSON.parse(init.body)).toEqual({ p_secret: "SECRET-0123456789abcdef", p_track: "lyman", p_ticks: 3592, p_jump: false, p_inputs: "1.100" });
  });
  it("saved=false (наявне коло не гірше) передається як є", async () => {
    fetchMock.mockResolvedValue(res(200, { saved: false, ticks: 3400, jump: true, place: 1 }));
    expect(await saveLap(CFG, "T", "S", lap)).toEqual({ ok: true, lap: { saved: false, ticks: 3400, jump: true, place: 1 } });
  });
  it.each([
    [401, { message: "JWT expired" }, "unauthorized"],
    [400, { code: "28000", message: "not_authenticated" }, "unauthorized"],
    [400, { code: "P0001", message: "no_profile" }, "no_profile"],
    [400, { code: "P0001", message: "blocked" }, "blocked"],
    [400, { code: "23514", message: "check constraint" }, "invalid"],
    // налаштування, а не вина гравця: секрет не збігся / не задано / схему не відкрито
    [403, { code: "42501", message: "forbidden" }, "unavailable"],
    [400, { code: "55000", message: "not_configured" }, "unavailable"],
    [406, { code: "PGRST106", message: "schema" }, "unavailable"],
    [500, null, "unavailable"],
  ])("помилка %s %j → %s", async (status, body, reason) => {
    fetchMock.mockResolvedValue(res(status, body));
    expect(await saveLap(CFG, "T", "S", lap)).toEqual({ ok: false, reason });
  });
  it("мережа впала або відповідь не схожа на коло — недоступно", async () => {
    fetchMock.mockRejectedValue(new Error("net"));
    expect(await saveLap(CFG, "T", "S", lap)).toEqual({ ok: false, reason: "unavailable" });
    fetchMock.mockResolvedValue(res(200, { weird: 1 }));
    expect(await saveLap(CFG, "T", "S", lap)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("getMyLap", () => {
  it("коло й місце; null — кола ще немає", async () => {
    fetchMock.mockResolvedValueOnce(res(200, { ticks: 3600, jump: false, place: 4 }));
    expect(await getMyLap(CFG, "TOK", "port")).toEqual({ ok: true, lap: { ticks: 3600, jump: false, place: 4 } });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ p_track: "port" });
    fetchMock.mockResolvedValueOnce(res(200, null));
    expect(await getMyLap(CFG, "TOK", "port")).toEqual({ ok: true, lap: null });
    fetchMock.mockResolvedValueOnce(res(500, {}));
    expect(await getMyLap(CFG, "TOK", "port")).toEqual({ ok: false });
  });
});

describe("getBoard", () => {
  const row = (place: number, player: string, ticks: number) => ({ place, player, ticks, jump: false, set_at: "2026-11-21T10:00:00Z" });
  it("топ-10 публічного подання без токена, з кількістю гравців із content-range", async () => {
    fetchMock.mockResolvedValue(res(200, [row(1, "Max", 3500), row(2, "Lando", 3600)], { "content-range": "0-1/37" }));
    const r = await getBoard(CFG, "lyman");
    expect(r).toEqual({ ok: true, rows: [{ place: 1, player: "Max", ticks: 3500, jump: false, at: "2026-11-21T10:00:00Z" }, { place: 2, player: "Lando", ticks: 3600, jump: false, at: "2026-11-21T10:00:00Z" }], total: 37 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/rest/v1/lap_board?");
    expect(url).toContain("track=eq.lyman");
    expect(url).toContain("limit=10");
    expect(init.headers).not.toHaveProperty("authorization");
    expect(init.headers).toMatchObject({ "accept-profile": "play", prefer: "count=exact" });
  });
  it("кривий рядок пропускається; без content-range total = кількість рядків", async () => {
    fetchMock.mockResolvedValue(res(200, [row(1, "Max", 3500), { place: "x" }, { place: 2, player: 5 }]));
    expect(await getBoard(CFG, "forest")).toMatchObject({ ok: true, total: 1, rows: [{ player: "Max" }] });
  });
  it("збій бази — ok:false", async () => {
    fetchMock.mockResolvedValue(res(503, {}));
    expect(await getBoard(CFG, "lyman")).toEqual({ ok: false });
  });
});
