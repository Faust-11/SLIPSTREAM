// @vitest-environment node
import { describe, expect, it } from "vitest";
import { crop4x5, cropRatio, focusString, parseFocus, squareFocus, squareTop } from "../crop";
import { classifyLicense } from "../license";

describe("classifyLicense — як scripts/curated is_free + рішення 15.11 щодо NC", () => {
  it.each(["CC BY-SA 4.0", "CC BY 2.0", "CC0", "Public domain", "PD-US", "GFDL", "Attribution", "CC-BY-SA-3.0"])("%s — так", (l) =>
    expect(classifyLicense(l).level).toBe("ok"),
  );
  it.each(["CC BY-NC 2.0", "CC BY-NC-SA 4.0", "cc-by-nc-sa-3.0"])("%s — NC з попередженням", (l) => expect(classifyLicense(l).level).toBe("nc"));
  it.each(["CC BY-ND 2.0", "CC BY-NC-ND 4.0", "Fair use", "", "All rights reserved", "Copyrighted"])("«%s» — ні", (l) =>
    expect(classifyLicense(l).level).toBe("no"),
  );
  it("NonFree з Commons — ні навіть із «вільною» назвою", () => expect(classifyLicense("CC BY-SA 4.0", true).level).toBe("no"));
});

describe("кадри — ті самі числа, що й Pillow-скрипти", () => {
  it("squareTop: портрет 600×900 → квадрат 600 з top = 45 (5%); пейзаж 900×600 → центр", () => {
    expect(squareTop(600, 900)).toEqual({ left: 0, top: 45, width: 600, height: 600 });
    expect(squareTop(900, 600)).toEqual({ left: 150, top: 0, width: 600, height: 600 });
  });
  it("crop4x5: зашироке 960×640 → 512×640 по центру; зависоке 960×1600 → 960×1200, top = 80 (20% зайвого)", () => {
    expect(crop4x5(960, 640)).toEqual({ left: 224, top: 0, width: 512, height: 640 });
    expect(crop4x5(960, 1600)).toEqual({ left: 0, top: 80, width: 960, height: 1200 });
  });
  it("squareFocus: 960×640, «25% 50%» → лівіше центру", () => {
    expect(squareFocus(960, 640, parseFocus("25% 50%"))).toEqual({ left: 80, top: 0, width: 640, height: 640 });
  });
  it("cropRatio 16:10 з фокусом", () => {
    expect(cropRatio(1280, 720, 1.6, { x: 0.5, y: 0.5 })).toEqual({ left: 64, top: 0, width: 1152, height: 720 });
    expect(cropRatio(1000, 1000, 1.6, { x: 0.5, y: 0 })).toEqual({ left: 0, top: 0, width: 1000, height: 625 });
  });
  it("parseFocus: сміття — центр, межі 0–100%", () => {
    expect(parseFocus("кіт")).toEqual({ x: 0.5, y: 0.5 });
    expect(parseFocus("150% -3%")).toEqual({ x: 0.5, y: 0.5 });
    expect(parseFocus("100% 0%")).toEqual({ x: 1, y: 0 });
    expect(focusString({ x: 0.554, y: 0.4 })).toBe("55% 40%");
  });
});
