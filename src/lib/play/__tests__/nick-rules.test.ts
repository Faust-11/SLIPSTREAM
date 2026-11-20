import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nickProblem, nickSkeleton, normalizeNick } from "../validate";

type Row = { input: string; valid: boolean; problem: string | null; skeleton: string };
const fixture = JSON.parse(readFileSync(join(process.cwd(), "scripts/db/fixtures/nick_parity.json"), "utf8")) as Row[];

describe("нік: allowlist + NFKC + скелет (дзеркало play.nick_valid / play.nick_skeleton)", () => {
  it("фікстура паритету зі схемою БД (її ж перевіряє scripts/db/test_play.py): JS дає ті самі відповіді", () => {
    expect(fixture.length).toBeGreaterThan(60);
    for (const r of fixture) {
      const n = r.input.normalize("NFKC");
      expect({ input: r.input, valid: nickProblem(n) === null, skeleton: nickSkeleton(n) }).toEqual({ input: r.input, valid: r.valid, skeleton: r.skeleton });
    }
  });

  it("довжина 3–24 у символах (code points); без комбівних — збігається з графемами", () => {
    expect(nickProblem("ab")).toBe("short");
    expect(nickProblem("abc")).toBeNull();
    expect(nickProblem("a".repeat(24))).toBeNull();
    expect(nickProblem("a".repeat(25))).toBe("long");
    expect(nickProblem("Б".repeat(24))).toBeNull();
    expect(nickProblem("😀😀")).toBe("short"); // 2 символи, а не 4 одиниці UTF-16
    expect(nickProblem("😀😀😀")).toBe("chars");
  });

  it("невидимі символи, RTL/zero-width, комбівні, emoji, інші письма — відмова", () => {
    for (const bad of ["Max​", "​Max", "Ma­x", "Ma‮x", "Ma‎x", "Ma⁠x", "﻿Max", "Ma‍x", "Maéx", "Ma҃x", "Max😀", "Μαξ", "日本語名前", "Räikkönen"]) {
      expect(nickProblem(bad.normalize("NFKC")), JSON.stringify(bad)).not.toBeNull();
    }
  });

  it("NFKC: nbsp, ідеографічний пробіл, повна ширина, лігатури стають звичайними — і приймаються", () => {
    expect(normalizeNick("Max Zed")).toBe("Max Zed");
    expect(normalizeNick("Max　Zed")).toBe("Max Zed");
    expect(normalizeNick("Ｍａｘ１")).toBe("Max1");
    expect(normalizeNick("ﬁsher")).toBe("fisher");
    expect(nickProblem(normalizeNick("Max Zed"))).toBeNull();
  });

  it("структура: роздільники лише всередині, один пробіл, не лише роздільники", () => {
    for (const ok of ["Max V", "Max_V", "Max.V", "Max-V", "a1b", "Лев Толстой"]) expect(nickProblem(ok), ok).toBeNull();
    for (const bad of [" Max", "Max ", "Max  V", "_Max", "Max_", ".Max", "---", "a--", "Max/V", "Max!", "me@mail.test"]) expect(nickProblem(bad), bad).toBe("chars");
  });

  it("ОДИН СКРИПТ: латиниця + кирилиця в літерах — відмова «mixed»; цифри й роздільники — з будь-яким (UTS #39)", () => {
    for (const bad of ["Аdmin", "Max\u0417", "\u041cax", "Ben\u0406", "\u0420avel", "C\u0435rgiy", "Гpавець", "Лев Tolstoy"]) expect(nickProblem(bad), JSON.stringify(bad)).toBe("mixed");
    for (const ok of ["Admin", "Борис", "Борис_2024", "Max3", "Мах3", "Лев 7-11", "x.y.z-1"]) expect(nickProblem(ok), ok).toBeNull();
  });

  it("скелет: регістр, роздільники й повноскриптові кириличні двійники дають один нік", () => {
    const same = (...names: string[]) => expect(new Set(names.map(nickSkeleton)).size).toBe(1);
    same("Admin", "ADMIN", "Ad_min", "Ad min", "A.d-m i n"); // латиниця: регістр і роздільники
    same("Борис", "борис", "БОРИС"); // кирилиця: регістр
    same("Мах", "МАХ", "мах", "Max", "MAX"); // кирилична М, а, х ↔ латинська Max (повноскриптова підміна)
    same("Pxa", "Рха", "РХА");
    // I / l / 1 / і — один символ; O / 0 / о — один
    same("Ben1", "Benl", "BenI", "Beni", "Ben\u0456", "Ben\u0406");
    same("Alex", "AIex", "Aiex");
    same("Alex1", "Alexl", "Alexi", "AIexI");
    same("Oleg", "0leg", "\u041eleg", "\u043eleg");
    same("B0ris", "Boris", "Bor1s", "Borls");
    // цифро- і літеро-подібна кирилиця: з/3, б/6, ч/4, г/r, п/n
    same("Max3", "Мах3", "МахЗ", "махз");
    same("Max6", "Мах6", "Махб");
    same("Max4", "Мах4", "Махч");
    same("Nah", "Пан", "ПАН");
    same("Rex", "Гех");
    expect(nickSkeleton("Max")).not.toBe(nickSkeleton("Maxx"));
    expect(nickSkeleton("Борис")).not.toBe(nickSkeleton("Boris")); // б → 6, и без латинського двійника: різні
  });

  it("кирилиця, яку свідомо НЕ вважаємо двійником латиниці/цифр: д, л, ф, ы, э, ю, я, ж, ц, ш, щ, и, й, ь, ъ", () => {
    const own = ["д", "л", "ф", "ы", "э", "ю", "я", "ж", "ц", "ш", "щ", "и", "й", "ь", "ъ"];
    // скелет кожної — сама ця літера (мала), без латинського відповідника
    for (const c of own) expect(nickSkeleton(c), c).toBe(c);
  });

  it("Ӏ (U+04C0), ӏ (U+04CF), ѡ, ҁ, Ҋ та решта кирилиці поза U+0400–U+045F і Ґ/ґ — відмова; повні пари з таблиці — дозволено", () => {
    for (const bad of ["Ben\u04c0", "Ben\u04cf", "Ben\u0460", "Ben\u0481", "Ben\u048a", "\u04c0ban"]) expect(nickProblem(bad), JSON.stringify(bad)).toBe("chars");
    for (const ok of ["Ґанна", "ґанна", "Їжак", "Єва", "Ёлка", "Ђорђе", "Київ"]) expect(nickProblem(ok), ok).toBeNull();
  });

  it("«Гравець …» зарезервовано за скелетом: і з латинськими двійниками, і з регістром", () => {
    for (const bad of ["Гравець 1234", "гравець 7", "ГРАВЕЦЬ", "Гравець_1", "Гравецький"]) expect(nickProblem(bad), bad).toBe("reserved");
    for (const bad of ["Гравець 1A2B", "гравець x", "Гpавець"]) expect(nickProblem(bad), bad).toBe("mixed"); // змішані — відхилено ще раніше
  });
});
