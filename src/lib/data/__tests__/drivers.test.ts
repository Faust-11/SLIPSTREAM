import { describe, expect, it, vi } from "vitest";
import { getDriversCredits, getDriversIndex } from "../drivers";

vi.mock("@/lib/data/db", () => import("@/lib/data/__tests__/db-fixture"));

describe("getDriversIndex", () => {
  it("790 пілотів зі стартом, 36 чемпіонів, 116 переможців гонок (макет: 795/36/116; правило стартів — як у командах)", async () => {
    const rows = await getDriversIndex("uk");
    expect(rows).toHaveLength(790);
    expect(rows.filter((r) => r.titles > 0)).toHaveLength(36);
    expect(rows.filter((r) => r.wins > 0)).toHaveLength(116);
  });

  it("імена українською для всіх (кураторські → Wikidata → транслітерація); англійською — латиниця", async () => {
    const uk = await getDriversIndex("uk");
    expect(uk.filter((r) => !/[а-яіїєґ]/i.test(r.name)).map((r) => r.id)).toEqual([]);
    expect(uk.find((r) => r.id === "senna")!.name).toBe("Айртон Сенна");
    const en = await getDriversIndex("en");
    expect(en.find((r) => r.id === "senna")!.name).toBe("Ayrton Senna");
  });

  it("Сенна: 161 старт, 41 перемога, 3 титули, основна команда McLaren; пошук — обома мовами", async () => {
    const s = (await getDriversIndex("uk")).find((r) => r.id === "senna")!;
    expect([s.starts, s.wins, s.titles, s.team]).toEqual([161, 41, 3, "McLaren"]);
    expect(s.search).toContain("сенна");
    expect(s.search).toContain("senna");
  });

  it("поточний сезон: ≥ 20 пілотів з командою й кольором; місця без повторів", async () => {
    const cur = (await getDriversIndex("en")).filter((r) => r.current);
    expect(cur.length).toBeGreaterThanOrEqual(20);
    const pos = cur.map((r) => r.current!.position).filter((p) => p !== null);
    expect(new Set(pos).size).toBe(pos.length);
    expect(cur.every((r) => r.current!.team && /^#[0-9a-f]{6}$/i.test(r.current!.color))).toBe(true);
  });

  it("портрети — лише з атрибуцією; кожен файл існує", async () => {
    const { existsSync } = await import("node:fs");
    const rows = await getDriversIndex("en");
    const credits = await getDriversCredits();
    expect(rows.filter((r) => r.avatar).length).toBe(credits.length);
    for (const r of rows.filter((x) => x.avatar)) expect(existsSync(`public${r.avatar}`), r.avatar!).toBe(true);
    expect(credits.every((c) => c.page.startsWith("https://commons.wikimedia.org/") && c.author && c.license)).toBe(true);
  });
});
