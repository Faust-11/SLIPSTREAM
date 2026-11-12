import { describe, expect, it } from "vitest";
import driverNames from "@/data/curated/driver-names.json";
import teamFacts from "@/data/curated/team-facts.json";
import teamNotes from "@/data/curated/team-notes.json";
import teams from "@/data/curated/teams.json";

type Src = { url: string; quote?: string };
type Manual = {
  founders?: { en: string; uk: string }[];
  foundersSources?: Src[];
  base?: { city: { en: string; uk: string } | null; country: { en: string; uk: string }; years: string | null }[];
  baseSources?: Src[];
  checked?: boolean;
};
const facts = (teamFacts as unknown as { teams: Record<string, { manual?: Manual }> }).teams;
const ids = (teams as { teams: { id: string }[] }).teams.map((t) => t.id);

describe("кураторські факти команд (team-facts.json)", () => {
  it("запис для кожної команди і жодних зайвих", () => {
    expect(Object.keys(facts).sort()).toEqual([...ids].sort());
  });

  it("кожен ручний факт має джерело з https-посиланням і обидві мови", () => {
    const bad: string[] = [];
    for (const [id, f] of Object.entries(facts)) {
      const m = f.manual;
      if (!m) continue;
      if (m.founders && !(m.foundersSources ?? []).every((s) => s.url.startsWith("https://")))
        bad.push(`${id}: засновник без джерела`);
      if (m.founders && !(m.foundersSources ?? []).length) bad.push(`${id}: засновник без джерела`);
      if (m.base && !(m.baseSources ?? []).length) bad.push(`${id}: база без джерела`);
      for (const p of m.founders ?? []) if (!p.en || !p.uk) bad.push(`${id}: засновник без мови`);
      for (const b of m.base ?? []) if (!b.country.en || !b.country.uk || (b.city && (!b.city.en || !b.city.uk))) bad.push(`${id}: база без мови`);
    }
    expect(bad).toEqual([]);
  });
});

describe("редакційні тексти (team-notes.json)", () => {
  it("кожен текст — UK і EN, рік, ≥ 1 джерело; лише відомі команди", () => {
    const notes = (teamNotes as unknown as { notes: Record<string, { year: number; text: { uk: string; en: string }; sources: Src[] }[]> }).notes;
    const bad: string[] = [];
    for (const [id, list] of Object.entries(notes)) {
      if (!ids.includes(id)) bad.push(`${id}: невідома команда`);
      for (const n of list) {
        if (!n.text.uk || !n.text.en) bad.push(`${id} ${n.year}: без мови`);
        if (!(n.sources.length > 0 && n.sources.every((s) => s.url.startsWith("https://")))) bad.push(`${id} ${n.year}: без джерела`);
        if (n.year < 1950 || n.year > 2100) bad.push(`${id}: рік ${n.year}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("імена пілотів українською (driver-names.json)", () => {
  it("кожен запис — EN і UK; ручні — з позначкою джерела", () => {
    const d = (driverNames as unknown as { drivers: Record<string, { en: string; uk: string; manual?: { uk: string; source: string } }> }).drivers;
    const bad = Object.entries(d).filter(([, v]) => !v.en || !v.uk || (v.manual && (!v.manual.uk || !v.manual.source)));
    expect(bad).toEqual([]);
  });
});
