import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRACK_SPECS } from "@/lib/game/physics";

const session = vi.hoisted(() => ({ currentPlayer: vi.fn() }));
const rest = vi.hoisted(() => ({ saveLap: vi.fn(), getMyLap: vi.fn(), getBoard: vi.fn() }));
vi.mock("@/lib/play/session", () => session);
vi.mock("@/lib/play/laps-rest", () => rest);

import { GET as getBoardRoute } from "../leaderboard/route";
import { GET as getMine, POST } from "../laps/route";

const CFG = { url: "https://p.supabase.test", key: "k", issuer: "i", jwks: "j" };
const SECRET = "lap-secret-0123456789abcdef";
const player = { cfg: CFG, user: { userId: "u-lap-1", accessToken: "TOK" }, unavailable: false };
const bot = TRACK_SPECS.lyman.botInputs;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://outlap.test/api/game/laps", {
    method: "POST",
    headers: { origin: "https://outlap.test", host: "outlap.test", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", CFG.url);
  vi.stubEnv("SUPABASE_ANON_KEY", CFG.key);
  vi.stubEnv("GAME_LAP_SECRET", SECRET);
  Object.values({ ...session, ...rest }).forEach((f) => f.mockReset());
  session.currentPlayer.mockResolvedValue(player);
  rest.saveLap.mockResolvedValue({ ok: true, lap: { saved: true, ticks: TRACK_SPECS.lyman.botTicks, jump: false, place: 5 } });
});

describe("POST /api/game/laps", () => {
  it("повторює заїзд і передає базі СВІЙ час (не клієнтський), секрет сервера й токен гравця", async () => {
    const res = await POST(post({ track: "lyman", inputs: bot, jump: false, ticks: 1, time: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, saved: true, ticks: TRACK_SPECS.lyman.botTicks, jump: false, place: 5 });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(rest.saveLap).toHaveBeenCalledWith(CFG, "TOK", SECRET, { track: "lyman", ticks: TRACK_SPECS.lyman.botTicks, jump: false, inputs: bot });
  });
  it("фальстарт: +120 тіків", async () => {
    await POST(post({ track: "lyman", inputs: bot, jump: true }));
    expect(rest.saveLap).toHaveBeenCalledWith(CFG, "TOK", SECRET, expect.objectContaining({ ticks: TRACK_SPECS.lyman.botTicks + 120, jump: true }));
  });
  it("не коло → 400 без звернення до бази: обірваний ввід, зіпсований, невідома траса", async () => {
    const cut = bot.split(",").slice(0, 20).join(",");
    for (const body of [{ track: "lyman", inputs: cut }, { track: "lyman", inputs: "zz" }, { track: "nowhere", inputs: bot }, { inputs: bot }]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid");
    }
    expect(rest.saveLap).not.toHaveBeenCalled();
  });
  it("чужий Origin — 403; не ввійшов — 401; база недоступна — 503", async () => {
    expect((await POST(post({ track: "lyman", inputs: bot }, { origin: "https://evil.test" }))).status).toBe(403);
    session.currentPlayer.mockResolvedValue({ cfg: CFG, user: null, unavailable: false });
    expect((await POST(post({ track: "lyman", inputs: bot }))).status).toBe(401);
    session.currentPlayer.mockResolvedValue({ cfg: CFG, user: null, unavailable: true });
    expect((await POST(post({ track: "lyman", inputs: bot }))).status).toBe(503);
    session.currentPlayer.mockResolvedValue(null);
    expect((await POST(post({ track: "lyman", inputs: bot }))).status).toBe(503);
  });
  it("секрет сервера не задано чи надто короткий — запис вимкнено (503), база не викликається", async () => {
    vi.stubEnv("GAME_LAP_SECRET", "");
    expect((await POST(post({ track: "lyman", inputs: bot }))).status).toBe(503);
    vi.stubEnv("GAME_LAP_SECRET", "short");
    expect((await POST(post({ track: "lyman", inputs: bot }))).status).toBe(503);
    expect(rest.saveLap).not.toHaveBeenCalled();
  });
  it.each([
    ["no_profile", 403],
    ["blocked", 403],
    ["invalid", 400],
    ["unauthorized", 401],
    ["unavailable", 503],
  ])("відмова бази %s → %i", async (reason, status) => {
    rest.saveLap.mockResolvedValue({ ok: false, reason });
    const res = await POST(post({ track: "lyman", inputs: bot }));
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(reason);
  });
  it("м'який ліміт на гравця: 40 кіл за 10 хв, далі 429", async () => {
    session.currentPlayer.mockResolvedValue({ ...player, user: { userId: "u-flood", accessToken: "T" } });
    let last = 0;
    for (let i = 0; i < 41; i++) last = (await POST(post({ track: "lyman", inputs: "zz" }))).status;
    // зіпсовані тіла відсікаються до ліміту (форма), тож шлемо коректні
    for (let i = 0; i < 41; i++) last = (await POST(post({ track: "lyman", inputs: bot }))).status;
    expect(last).toBe(429);
  });
});

describe("GET /api/game/laps — моє коло", () => {
  const get = (qs: string) => new Request(`https://outlap.test/api/game/laps?${qs}`);
  it("анонім — signedIn:false; ввійшов — коло й місце; невідома траса — 400; збій — 503", async () => {
    session.currentPlayer.mockResolvedValue({ cfg: CFG, user: null, unavailable: false });
    expect(await (await getMine(get("track=lyman"))).json()).toEqual({ signedIn: false, mine: null });
    session.currentPlayer.mockResolvedValue(player);
    rest.getMyLap.mockResolvedValue({ ok: true, lap: { ticks: 3600, jump: false, place: 2 } });
    const res = await getMine(get("track=lyman"));
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ signedIn: true, mine: { ticks: 3600, jump: false, place: 2 } });
    expect((await getMine(get("track=zzz"))).status).toBe(400);
    rest.getMyLap.mockResolvedValue({ ok: false });
    expect((await getMine(get("track=lyman"))).status).toBe(503);
  });
});

describe("GET /api/game/leaderboard", () => {
  const get = (qs: string) => new Request(`https://outlap.test/api/game/leaderboard?${qs}`);
  it("публічна відповідь кешується CDN і не містить службового: лише місце, нік, час, дата", async () => {
    rest.getBoard.mockResolvedValue({ ok: true, rows: [{ place: 1, player: "Max", ticks: 3500, jump: false, at: "2026-11-21T10:00:00Z" }], total: 1 });
    const res = await getBoardRoute(get("track=port"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=30, stale-while-revalidate=120");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ track: "port", rows: [{ place: 1, player: "Max", ticks: 3500, jump: false, at: "2026-11-21T10:00:00Z" }], total: 1 });
    expect(text).not.toMatch(/user|email|inputs/);
    expect(rest.getBoard).toHaveBeenCalledWith(expect.objectContaining({ url: CFG.url }), "port");
    expect(session.currentPlayer).not.toHaveBeenCalled();
  });
  it("невідома траса — 400; збій бази — 503 (без кешу)", async () => {
    expect((await getBoardRoute(get("track=monza"))).status).toBe(400);
    expect((await getBoardRoute(get(""))).status).toBe(400);
    rest.getBoard.mockResolvedValue({ ok: false });
    const res = await getBoardRoute(get("track=lyman"));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
