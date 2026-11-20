import { afterEach, describe, expect, it, vi } from "vitest";
import { playConfig } from "../config";
import { getDeadline, getMyPredictions, getRevealed, savePrediction } from "../predictions-rest";

const cfg = playConfig({ SUPABASE_URL: "https://p.supabase.test", SUPABASE_ANON_KEY: "sb_publishable_x" })!;
const reply = (status: number, body?: unknown) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
const headers = (spy: ReturnType<typeof reply>, i = 0) => spy.mock.calls[i]![1]!.headers as Record<string, string>;
afterEach(() => vi.restoreAllMocks());

const picks = [1, 2, 3, null, null, null, null, null, null, null];
const input = { year: 2026, round: 22, kind: "R", picks, dnfTeam: 191, allFinish: false } as const;

describe("save_prediction", () => {
  it("rpc від імені гравця: Bearer, Content-Profile play, параметри p_*; user_id у тілі немає", async () => {
    const spy = reply(204);
    expect(await savePrediction(cfg, "TOKEN", input)).toEqual({ ok: true });
    expect(spy.mock.calls[0]![0]).toBe("https://p.supabase.test/rest/v1/rpc/save_prediction");
    expect(headers(spy).authorization).toBe("Bearer TOKEN");
    expect(headers(spy)["content-profile"]).toBe("play");
    const body = JSON.parse(String(spy.mock.calls[0]![1]!.body));
    expect(body).toEqual({ p_year: 2026, p_round: 22, p_kind: "R", p_picks: picks, p_dnf_team: 191, p_all_finish: false });
    expect(Object.keys(body).some((k) => /user|email/i.test(k))).toBe(false);
  });
  it("коди бази → причини", async () => {
    const cases: [number, object, string][] = [
      [400, { code: "P0001", message: "prediction_closed", hint: "дедлайн вікенду: 2026-11-28 17:55:00+00" }, "closed"],
      [400, { code: "P0001", message: "no_profile" }, "no_profile"],
      [400, { code: "P0001", message: "blocked" }, "blocked"],
      [400, { code: "P0001", message: "bad_picks" }, "invalid"],
      [400, { code: "P0001", message: "unknown_driver" }, "invalid"],
      [400, { code: "P0001", message: "unknown_team" }, "invalid"],
      [400, { code: "P0001", message: "unknown_round" }, "invalid"],
      [409, { code: "23505" }, "invalid"],
      [400, { code: "23514" }, "invalid"],
      [400, { code: "28000", message: "not_authenticated" }, "unauthorized"],
      [401, { code: "PGRST301" }, "unauthorized"],
      [403, {}, "unauthorized"],
      [400, { code: "P0001", message: "something_new" }, "unavailable"],
      [500, { code: "XX000" }, "unavailable"],
      [406, { code: "PGRST106" }, "unavailable"], // схему play не відкрито в Exposed schemas
    ];
    for (const [status, body, reason] of cases) {
      reply(status, body);
      expect(await savePrediction(cfg, "T", input), `${status} ${JSON.stringify(body)}`).toEqual({ ok: false, reason });
    }
  });
  it("збій мережі — unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ENOTFOUND"));
    expect(await savePrediction(cfg, "T", input)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("deadline", () => {
  it("без токена: лише apikey; рядок → ISO; null → null", async () => {
    const spy = reply(200, "2026-11-28T17:55:00+00:00");
    expect(await getDeadline(cfg, 2026, 22)).toEqual({ ok: true, deadline: "2026-11-28T17:55:00.000Z" });
    expect(headers(spy).authorization).toBeUndefined();
    expect(headers(spy).apikey).toBe("sb_publishable_x");
    expect(JSON.parse(String(spy.mock.calls[0]![1]!.body))).toEqual({ p_year: 2026, p_round: 22 });
    reply(200, null);
    expect(await getDeadline(cfg, 2026, 22)).toEqual({ ok: true, deadline: null });
  });
  it("сміття й помилки — ok:false", async () => {
    reply(200, "не дата");
    expect(await getDeadline(cfg, 2026, 22)).toEqual({ ok: false });
    reply(200, { a: 1 });
    expect(await getDeadline(cfg, 2026, 22)).toEqual({ ok: false });
    reply(500, {});
    expect(await getDeadline(cfg, 2026, 22)).toEqual({ ok: false });
  });
});

describe("мої прогнози", () => {
  it("Accept-Profile play, Bearer гравця, фільтр за етапом; кривий рядок пропускається", async () => {
    const spy = reply(200, [
      { kind: "Q", picks, dnf_team_id: null, all_finish: false, updated_at: "2026-11-20T10:00:00+00:00" },
      { kind: "R", picks, dnf_team_id: 191, all_finish: false, updated_at: null },
      { kind: "S", picks, dnf_team_id: null, all_finish: false },
      { kind: "R", picks: [1, 2], dnf_team_id: null, all_finish: false },
    ]);
    const res = await getMyPredictions(cfg, "TOKEN", 2026, 22);
    expect(res).toEqual({
      ok: true,
      rows: [
        { kind: "Q", picks, dnfTeam: null, allFinish: false, updatedAt: "2026-11-20T10:00:00+00:00" },
        { kind: "R", picks, dnfTeam: 191, allFinish: false, updatedAt: null },
      ],
    });
    expect(String(spy.mock.calls[0]![0])).toContain("season_year=eq.2026&round=eq.22");
    expect(headers(spy)["accept-profile"]).toBe("play");
    expect(headers(spy).authorization).toBe("Bearer TOKEN");
  });
  it("помилка бази — ok:false", async () => {
    reply(401, {});
    expect(await getMyPredictions(cfg, "T", 2026, 22)).toEqual({ ok: false });
  });
});

describe("прогнози всіх (публічне подання)", () => {
  it("без токена; впорядкування й ліміт; без user_id", async () => {
    const spy = reply(200, [
      { kind: "R", player: "Max", picks, dnf_team_id: null, all_finish: true, points: 21 },
      { kind: "Q", player: "Гравець AB12", picks, dnf_team_id: null, all_finish: false, points: null },
      { kind: "Q", player: 5, picks, dnf_team_id: null, all_finish: false, points: null },
    ]);
    const res = await getRevealed(cfg, 2026, 22);
    expect(res).toEqual({
      ok: true,
      rows: [
        { kind: "R", player: "Max", picks, dnfTeam: null, allFinish: true, points: 21 },
        { kind: "Q", player: "Гравець AB12", picks, dnfTeam: null, allFinish: false, points: null },
      ],
    });
    const url = String(spy.mock.calls[0]![0]);
    expect(url).toContain("revealed_predictions?select=kind,player,picks,dnf_team_id,all_finish,points");
    expect(url).toContain("order=points.desc.nullslast,player.asc&limit=200");
    expect(url).not.toMatch(/user_id|email/);
    expect(headers(spy).authorization).toBeUndefined();
  });
});
