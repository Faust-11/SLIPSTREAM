// @vitest-environment node
import { describe, expect, it } from "vitest";
import { commonsFile, downloadThumb, plainText, searchCommons } from "../commons";
import fixture from "./commons-hawthorn.fixture.json";

// Справжня відповідь Commons API (17.11, «Mike Hawthorn», 5 файлів) — мініатюри з thumb.wikimedia.org і upload.wikimedia.org.
const fromFixture = (async () => new Response(JSON.stringify(fixture), { status: 200 })) as unknown as typeof fetch;

describe("searchCommons — на справжній відповіді API", () => {
  it("усі 5 файлів, у порядку пошуку, з автором без HTML і вердиктом ліцензії", async () => {
    const res = await searchCommons("Mike Hawthorn", fromFixture);
    expect(res.map((c) => c.title.slice(0, 26))).toEqual([
      "Mike Hawthorn 1958 Argenti",
      "Mike Hawthorn, autocoureur",
      "Scuderia Ferrari - Monza, ",
      "Mike Hawthorn Grave Farnha",
      "1958-06-29 500 Miglia Monz",
    ]);
    expect(res.every((c) => !/[<>]/.test(c.author))).toBe(true);
    expect(res.map((c) => c.verdict.level)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(res[1]).toMatchObject({ license: "CC0", author: "Herbert Behrens / Anefo", width: 217, height: 308 });
  });

  it("порожній запит — без мережі", async () => {
    const boom = (async () => {
      throw new Error("мережа");
    }) as unknown as typeof fetch;
    expect(await searchCommons("  ", boom)).toEqual([]);
  });
});

describe("commonsFile і downloadThumb — лише Wikimedia", () => {
  it("назва з недозволеними знаками — без запиту", async () => {
    expect(await commonsFile("x|y.jpg", 1280, fromFixture)).toBeNull();
  });
  it("чужий домен, http і редирект на чужий домен — відмова", async () => {
    await expect(downloadThumb("https://evil.example/x.jpg")).rejects.toThrow("не Commons");
    await expect(downloadThumb("http://upload.wikimedia.org/x.jpg")).rejects.toThrow("не Commons");
    const redirected = (async () => Object.defineProperty(new Response("x"), "url", { value: "https://evil.example/x.jpg" })) as unknown as typeof fetch;
    await expect(downloadThumb("https://thumb.wikimedia.org/x.jpg", redirected)).rejects.toThrow("не Commons");
  });
  it("завеликий файл — відмова", async () => {
    const big = (async () => new Response("x", { headers: { "content-length": "20000000" } })) as unknown as typeof fetch;
    await expect(downloadThumb("https://upload.wikimedia.org/x.jpg", big)).rejects.toThrow("завеликий");
  });
});

describe("plainText", () => {
  it("HTML автора → текст", () => {
    expect(plainText('<bdi><a href="https://www.wikidata.org/wiki/Q1">Ronald &amp; Co</a></bdi>')).toBe("Ronald & Co");
  });
});

describe("downloadThumb — потік без Content-Length обрізається на 15 МБ", () => {
  it("завеликий потік — помилка до читання всього тіла", async () => {
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        sent += 1_000_000;
        c.enqueue(new Uint8Array(1_000_000));
        if (sent > 50_000_000) c.close();
      },
    });
    const chunked = (async () => new Response(stream)) as unknown as typeof fetch;
    await expect(downloadThumb("https://upload.wikimedia.org/x.jpg", chunked)).rejects.toThrow("завеликий");
    expect(sent).toBeLessThan(20_000_000);
  });
});
