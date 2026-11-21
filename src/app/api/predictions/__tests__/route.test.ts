import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ currentPlayer: vi.fn() }));
const rest = vi.hoisted(() => ({ getDeadline: vi.fn(), getMyPredictions: vi.fn(), getRevealed: vi.fn(), savePrediction: vi.fn() }));
const profile = vi.hoisted(() => ({ getProfile: vi.fn() }));
vi.mock("@/lib/play/session", () => session);
vi.mock("@/lib/play/predictions-rest", () => rest);
vi.mock("@/lib/play/rest", () => profile);

import { GET, POST } from "../route";

const CFG = { url: "https://p.supabase.test", key: "k", issuer: "i", jwks: "j" };
const picks = [1, 2, 3, null, null, null, null, null, null, null];
const player = { cfg: CFG, user: { userId: "u1", accessToken: "TOK" }, unavailable: false };
const get = (qs = "year=2026&round=22", init: RequestInit = {}) => new Request(`https://outlap.test/api/predictions?${qs}`, init);
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://outlap.test/api/predictions", {
    method: "POST",
    headers: { origin: "https://outlap.test", host: "outlap.test", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const form = { year: 2026, round: 22, kind: "R", picks, dnfTeam: 191, allFinish: false };

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", CFG.url);
  vi.stubEnv("SUPABASE_ANON_KEY", CFG.key);
  Object.values({ ...session, ...rest, ...profile }).forEach((f) => f.mockReset());
  session.currentPlayer.mockResolvedValue({ cfg: CFG, user: null, unavailable: false });
  rest.getDeadline.mockResolvedValue({ ok: true, deadline: new Date(Date.now() + 3600_000).toISOString() });
});

describe("GET — стан етапу", () => {
  it("до дедлайну: чужі прогнози НЕ запитуються; анонім без mine", async () => {
    const res = await GET(get());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ closed: false, signedIn: false, user: null, mine: null, revealed: null, unavailable: false });
    expect(typeof body.now).toBe("number");
    expect(rest.getRevealed).not.toHaveBeenCalled();
    expect(rest.getMyPredictions).not.toHaveBeenCalled();
  });
  it("після дедлайну: чужі прогнози запитуються; невідомий дедлайн = закрито", async () => {
    rest.getDeadline.mockResolvedValue({ ok: true, deadline: new Date(Date.now() - 1000).toISOString() });
    rest.getRevealed.mockResolvedValue({ ok: true, rows: [{ kind: "Q", player: "Max", picks, dnfTeam: null, allFinish: false, points: null }] });
    let body = await (await GET(get())).json();
    expect(body.closed).toBe(true);
    expect(body.revealed).toHaveLength(1);
    rest.getDeadline.mockResolvedValue({ ok: true, deadline: null });
    body = await (await GET(get())).json();
    expect(body).toMatchObject({ closed: true, deadline: null });
  });
  it("рев'ю 21.11 (C/G): після дедлайну getRevealed отримує публічне ім'я гравця (для гарантії його рядка й підсвітки «ви»)", async () => {
    rest.getDeadline.mockResolvedValue({ ok: true, deadline: new Date(Date.now() - 1000).toISOString() });
    rest.getRevealed.mockResolvedValue({ ok: true, rows: [] });
    session.currentPlayer.mockResolvedValue(player);
    profile.getProfile.mockResolvedValue({ ok: true, profile: { nick: "Max", publicName: "Гравець AB12" } });
    rest.getMyPredictions.mockResolvedValue({ ok: true, rows: [] });
    const body = await (await GET(get())).json();
    expect(body.user).toEqual({ nick: "Max", publicName: "Гравець AB12" });
    expect(rest.getRevealed).toHaveBeenCalledWith(expect.objectContaining({ url: CFG.url }), 2026, 22, "Гравець AB12");
    rest.getRevealed.mockClear();
    session.currentPlayer.mockResolvedValue({ cfg: CFG, user: null, unavailable: false });
    await GET(get());
    expect(rest.getRevealed).toHaveBeenCalledWith(expect.anything(), 2026, 22, null);
  });
  it("ввійшов: нік і свої прогнози; email у відповіді немає", async () => {
    session.currentPlayer.mockResolvedValue(player);
    profile.getProfile.mockResolvedValue({ ok: true, profile: { nick: "Max", publicName: "Max" } });
    rest.getMyPredictions.mockResolvedValue({ ok: true, rows: [{ kind: "R", picks, dnfTeam: 191, allFinish: false, updatedAt: "2026-11-20T10:00:00Z" }] });
    const text = await (await GET(get())).text();
    const body = JSON.parse(text);
    expect(body.signedIn).toBe(true);
    expect(body.user).toEqual({ nick: "Max", publicName: "Max" });
    expect(body.mine).toEqual({ Q: null, R: { picks, dnfTeam: 191, allFinish: false, updatedAt: "2026-11-20T10:00:00Z" } });
    expect(rest.getMyPredictions).toHaveBeenCalledWith(expect.objectContaining({ url: CFG.url, key: CFG.key }), "TOK", 2026, 22);
    expect(text).not.toMatch(/email|@|userId|u1/);
  });
  it("профілю ще немає — user.nick = null", async () => {
    session.currentPlayer.mockResolvedValue(player);
    profile.getProfile.mockResolvedValue({ ok: true, profile: null });
    rest.getMyPredictions.mockResolvedValue({ ok: true, rows: [] });
    const body = await (await GET(get())).json();
    expect(body.user).toEqual({ nick: null, publicName: null });
    expect(body.signedIn).toBe(true);
  });
  it("збій бази для своїх даних → unavailable, але дедлайн віддаємо", async () => {
    session.currentPlayer.mockResolvedValue(player);
    profile.getProfile.mockResolvedValue({ ok: false });
    rest.getMyPredictions.mockResolvedValue({ ok: true, rows: [] });
    const body = await (await GET(get())).json();
    // Рев'ю 21.11 (D): вхід лишається «ввійшов» (signedIn), інакше UI пропонує увійти ввійшлому — петля з /login. unknown ≠ «не ввійшов».
    expect(body).toMatchObject({ unavailable: true, signedIn: true, user: null, closed: false });
    expect(body.deadline).toEqual(expect.any(String));
  });
  it("кривий запит — 400; немає налаштувань — 503; дедлайн недоступний — 503", async () => {
    expect((await GET(get("year=2026"))).status).toBe(400);
    expect((await GET(get("year=2026&round=abc"))).status).toBe(400);
    rest.getDeadline.mockResolvedValue({ ok: false });
    expect((await GET(get())).status).toBe(503);
    vi.stubEnv("SUPABASE_URL", "");
    expect((await GET(get())).status).toBe(503);
  });
});

describe("POST — зберегти прогноз", () => {
  it("успіх: токен гравця йде в базу, тіло — лише перевірені поля", async () => {
    session.currentPlayer.mockResolvedValue(player);
    rest.savePrediction.mockResolvedValue({ ok: true });
    const res = await POST(post({ ...form, userId: "someone-else", email: "x@y.z" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, kind: "R" });
    expect(rest.savePrediction).toHaveBeenCalledWith(CFG, "TOK", { year: 2026, round: 22, kind: "R", picks, dnfTeam: 191, allFinish: false });
  });
  it("чужий Origin і відсутній Origin — 403, до бази не доходить", async () => {
    session.currentPlayer.mockResolvedValue(player);
    expect((await POST(post(form, { origin: "https://evil.test" }))).status).toBe(403);
    const noOrigin = new Request("https://outlap.test/api/predictions", { method: "POST", headers: { host: "outlap.test" }, body: JSON.stringify(form) });
    expect((await POST(noOrigin)).status).toBe(403);
    expect(rest.savePrediction).not.toHaveBeenCalled();
  });
  it("некоректне тіло — 400 без звернення до бази", async () => {
    session.currentPlayer.mockResolvedValue(player);
    for (const bad of [{ ...form, picks: [1, 1, 1, null, null, null, null, null, null, null] }, { ...form, kind: "S" }, { ...form, kind: "Q" }, "plain"]) {
      expect((await POST(post(bad))).status, JSON.stringify(bad)).toBe(400);
    }
    expect(rest.savePrediction).not.toHaveBeenCalled();
  });
  it("не ввійшов — 401; вхід недоступний — 503", async () => {
    expect((await POST(post(form))).status).toBe(401);
    session.currentPlayer.mockResolvedValue({ cfg: CFG, user: null, unavailable: true });
    expect((await POST(post(form))).status).toBe(503);
    session.currentPlayer.mockResolvedValue(null);
    expect((await POST(post(form))).status).toBe(503);
  });
  it("відповіді бази → коди HTTP", async () => {
    session.currentPlayer.mockResolvedValue(player);
    const cases: [string, number][] = [["closed", 409], ["no_profile", 403], ["blocked", 403], ["invalid", 400], ["unauthorized", 401], ["unavailable", 503]];
    for (const [reason, status] of cases) {
      rest.savePrediction.mockResolvedValue({ ok: false, reason });
      const res = await POST(post(form));
      expect(res.status, reason).toBe(status);
      expect(await res.json()).toEqual({ error: reason });
    }
  });
});
