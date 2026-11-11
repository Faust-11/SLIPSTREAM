import { describe, expect, it } from "vitest";
import { fill } from "../fill";

describe("fill", () => {
  it("підставляє значення, невідоме лишає", () => {
    expect(fill("Показати ще {n} · лишилось {left}", { n: 24, left: 116 })).toBe("Показати ще 24 · лишилось 116");
    expect(fill("{year} · P{pos}", { year: 2026, pos: 1 })).toBe("2026 · P1");
    expect(fill("{x} і {y}", { x: 1 })).toBe("1 і {y}");
  });
});
