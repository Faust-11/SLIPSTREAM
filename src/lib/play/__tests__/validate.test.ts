import { describe, expect, it } from "vitest";
import { isValidCode, isValidEmail, nickProblem, normalizeEmail, safeNext } from "../validate";

describe("нік (дзеркало play.profiles_nick_chk)", () => {
  it("3–24 символи; довжина — у символах, а не в UTF-16", () => {
    expect(nickProblem("ab")).toBe("short");
    expect(nickProblem("abc")).toBeNull();
    expect(nickProblem("a".repeat(24))).toBeNull();
    expect(nickProblem("a".repeat(25))).toBe("long");
    expect(nickProblem("😀".repeat(3))).toBeNull(); // 3 символи, 6 одиниць UTF-16
    expect(nickProblem("😀😀")).toBe("short");
  });
  it("без @, керуючих символів, пробілів на краях", () => {
    expect(nickProblem("me@example.com")).toBe("chars");
    expect(nickProblem(" padded")).toBe("chars");
    expect(nickProblem("pad\u0000ded")).toBe("chars");
    expect(nickProblem("Пілот Шумі")).toBeNull();
  });
  it("невидимі символи й «дивні» пробіли — відмова (підміна імені)", () => {
    for (const bad of ["Max\u200b", "Ma\u00adx", "Ma\u202ex", "Max\u00a0Z", "\ufeffMax", "Max\u2003Z", "Ma\u2060x", "Max\u3000Z"]) expect(nickProblem(bad), JSON.stringify(bad)).toBe("chars");
    expect(nickProblem("Max Verstappen")).toBeNull(); // звичайний пробіл всередині — можна
    expect(nickProblem("Ёж-Єнот_7")).toBeNull();
  });
  it("«Гравець …» зарезервовано під приховані ніки", () => {
    expect(nickProblem("Гравець 1A2B")).toBe("reserved");
    expect(nickProblem("гравець x")).toBe("reserved");
    expect(nickProblem("Гравецьx")).toBeNull();
  });
});

describe("пошта й код", () => {
  it("нормалізація й формат", () => {
    expect(normalizeEmail("  Name@Example.COM ")).toBe("name@example.com");
    expect(isValidEmail("a@b.co")).toBe(true);
    for (const bad of ["", "a@b", "a b@c.de", "@b.co", "a@@b.co", "a,b@c.de", `${"a".repeat(250)}@b.co`]) expect(isValidEmail(bad), bad).toBe(false);
  });
  it("код — лише цифри, 6–10", () => {
    expect(isValidCode("12345678")).toBe(true);
    expect(isValidCode("123456")).toBe(true);
    for (const bad of ["", "12345", "12345678901", "1234abcd", "1234 5678", "١٢٣٤٥٦٧٨"]) expect(isValidCode(bad), bad).toBe(false);
  });
});

describe("safeNext — лише відносний шлях цього сайту", () => {
  it("приймає звичайні шляхи", () => {
    expect(safeNext("/uk/predictions")).toBe("/uk/predictions");
    expect(safeNext("/en/profile?a=1")).toBe("/en/profile?a=1");
  });
  it("відкидає зовнішні адреси й обходи", () => {
    for (const bad of [null, undefined, "", "https://evil.test", "//evil.test", "/\\evil.test", "evil.test", "javascript:alert(1)", "/a\nb"]) expect(safeNext(bad), String(bad)).toBeNull();
  });
});
