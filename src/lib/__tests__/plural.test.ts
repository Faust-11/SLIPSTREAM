import { describe, expect, it } from "vitest";
import { plural } from "../plural";

const UK = { one: "конструктор", few: "конструктори", many: "конструкторів", other: "конструктора" };
const EN = { one: "constructor", other: "constructors" };

describe("plural", () => {
  it("українська: one / few / many за Intl.PluralRules", () => {
    expect(plural(1, "uk", UK)).toBe("конструктор");
    expect(plural(21, "uk", UK)).toBe("конструктор");
    expect(plural(3, "uk", UK)).toBe("конструктори");
    expect(plural(164, "uk", UK)).toBe("конструктори");
    expect(plural(11, "uk", UK)).toBe("конструкторів");
    expect(plural(15, "uk", UK)).toBe("конструкторів");
    expect(plural(0, "uk", UK)).toBe("конструкторів");
  });

  it("англійська: one / other", () => {
    expect(plural(1, "en", EN)).toBe("constructor");
    expect(plural(0, "en", EN)).toBe("constructors");
    expect(plural(164, "en", EN)).toBe("constructors");
  });

  it("немає потрібної форми → other", () => {
    expect(plural(3, "uk", { one: "a", other: "b" })).toBe("b");
  });
});
