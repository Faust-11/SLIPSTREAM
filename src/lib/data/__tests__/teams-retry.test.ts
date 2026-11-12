import { afterEach, describe, expect, it, vi } from "vitest";

// Збій першого запиту до бази не має «прилипати» до процесу (next dev, воркер збірки): наступний виклик повторює запит.
describe("кеш запитів до бази", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/data/db");
    vi.resetModules();
  });

  it("невдалий запит не кешується, вдалий — кешується", async () => {
    const fixture = await import("./db-fixture");
    let calls = 0;
    vi.resetModules();
    vi.doMock("@/lib/data/db", () => ({
      dbSelect: async (view: string) => {
        calls++;
        if (calls === 1) throw new Error("База: site_meta → 503");
        return fixture.dbSelect(view);
      },
    }));
    const { getTeamsSeason } = await import("../teams");
    await expect(getTeamsSeason()).rejects.toThrow("503");
    expect(await getTeamsSeason()).toBe(2026);
    expect(await getTeamsSeason()).toBe(2026);
    expect(calls).toBe(2);
  });
});
