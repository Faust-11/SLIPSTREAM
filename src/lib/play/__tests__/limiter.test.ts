import { describe, expect, it } from "vitest";
import { allow, clientKey } from "../limiter";

describe("м'який обмежувач", () => {
  it("пропускає limit разів у вікні, далі відмовляє, у новому вікні — знову дозволяє", () => {
    const k = `t-${Math.random()}`;
    expect([1, 2, 3].map((i) => allow(k, 3, 1000, 1000 + i))).toEqual([true, true, true]);
    expect(allow(k, 3, 1000, 1010)).toBe(false);
    expect(allow(k, 3, 1000, 2500)).toBe(true);
  });
  it("ключі незалежні", () => {
    expect(allow("a1", 1, 1000, 0)).toBe(true);
    expect(allow("b1", 1, 1000, 0)).toBe(true);
    expect(allow("a1", 1, 1000, 1)).toBe(false);
  });
  it("джерело: x-real-ip, інакше перший x-forwarded-for", () => {
    expect(clientKey(new Request("http://x", { headers: { "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" } }))).toBe("1.2.3.4");
    expect(clientKey(new Request("http://x", { headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.1" } }))).toBe("5.6.7.8");
    expect(clientKey(new Request("http://x"))).toBe("unknown");
  });
});
