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
      [403, {}, "unavailable"], // рев'ю 21.11 (B): 403 від PostgREST (42501: немає grant, схему не відкрито) — збій сервісу, не «сесія закінчилась»
      [403, { code: "42501", message: "permission denied for schema play" }, "unavailable"],
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
  const row = (kind: string, player: string, points: number | null = null) => ({ kind, player, picks, dnf_team_id: null, all_finish: false, points });
  /** Відповідь за адресою: окремі рядки для кожного виду й для «моїх». */
  const byUrl = (handler: (url: string) => unknown[]) =>
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => new Response(JSON.stringify(handler(String(input))), { status: 200 }));

  it("без токена; впорядкування; без user_id; кривий рядок пропускається", async () => {
    const spy = byUrl((url) => (url.includes("kind=eq.Q") ? [row("Q", "Max", 21), { ...row("Q", "x"), player: 5 }] : [row("R", "Гравець AB12")]));
    const res = await getRevealed(cfg, 2026, 22);
    expect(res).toEqual({
      ok: true,
      rows: [
        { kind: "Q", player: "Max", picks, dnfTeam: null, allFinish: false, points: 21 },
        { kind: "R", player: "Гравець AB12", picks, dnfTeam: null, allFinish: false, points: null },
      ],
    });
    for (const [url] of spy.mock.calls) {
      expect(String(url)).toContain("revealed_predictions?select=kind,player,picks,dnf_team_id,all_finish,points");
      expect(String(url)).toContain("order=points.desc.nullslast,player.asc&limit=200");
      expect(String(url)).not.toMatch(/user_id|email/);
    }
    expect((spy.mock.calls[0]![1]!.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("рев'ю 21.11 (C): запит ПО ВИДУ зі своїм лімітом — інакше один limit=200 на Q+R мовчки губить рядки при > 100 гравців", async () => {
    const spy = byUrl((url) => (url.includes("kind=eq.Q") ? [row("Q", "A"), row("Q", "B")] : [row("R", "A")]));
    const res = await getRevealed(cfg, 2026, 22);
    const urls = spy.mock.calls.map(([u]) => String(u));
    expect(urls).toHaveLength(2);
    expect(urls.filter((u) => u.includes("kind=eq.Q") && u.includes("limit=200"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("kind=eq.R") && u.includes("limit=200"))).toHaveLength(1);
    expect(res.ok && res.rows.map((x) => `${x.kind}:${x.player}`)).toEqual(["Q:A", "Q:B", "R:A"]);
  });

  it("рев'ю 21.11 (C): список виду заповнений до ліміту, а мого рядка в ньому немає — доплановуємо власний рядок окремим запитом", async () => {
    const full = Array.from({ length: 200 }, (_, i) => row("Q", `P${String(i).padStart(3, "0")}`));
    const spy = byUrl((url) => {
      if (url.includes("player=eq.")) return [row("Q", "Гравець AB12")];
      return url.includes("kind=eq.Q") ? full : [row("R", "A")];
    });
    const res = await getRevealed(cfg, 2026, 22, "Гравець AB12");
    const urls = spy.mock.calls.map(([u]) => String(u));
    expect(urls).toHaveLength(3);
    const own = urls.find((u) => u.includes("player=eq."))!;
    expect(own).toContain("kind=eq.Q");
    expect(own).toContain(`player=eq.${encodeURIComponent("Гравець AB12")}`);
    expect(own).toContain("limit=1");
    expect(res.ok && res.rows.filter((x) => x.player === "Гравець AB12")).toHaveLength(1);
    expect(res.ok && res.rows).toHaveLength(202);
  });

  it("мій рядок уже є в списку або список не заповнений — додаткового запиту немає", async () => {
    const spy = byUrl((url) => (url.includes("kind=eq.Q") ? [row("Q", "Max")] : []));
    await getRevealed(cfg, 2026, 22, "Max");
    expect(spy).toHaveBeenCalledTimes(2);
    const full = Array.from({ length: 200 }, (_, i) => row("Q", i === 7 ? "Max" : `P${i}`));
    spy.mockClear(); // той самий шпигун: рахуємо виклики другої частини окремо
    byUrl((url) => (url.includes("kind=eq.Q") ? full : []));
    await getRevealed(cfg, 2026, 22, "Max");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("помилка одного з видів — ok:false (не показуємо половину таблиці)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => new Response(JSON.stringify(String(input).includes("kind=eq.R") ? {} : []), { status: String(input).includes("kind=eq.R") ? 500 : 200 }));
    expect(await getRevealed(cfg, 2026, 22)).toEqual({ ok: false });
  });
});
