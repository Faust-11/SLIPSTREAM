import { describe, expect, it } from "vitest";
import { getStory, getStorySlugs } from "@/lib/stories/content";
import { parseStory, type Inline } from "@/lib/stories/markdown";
import { matches, norm, type GlossaryItem } from "@/components/newbie/glossary-list";
import { holdMs } from "@/components/newbie/start-lights";
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

describe("розмітка й пошук", () => {
  it("ручна мітка всередині жирного й курсиву — термін, не сирий текст (рев'ю PR #42)", () => {
    const b = parseStory("**Жирний [[t:pole|поул]]** і *курсив [[t:compound|склад]]*")[0]!;
    expect(b.type === "p" && termsOf(b.c)).toEqual(["pole:поул", "compound:склад"]);
  });

  it("«=pole» — з урахуванням регістру: «the Pole» (національність) не позначається; «стюардеса» — не термін", () => {
    expect(firstMatch("Kubica, the Pole, was third", termMatchers("en"), new Set())).toBeNull();
    expect(firstMatch("he took pole", termMatchers("en"), new Set())).toMatchObject({ id: "pole" });
    expect(firstMatch("Стюардеса принесла каву", termMatchers("uk"), new Set())).toBeNull();
  });

  it("пошук словника: регістр, лапки, апострофи; порожній запит — усе", () => {
    const items: GlossaryItem[] = [
      { id: "a", term: "М'які", orig: null, def: "", k: norm("М’які soft") },
      { id: "b", term: "«Box, box»", orig: null, def: "", k: norm("«Box, box» бокси") },
    ];
    expect(matches(items, "м'які").map((x) => x.id)).toEqual(["a"]);
    expect(matches(items, "BOX, BOX").map((x) => x.id)).toEqual(["b"]);
    expect(matches(items, "  ")).toHaveLength(2);
  });

  it("гра «Старт»: пауза до згасання — 0,2–3 с", () => {
    expect(holdMs(0)).toBe(200);
    expect(holdMs(1)).toBe(3000);
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

  // Було: знімок знахідок по кожній історії (перегляд людиною, рішення 15.11). Знімок прив'язаний до тексту й адрес історій,
  // тож будь-яка правка з адмінки (новий термін у абзаці, нова історія, зміна адреси) робила CI червоним, і PR не зливався
  // сам (замір 20.11: дописати «Стюарди ухвалили рішення. Поул» у how-f1-began/uk.md → «Snapshot mismatched»). Тепер перевіряємо
  // властивість, а не вміст: усе, що позначає авто-пошук, є у словнику, і пошук щось знаходить.
  it("автоматичні знахідки в історіях — лише терміни зі словника", () => {
    let total = 0;
    for (const slug of getStorySlugs().sort())
      for (const locale of ["uk", "en"] as const) {
        const s = getStory(slug, locale)!;
        const found = s.blocks.flatMap((b) =>
          b.type === "p" ? termsOf(b.c) : b.type === "tldr" ? b.items.flatMap(termsOf) : b.type === "timeline" ? b.items.flatMap((it) => termsOf(it.c)) : [],
        );
        for (const f of found) expect(getTerm(f.split(":")[0]!, locale), `${slug}/${locale}: ${f}`).not.toBeNull();
        total += found.length;
      }
    expect(total).toBeGreaterThan(0);
  });
});
