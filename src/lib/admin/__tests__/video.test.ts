// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VIDEOS_PATH, applyVideo, checkOfficial, youtubeId } from "../video";

describe("youtubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=rnjmSOUYVp8", "rnjmSOUYVp8"],
    ["https://youtu.be/rnjmSOUYVp8?si=abc", "rnjmSOUYVp8"],
    ["https://m.youtube.com/watch?v=rnjmSOUYVp8&t=10", "rnjmSOUYVp8"],
    ["https://www.youtube.com/shorts/rnjmSOUYVp8", "rnjmSOUYVp8"],
    ["https://www.youtube-nocookie.com/embed/rnjmSOUYVp8", "rnjmSOUYVp8"],
    [" rnjmSOUYVp8 ", "rnjmSOUYVp8"],
  ])("%s", (input, id) => expect(youtubeId(input)).toBe(id));
  it.each(["https://evil.example/watch?v=rnjmSOUYVp8", "javascript:alert(1)", "https://www.youtube.com/watch?v=short", "кіт", ""])("ні: %s", (input) =>
    expect(youtubeId(input)).toBeNull(),
  );
});

// Відповіді oEmbed — як у заміру 17.11 (офіційне відео British GP 2026).
function fake(oembed: { status: number; body?: unknown }, maxres = 200) {
  return (async (url: string) =>
    String(url).includes("/oembed") ? new Response(JSON.stringify(oembed.body ?? {}), { status: oembed.status }) : new Response(null, { status: maxres })) as unknown as typeof fetch;
}

describe("checkOfficial", () => {
  it("офіційний канал — так, з hd", async () => {
    const f = fake({ status: 200, body: { title: "Race Highlights | 2026 British Grand Prix", author_url: "https://www.youtube.com/@Formula1" } });
    expect(await checkOfficial("rnjmSOUYVp8", f)).toEqual({ ok: true, video: { id: "rnjmSOUYVp8", title: "Race Highlights | 2026 British Grand Prix", hd: true } });
  });
  it("інший канал — ні; заборонене вбудовування — ні; без maxres — без hd", async () => {
    expect(await checkOfficial("x".repeat(11), fake({ status: 200, body: { title: "Re-upload", author_url: "https://www.youtube.com/@SomeoneElse" } }))).toMatchObject({ ok: false, reason: "це не офіційний канал FORMULA 1" });
    expect((await checkOfficial("x".repeat(11), fake({ status: 401 }))).ok).toBe(false);
    const noHd = await checkOfficial("x".repeat(11), fake({ status: 200, body: { title: "T", author_url: "https://www.youtube.com/@Formula1" } }, 404));
    expect(noHd).toEqual({ ok: true, video: { id: "xxxxxxxxxxx", title: "T" } });
  });
});

describe("applyVideo — на справжньому race-videos.json", () => {
  const current = readFileSync(VIDEOS_PATH, "utf8");
  it("новий етап — на своєму місці (числовий порядок), змінено лише рядки цього запису", () => {
    const next = applyVideo(current, "2026/21", { id: "abcdefghijk", title: "Race Highlights | 2026 Las Vegas Grand Prix", hd: true });
    const keys = Object.keys(JSON.parse(next).videos);
    expect(keys.slice(-2)).toEqual(["2026/20", "2026/21"]);
    expect(next.split("\n").length - current.split("\n").length).toBe(5); // «"2026/21": {», 3 поля, «}»
    expect(applyVideo(next, "2026/21", null)).toBe(current);
  });
});
