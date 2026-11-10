import { describe, expect, it } from "vitest";
import { defaultLocale, isLocale, locales } from "../config";
import { localizedPath, resolveLocaleRoute, stripLocale, switchLocalePath } from "../paths";

describe("config", () => {
  it("має дві мови, EN — основна", () => {
    expect(locales).toEqual(["en", "uk"]);
    expect(defaultLocale).toBe("en");
  });

  it("isLocale розпізнає лише підтримувані мови", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("uk")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale("EN")).toBe(false);
    expect(isLocale("toString")).toBe(false);
  });
});

describe("localizedPath", () => {
  it("корінь", () => {
    expect(localizedPath("/", "uk")).toBe("/uk");
    expect(localizedPath("/", "en")).toBe("/");
  });

  it("вкладені шляхи", () => {
    expect(localizedPath("/teams", "uk")).toBe("/uk/teams");
    expect(localizedPath("/teams", "en")).toBe("/teams");
  });

  it("зберігає query і hash", () => {
    expect(localizedPath("/teams?q=lotus#a", "uk")).toBe("/uk/teams?q=lotus#a");
    expect(localizedPath("/?q=1", "uk")).toBe("/uk?q=1");
  });
});

describe("stripLocale", () => {
  it("знімає префікс мови лише цілим сегментом", () => {
    expect(stripLocale("/uk")).toBe("/");
    expect(stripLocale("/uk/teams")).toBe("/teams");
    expect(stripLocale("/en/teams")).toBe("/teams");
    expect(stripLocale("/ukraine")).toBe("/ukraine");
    expect(stripLocale("/teams")).toBe("/teams");
  });
});

describe("switchLocalePath", () => {
  it("UK → EN зберігає сторінку й параметри", () => {
    expect(switchLocalePath("/uk/teams?q=lotus", "en")).toBe("/teams?q=lotus");
    expect(switchLocalePath("/uk", "en")).toBe("/");
    expect(switchLocalePath("/uk?q=1", "en")).toBe("/?q=1");
  });

  it("EN → UK зберігає сторінку й параметри", () => {
    expect(switchLocalePath("/teams?q=lotus", "uk")).toBe("/uk/teams?q=lotus");
    expect(switchLocalePath("/", "uk")).toBe("/uk");
  });

  it("та сама мова — без змін", () => {
    expect(switchLocalePath("/uk/teams", "uk")).toBe("/uk/teams");
    expect(switchLocalePath("/teams", "en")).toBe("/teams");
  });
});

describe("resolveLocaleRoute (логіка proxy)", () => {
  it("/en і /en/* → постійний редирект без префікса", () => {
    expect(resolveLocaleRoute("/en")).toEqual({ kind: "redirect", pathname: "/" });
    expect(resolveLocaleRoute("/en/teams")).toEqual({ kind: "redirect", pathname: "/teams" });
  });

  it("/uk і /uk/* — без змін", () => {
    expect(resolveLocaleRoute("/uk")).toEqual({ kind: "next", locale: "uk" });
    expect(resolveLocaleRoute("/uk/teams")).toEqual({ kind: "next", locale: "uk" });
  });

  it("решта → внутрішній rewrite на /en", () => {
    expect(resolveLocaleRoute("/")).toEqual({ kind: "rewrite", pathname: "/en", locale: "en" });
    expect(resolveLocaleRoute("/teams")).toEqual({ kind: "rewrite", pathname: "/en/teams", locale: "en" });
    expect(resolveLocaleRoute("/de/teams")).toEqual({ kind: "rewrite", pathname: "/en/de/teams", locale: "en" });
    expect(resolveLocaleRoute("/ukraine")).toEqual({ kind: "rewrite", pathname: "/en/ukraine", locale: "en" });
    expect(resolveLocaleRoute("/english")).toEqual({ kind: "rewrite", pathname: "/en/english", locale: "en" });
  });
});
