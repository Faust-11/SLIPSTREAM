import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ currentPlayer: vi.fn(), clearPlaySession: vi.fn(), getProfile: vi.fn() }));
vi.mock("@/lib/play/session", () => ({ currentPlayer: m.currentPlayer, clearPlaySession: m.clearPlaySession }));
vi.mock("@/lib/play/rest", () => ({ getProfile: m.getProfile }));

const { GET } = await import("@/app/api/session/route");
const cfg = { url: "https://p.supabase.test", key: "k", issuer: "i", jwks: "j" };

beforeEach(() => {
  m.currentPlayer.mockReset();
  m.clearPlaySession.mockReset();
  m.getProfile.mockReset();
});

describe("GET /api/session: позначка outlap_in (/code-review high)", () => {
  it("сесії немає й це не збій — позначку знімаємо (клієнт перестає питати /api/session кожну сторінку до 30 діб)", async () => {
    m.currentPlayer.mockResolvedValue({ cfg, user: null, unavailable: false });
    const res = await GET();
    expect(await res.json()).toEqual({ user: null, unavailable: false });
    expect(m.clearPlaySession).toHaveBeenCalledTimes(1);
  });
  it("збій (unavailable) — нічого не знімаємо", async () => {
    m.currentPlayer.mockResolvedValue({ cfg, user: null, unavailable: true });
    await GET();
    expect(m.clearPlaySession).not.toHaveBeenCalled();
  });
  it("гравець є — нічого не знімаємо; вимкнений вхід (503) — теж", async () => {
    m.currentPlayer.mockResolvedValue({ cfg, user: { userId: "u", accessToken: "a" }, unavailable: false });
    m.getProfile.mockResolvedValue({ ok: true, profile: { nick: "Max", publicName: "Max" } });
    expect(await (await GET()).json()).toEqual({ user: { nick: "Max", profile: true }, unavailable: false });
    m.currentPlayer.mockResolvedValue(null);
    expect((await GET()).status).toBe(503);
    expect(m.clearPlaySession).not.toHaveBeenCalled();
  });
});
