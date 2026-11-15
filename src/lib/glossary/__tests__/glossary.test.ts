import { describe, expect, it } from "vitest";
import { getStory, getStorySlugs } from "@/lib/stories/content";
import { parseStory, type Inline } from "@/lib/stories/markdown";
import { markTerms } from "../mark";
import { firstMatch, formSource, getTerm, getTerms, termMatchers } from "../terms";

const termsOf = (c: Inline[]): string[] => c.flatMap((x) => (x.t === "term" ? [`${x.id}:${x.v}`] : x.t === "b" || x.t === "i" ? termsOf(x.c) : []));

describe("словник: дані", () => {
  it("обидві мови мають однаковий набір термінів, сортування за абеткою мови", () => {
    const uk = getTerms("uk");
    const en = getTerms("en");
    expect(uk.length).toBeGreaterThanOrEqual(33);
    expect(new Set(uk.map((t) => t.id))).toEqual(new Set(en.map((t) => t.id)));
    const ukNames = uk.map((t) => t.term.replace(/^[«“"]/, ""));
    expect([...ukNames].sort(new Intl.Collator("uk").compare)).toEqual(ukNames);
  });

  it("оригінал — лише коли відрізняється від назви", () => {
    expect(getTerm("undercut", "uk")).toMatchObject({ term: "Андеркат", orig: "Undercut" });
    expect(getTerm("undercut", "en")).toMatchObject({ term: "Undercut", orig: null });
    expect(getTerm("dnf", "en")).toMatchObject({ term: "DNF", orig: "Did not finish" });
  });
});

describe("словник: пошук у тексті", () => {
  it("форма зі * — закінчення до 5 літер, пробіл — будь-які пробіли", () => {
    expect(new RegExp(`^${formSource("машин* безпеки")}$`, "iu").test("машиною  безпеки")).toBe(true);
    expect(new RegExp(`^${formSource("поул*")}$`, "iu").test("поулами")).toBe(true);
  });

  it("межі слова: «поул» не чіпає «поул-позицію» як окреме слово; абревіатури — з урахуванням регістру", () => {
    const ms = termMatchers("uk");
    expect(firstMatch("взяв поул-позицію", ms, new Set())).toMatchObject({ id: "pole", length: "поул-позицію".length });
    expect(firstMatch("сайт drs-news", ms, new Set())).toBeNull();
    expect(firstMatch("відкрив DRS на прямій", ms, new Set())).toMatchObject({ id: "drs" });
  });

  it("кожен термін — лише перша поява; ручна мітка має пріоритет і не дублюється", () => {
    const blocks = parseStory("Він узяв поул. Потім ще поул.\n\nСклад [[t:compound|C3]] і [[t:compound|C4]].\n\n> Цитата про поул");
    const { blocks: out, used } = markTerms(blocks, termMatchers("uk"));
    const p = out.filter((b) => b.type === "p").map((b) => (b.type === "p" ? termsOf(b.c) : []));
    expect(p).toEqual([["pole:поул"], ["compound:C3"]]);
    expect(used).toEqual(["pole", "compound"]);
    // цитата не чіпається
    expect(out[2]).toEqual(blocks[2]);
  });

  it("використаний довший термін поглинає свій фрагмент (VSC ≠ машина безпеки)", () => {
    const b = parseStory("Віртуальна машина безпеки. Знову віртуальна машина безпеки, потім машина безпеки.");
    const p = markTerms(b, termMatchers("uk")).blocks[0]!;
    expect(p.type === "p" && termsOf(p.c)).toEqual(["vsc:Віртуальна машина безпеки", "safety-car:машина безпеки"]);
  });
});

describe("словник: історії", () => {
  it("кожна позначена підказка має термін у словнику", () => {
    for (const slug of getStorySlugs())
      for (const locale of ["uk", "en"] as const) {
        const s = getStory(slug, locale)!;
        for (const id of Object.keys(s.terms)) expect(getTerm(id, locale), `${slug}/${locale}: ${id}`).not.toBeNull();
      }
  });

  // Знімок автоматичних знахідок (рішення 15.11: «авто + винятки» — список переглядає людина; хибні — у винятки або ручні мітки).
  it("знахідки в 33 історіях (знімок для перегляду)", () => {
    const report: Record<string, string[]> = {};
    for (const slug of getStorySlugs().sort())
      for (const locale of ["uk", "en"] as const) {
        const s = getStory(slug, locale)!;
        const found = s.blocks.flatMap((b) =>
          b.type === "p" ? termsOf(b.c) : b.type === "tldr" ? b.items.flatMap(termsOf) : b.type === "timeline" ? b.items.flatMap((it) => termsOf(it.c)) : [],
        );
        report[`${slug}/${locale}`] = found;
      }
    expect(report).toMatchSnapshot();
  });
});
