// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ARCHIVE_URL_RE, findCopy, normalizeArchiveUrl, savePage } from "../archive";
import { archivedHost, recordArchives } from "../record";

const SNAP = "https://web.archive.org/web/20261120140746/https://www.aljazeera.com/news/x";
const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const fetchOf = (r: Response | Error) => (async () => { if (r instanceof Error) throw r; return r; }) as unknown as typeof fetch;

describe("normalizeArchiveUrl", () => {
  it("http з API піднімаємо до https; чужі адреси відхиляємо", () => {
    expect(normalizeArchiveUrl("http://web.archive.org/web/20260421173102/https://a.example/x")).toBe("https://web.archive.org/web/20260421173102/https://a.example/x");
    expect(normalizeArchiveUrl(SNAP)).toBe(SNAP);
    for (const bad of ["https://evil.example/web/20260421173102/https://a.example/", "https://web.archive.org.evil.example/web/20260421173102/https://a.example/", "javascript:alert(1)", "https://web.archive.org/web/2026/https://a.example/", "https://web.archive.org/save/https://a.example/", null, 5, ""]) {
      expect(normalizeArchiveUrl(bad), String(bad)).toBeNull();
    }
    expect(ARCHIVE_URL_RE.test(SNAP + "\n<script>")).toBe(false);
  });
});

describe("findCopy", () => {
  const found = { archived_snapshots: { closest: { status: "200", available: true, url: "http://web.archive.org/web/20260421173102/https://a.example/x", timestamp: "20260421173102" } } };
  it("є знімок — адреса https і мітка часу", async () => {
    expect(await findCopy("https://a.example/x", fetchOf(res(200, found)))).toEqual({ state: "found", archive: "https://web.archive.org/web/20260421173102/https://a.example/x", timestamp: "20260421173102" });
  });
  it("немає знімка; знімок зі статусом не 200; чужа адреса в відповіді — «немає»", async () => {
    expect(await findCopy("https://a.example/x", fetchOf(res(200, { archived_snapshots: {} })))).toEqual({ state: "none" });
    expect(await findCopy("https://a.example/x", fetchOf(res(200, { archived_snapshots: { closest: { ...found.archived_snapshots.closest, status: "404" } } })))).toEqual({ state: "none" });
    expect(await findCopy("https://a.example/x", fetchOf(res(200, { archived_snapshots: { closest: { ...found.archived_snapshots.closest, url: "https://evil.example/x" } } })))).toEqual({ state: "none" });
  });
  it("помилки мережі й HTTP — error; приватна адреса не запитується", async () => {
    expect((await findCopy("https://a.example/x", fetchOf(res(503)))).state).toBe("error");
    expect((await findCopy("https://a.example/x", fetchOf(new Error("x")))).state).toBe("error");
    let called = false;
    const spy = (async () => ((called = true), res(200, found))) as unknown as typeof fetch;
    expect((await findCopy("http://169.254.169.254/", spy)).state).toBe("error");
    expect(called).toBe(false);
  });
});

describe("savePage", () => {
  it("302 на знімок — збережено; адреса знімка перевіряється", async () => {
    expect(await savePage("https://www.aljazeera.com/news/x", fetchOf(new Response(null, { status: 302, headers: { location: SNAP } })))).toEqual({ state: "saved", archive: SNAP });
    expect((await savePage("https://www.aljazeera.com/news/x", fetchOf(new Response(null, { status: 302, headers: { location: "https://evil.example/" } })))).state).not.toBe("saved");
  });
  it("200 без адреси знімка і таймаут — «ще зберігається»; 429/520 — помилка з поясненням", async () => {
    expect(await savePage("https://a.example/x", fetchOf(new Response("ok", { status: 200 })))).toEqual({ state: "pending" });
    expect(await savePage("https://a.example/x", fetchOf(Object.assign(new Error("t"), { name: "TimeoutError" })))).toEqual({ state: "pending" });
    expect(await savePage("https://a.example/x", fetchOf(new Response(null, { status: 429 })))).toMatchObject({ state: "failed" });
    expect(await savePage("https://a.example/x", fetchOf(new Response(null, { status: 520 })))).toEqual({ state: "failed", detail: "Web Archive: 520" });
  });
  it("приватну адресу не архівуємо і не запитуємо", async () => {
    let called = false;
    const spy = (async () => ((called = true), new Response(null, { status: 302, headers: { location: SNAP } }))) as unknown as typeof fetch;
    expect((await savePage("http://127.0.0.1/", spy)).state).toBe("refused");
    expect(called).toBe(false);
  });
});

describe("archivedHost", () => {
  it("хост оригіналу без www", () => {
    expect(archivedHost(SNAP)).toBe("aljazeera.com");
    expect(archivedHost("https://evil.example/x")).toBeNull();
  });
});

describe("recordArchives", () => {
  const json = `${JSON.stringify(
    {
      slug: "x",
      sources: [
        { id: "s1", title: "A", publisher: "P", url: "https://www.aljazeera.com/news/x", kind: "secondary", lang: "en" },
        { id: "s2", title: "B", publisher: "P", url: "https://fia.com/b", kind: "primary", lang: "en", archive: "https://web.archive.org/web/20260101000000/https://fia.com/b" },
        { id: "s3", title: "C", publisher: "P", url: "https://motorsport.com/c", kind: "secondary", lang: "en" },
      ],
    },
    null,
    2,
  )}\n`;
  it("додає archive лише там, де можна; решту файлу не чіпає", () => {
    const r = recordArchives(json, { s1: SNAP, s2: SNAP, s3: SNAP, s9: SNAP });
    expect(r.added).toEqual(["s1"]);
    expect(r.skipped).toEqual([
      { id: "s2", reason: "копія вже є" },
      { id: "s3", reason: "копія іншого сайту" },
      { id: "s9", reason: "джерела немає" },
    ]);
    const out = JSON.parse(r.json);
    expect(out.sources[0].archive).toBe(SNAP);
    expect(out.sources[1].archive).toContain("20260101000000"); // не перезаписано
    expect(r.json.endsWith("\n")).toBe(true);
    expect(r.json.replace(/,\n\s+"archive": "[^"]+"/, "")).toBe(json); // різниця — лише рядок archive
  });
  it("нічого не додано — той самий рядок файлу", () => {
    expect(recordArchives(json, { s1: "javascript:alert(1)" }).json).toBe(json);
  });
});
