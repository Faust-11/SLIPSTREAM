import { describe, expect, it } from "vitest";
import { NAV, SECTION_HERO, activeNavKey, barePathFromSegments } from "../nav";

describe("NAV", () => {
  it("9 розділів у порядку меню, Гра — жовта", () => {
    expect(NAV.map((i) => i.key)).toEqual([
      "seasons", "calendar", "news", "drivers", "teams", "circuits", "stories", "newbie", "game",
    ]);
    expect(NAV.filter((i) => i.accent === "yellow").map((i) => i.key)).toEqual(["game"]);
  });

  it("кольори першого екрана з плану", () => {
    expect(SECTION_HERO).toEqual({
      stories: "#E8002D", game: "#FF8000", newbie: "#27D9C2", calendar: "#1868DB", news: "#1E8A63",
    });
  });

  it("activeNavKey: перший сегмент, без route groups і вкладених сторінок", () => {
    expect(activeNavKey([])).toBeNull();
    expect(activeNavKey(["teams"])).toBe("teams");
    expect(activeNavKey(["drivers", "norris"])).toBe("drivers");
    expect(activeNavKey(["(content)", "stories"])).toBe("stories");
    expect(activeNavKey(["nope"])).toBeNull();
  });
});

describe("barePathFromSegments", () => {
  it("корінь і прості шляхи", () => {
    expect(barePathFromSegments([])).toBe("/");
    expect(barePathFromSegments(["teams"])).toBe("/teams");
  });

  it("не перекодовує вже закодовані сегменти й catch-all", () => {
    expect(barePathFromSegments(["drivers", "p%C3%A9rez"])).toBe("/drivers/p%C3%A9rez");
    expect(barePathFromSegments(["drivers", "a%20b"])).toBe("/drivers/a%20b");
    expect(barePathFromSegments(["stories", "2021/abu-dhabi"])).toBe("/stories/2021/abu-dhabi");
  });

  it("пропускає route groups", () => {
    expect(barePathFromSegments(["(content)", "stories"])).toBe("/stories");
  });
});
