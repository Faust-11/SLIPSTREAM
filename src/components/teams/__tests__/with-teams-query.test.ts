import { describe, expect, it } from "vitest";
import { withTeamsQuery } from "../teams-browser";

describe("withTeamsQuery", () => {
  it("сторонні параметри (utm, fbclid) лишаються, наші замінюються", () => {
    expect(withTeamsQuery("?q=old&utm_source=fb&fbclid=abc", { q: "lotus", f: "win", sort: "a" })).toBe(
      "?q=lotus&f=win&sort=a&utm_source=fb&fbclid=abc",
    );
    expect(withTeamsQuery("?utm_source=fb", { q: "", f: "all", sort: "p" })).toBe("?utm_source=fb");
    expect(withTeamsQuery("?q=x&f=ch", { q: "", f: "all", sort: "p" })).toBe("");
  });
});
