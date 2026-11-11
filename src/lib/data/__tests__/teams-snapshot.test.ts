import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { teamsSnapshot as data } from "../teams";
const publicFile = (src: string) => join(process.cwd(), "public", src);

// Вільні ліцензії, що реально трапляються в даних (замір 11.11). Нове значення — лише свідомим доповненням.
const FREE_LICENSES = new Set([
  "CC0",
  "Public domain",
  "CC BY 2.0",
  "CC BY 2.5",
  "CC BY 3.0",
  "CC BY 4.0",
  "CC BY-SA 2.0",
  "CC BY-SA 2.0 de",
  "CC BY-SA 2.5",
  "CC BY-SA 3.0",
  "CC BY-SA 3.0 de",
  "CC BY-SA 4.0",
  "OGL 3",
]);

describe("знімок команд", () => {
  it("дата знімка — ISO-дата останньої гонки", () => {
    expect(data.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("164 команди з унікальними id-слагами", () => {
    expect(data.teams).toHaveLength(164);
    const ids = data.teams.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("127 команд з фото; кожен файл існує, ліцензія вільна, автор — ім'я, а не URL чи «Unknown»", () => {
    const withPhoto = data.teams.filter((t) => t.photo);
    expect(withPhoto).toHaveLength(127);
    for (const t of withPhoto) {
      const p = t.photo!;
      // Готові WebP (без оптимізації на сервері при кожному запиті — LCP, ліміт Vercel).
      expect(p.src, t.id).toBe(`/img/cars/${t.id}-480.webp`);
      expect(p.srcSet, t.id).toBe(`/img/cars/${t.id}-256.webp 256w, /img/cars/${t.id}-480.webp 480w`);
      for (const f of [`/img/cars/${t.id}-256.webp`, p.src]) expect(existsSync(publicFile(f)), f).toBe(true);
      expect([p.width, p.height]).toEqual([480, 300]);
      expect(FREE_LICENSES.has(p.credit.license), `${t.id}: ${p.credit.license}`).toBe(true);
      expect(p.credit.author.trim(), t.id).not.toBe("");
      expect(p.credit.author, t.id).not.toMatch(/^Unknown$|https?:|^Original:|original uploader/i);
      expect(p.credit.page, t.id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
  });

  it("11 команд сезону 2026: позиції 1..11, кольори, по 2 пілоти (22 разом)", () => {
    const current = data.teams.filter((t) => t.current);
    expect(current).toHaveLength(11);
    expect(current.map((t) => t.current!.position).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const drivers = current.flatMap((t) => t.current!.drivers);
    expect(drivers).toHaveLength(22);
    expect(new Set(drivers.map((d) => d.id)).size).toBe(22);
    for (const t of current) {
      expect(t.current!.color, t.id).toMatch(/^#[0-9A-F]{6}$/i);
      expect(t.current!.drivers, t.id).toHaveLength(2);
    }
  });

  it("пілоти: імена обома мовами, ініціали, аватар існує й має атрибуцію з вільною ліцензією", () => {
    for (const d of data.teams.flatMap((t) => t.current?.drivers ?? [])) {
      expect(d.name.en.trim(), d.id).not.toBe("");
      expect(d.name.uk, d.id).toMatch(/[А-ЯҐЄІЇа-яґєії]/);
      expect(d.name.en.endsWith(d.surname.en), d.id).toBe(true);
      expect(d.name.uk.endsWith(d.surname.uk), d.id).toBe(true);
      expect(d.initials, d.id).toMatch(/^\p{Lu}{1,2}$/u);
      if (d.avatar) {
        expect(d.avatar).toBe(`/img/drivers/${d.id}-96.webp`);
        expect(existsSync(publicFile(d.avatar)), d.avatar).toBe(true);
        const credit = data.avatarCredits[d.id];
        expect(credit, d.id).toBeDefined();
        expect(FREE_LICENSES.has(credit!.license), `${d.id}: ${credit!.license}`).toBe(true);
        expect(credit!.author.trim(), d.id).not.toBe("");
        expect(credit!.author, d.id).not.toMatch(/^Unknown$|https?:|^Original:|original uploader/i);
        expect(credit!.page, d.id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      }
    }
  });

  it("атрибуція аватарів — лише для показаних пілотів", () => {
    const shown = new Set(data.teams.flatMap((t) => t.current?.drivers ?? []).filter((d) => d.avatar).map((d) => d.id));
    expect(new Set(Object.keys(data.avatarCredits))).toEqual(shown);
  });

  it("сезони: діапазони в межах 1950–2026, відсортовані, без перетинів і без суміжних", () => {
    for (const t of data.teams) {
      expect(t.seasons.length, t.id).toBeGreaterThan(0);
      let prevEnd = 1948;
      for (const [a, b] of t.seasons) {
        expect(a, t.id).toBeGreaterThanOrEqual(1950);
        expect(b, t.id).toBeLessThanOrEqual(2026);
        expect(a, t.id).toBeLessThanOrEqual(b);
        expect(a, `${t.id}: ${a} після ${prevEnd}`).toBeGreaterThan(prevEnd + 1);
        prevEnd = b;
      }
    }
  });

  it("лічильники цілі й узгоджені: перемоги ≤ Гран-прі, Кубки лише з 1958", () => {
    for (const t of data.teams) {
      for (const n of [t.grandsPrix, t.wins, t.titles]) expect(Number.isInteger(n) && n >= 0, t.id).toBe(true);
      expect(t.wins, t.id).toBeLessThanOrEqual(t.grandsPrix);
      if (t.titles > 0) expect(t.seasons.at(-1)![1], t.id).toBeGreaterThanOrEqual(1958);
    }
    expect(data.teams.filter((t) => t.titles > 0)).toHaveLength(15);
    expect(data.teams.filter((t) => t.wins > 0)).toHaveLength(38);
  });

  it("хибні фото (рев'ю 11.11) виключено: Dallara, Theodore, Politoys, BRP — без фото", () => {
    for (const id of ["dallara", "theodore", "politoys", "brp"]) expect(data.teams.find((t) => t.id === id)?.photo, id).toBeNull();
  });

  it("еталонні числа (звірка з дампом/API Jolpica, docs/audits/phase3a-data.md)", () => {
    const pick = (id: string) => {
      const t = data.teams.find((x) => x.id === id)!;
      return [t.grandsPrix, t.wins, t.titles];
    };
    // Перемоги — за гонками (спільні машини 1950-х — одна перемога); Гран-прі — лише зі стартом.
    expect(pick("ferrari")).toEqual([1143, 250, 16]);
    expect(pick("alfa-romeo")).toEqual([216, 10, 0]);
    expect(pick("vanwall")).toEqual([28, 9, 1]);
    expect(pick("tyrrell")).toEqual([430, 23, 1]);
    expect(pick("brm")).toEqual([197, 17, 1]);
    expect(pick("andrea-moda")).toEqual([1, 0, 0]);
    expect(pick("mercedes")).toEqual([361, 143, 9]);
    expect(pick("red-bull")).toEqual([437, 133, 6]);
  });

  it("пілоти 2026 — у порядку заліку пілотів (як у макеті)", () => {
    const crew = (id: string) => data.teams.find((t) => t.id === id)!.current!.drivers.map((d) => d.id);
    expect(crew("ferrari")).toEqual(["hamilton", "leclerc"]);
    expect(crew("mercedes")).toEqual(["antonelli", "russell"]);
    expect(crew("mclaren")).toEqual(["norris", "piastri"]);
  });

  it("refs: кожна команда має конструктори Jolpica, злиття видно (McLaren-Ford → McLaren)", () => {
    for (const t of data.teams) expect(t.refs.length, t.id).toBeGreaterThan(0);
    expect(data.teams.find((t) => t.id === "mclaren")!.refs).toContain("mclaren-ford");
  });

  it("країна обома мовами", () => {
    for (const t of data.teams) {
      expect(t.country.en.trim(), t.id).not.toBe("");
      expect(t.country.uk, t.id).toMatch(/[А-ЯҐЄІЇа-яґєії]/);
      expect(t.countryCode, t.id).toMatch(/^[A-Z]{3}$/);
    }
  });
});
