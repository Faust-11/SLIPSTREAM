// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { planFormat } from "../formats";
import { PhotoError, renderFormat } from "../render";

const C = { x: 0.5, y: 0.5 };

async function jpeg(w: number, h: number, exif?: Record<string, Record<string, string>>, orientation?: number) {
  let p = sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 30 } } }).jpeg();
  if (exif || orientation) p = p.withMetadata({ ...(exif ? { exif } : {}), ...(orientation ? { orientation } : {}) });
  return new Uint8Array(await p.toBuffer());
}

describe("planFormat — розміри як у файлів сайту", () => {
  it("банер пілота: вузьке джерело — лише 420; широке — 420 і 640 (4:5)", () => {
    expect(planFormat("driverHero", 480, 600, "/img/drivers/x", C).variants).toEqual([{ name: "/img/drivers/x-420.webp", width: 420, height: 525 }]);
    expect(planFormat("driverHero", 960, 1280, "/img/drivers/x", C).variants.map((v) => [v.name, v.width, v.height])).toEqual([
      ["/img/drivers/x-420.webp", 420, 525],
      ["/img/drivers/x-640.webp", 640, 800],
    ]);
  });
  it("банер: ширини 1280/800/480, пропорції джерела; вужче джерело — не розтягуємо", () => {
    expect(planFormat("wideHero", 1280, 853, "/img/cars/ferrari", C).variants.map((v) => [v.width, v.height])).toEqual([
      [1280, 853],
      [800, 533],
      [480, 320],
    ]);
    expect(planFormat("storyMedia", 1000, 500, "/img/stories/s/m1", C).variants[0]).toEqual({ name: "/img/stories/s/m1-1280.webp", width: 1000, height: 500 });
  });
  it("картка сезону: full ≤ 560, small 280", () => {
    expect(planFormat("seasonCard", 489, 700, "/img/seasons/1950", C).variants.map((v) => v.width)).toEqual([489, 280]);
  });
});

describe("renderFormat (sharp)", () => {
  it("аватар: 96×96 WebP без EXIF", async () => {
    const [out] = await renderFormat(await jpeg(600, 900, { IFD0: { Copyright: "secret", Artist: "Me" } }), "avatar", "/img/drivers/x", C);
    const meta = await sharp(out!.data).metadata();
    expect([meta.format, meta.width, meta.height, meta.exif]).toEqual(["webp", 96, 96, undefined]);
  });
  it("картка команди: 480×300 і 256×160", async () => {
    const out = await renderFormat(await jpeg(1600, 900), "teamCard", "/img/cars/x", C);
    expect(await Promise.all(out.map(async (o) => [(await sharp(o.data).metadata()).width, (await sharp(o.data).metadata()).height]))).toEqual([
      [480, 300],
      [256, 160],
    ]);
  });
  it("EXIF-орієнтація 6 (телефон): 900×600 у файлі = портрет 600×900 після повороту", async () => {
    // Без повороту кадр 4:5 мав би ширину 480 (< 520) — і великого файлу не було б; з поворотом — 600 → «640» = 600×750.
    const out = await renderFormat(await jpeg(900, 600, undefined, 6), "driverHero", "/img/drivers/x", C);
    expect(out.map((o) => [o.width, o.height])).toEqual([
      [420, 525],
      [600, 750],
    ]);
  });
  it("замале для банера (< 960) і не зображення — зрозуміла помилка", async () => {
    await expect(renderFormat(await jpeg(800, 500), "wideHero", "/img/seasons/x", C)).rejects.toThrow(PhotoError);
    await expect(renderFormat(new TextEncoder().encode("<svg onload=alert(1)>"), "avatar", "/img/x", C)).rejects.toThrow("не є зображенням");
  });
});
