import { describe, expect, it } from "vitest";
import { securityTxt } from "../security-txt";

describe("security.txt", () => {
  const now = new Date("2026-11-20T12:00:00.000Z");

  it("без контактної адреси — null (не вигадуємо)", () => {
    expect(securityTxt(null, "https://outlap.org", now)).toBeNull();
  });

  it("Contact, Expires (+180 днів, UTC без мілісекунд), мови й Canonical", () => {
    const t = securityTxt("hello@outlap.org", "https://outlap.org", now)!;
    expect(t).toBe(
      [
        "Contact: mailto:hello@outlap.org",
        "Expires: 2027-05-19T12:00:00Z",
        "Preferred-Languages: uk, en",
        "Canonical: https://outlap.org/.well-known/security.txt",
        "",
      ].join("\n"),
    );
  });

  it("Expires не далі року (вимога RFC 9116)", () => {
    const t = securityTxt("a@b.org", "https://outlap.org", now)!;
    const exp = new Date(/Expires: (\S+)/.exec(t)![1]!).getTime();
    expect(exp - now.getTime()).toBeLessThan(365 * 86_400_000);
  });
});
