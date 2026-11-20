import { describe, expect, it } from "vitest";
import { isValidCode, isValidEmail, normalizeEmail, safeNext } from "../validate";

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
