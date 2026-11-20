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

  it("скелет: регістр, роздільники й схожа кирилиця дають один нік (підміна неможлива)", () => {
    const same = (...names: string[]) => expect(new Set(names.map(nickSkeleton)).size).toBe(1);
    same("Admin", "Аdmin", "аdmin", "ADMIN", "Ad_min", "Ad min", "A.d-m i n");
    same("Pavel", "Рavel", "pаvel");
    same("Борис", "борис", "БОРИС");
    same("Сергій", "Cергій");
    same("Max", "Мах"); // кириличні М, а, х
    expect(nickSkeleton("Max")).not.toBe(nickSkeleton("Maxx"));
    expect(nickSkeleton("Борис")).not.toBe(nickSkeleton("Boris")); // б, и — без латинських двійників: різні
  });

  it("«Гравець …» зарезервовано за скелетом: і з латинськими двійниками, і з регістром", () => {
    for (const bad of ["Гравець 1A2B", "гравець x", "Гpавець", "ГРАВЕЦЬ", "Гравецьx"]) expect(nickProblem(bad), bad).toBe("reserved");
  });
});
