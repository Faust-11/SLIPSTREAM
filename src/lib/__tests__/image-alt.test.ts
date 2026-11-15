import { describe, expect, it } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import uk from "@/i18n/dictionaries/uk.json";
import { circuitPhotoAlt, seasonPhotoAlt } from "../image-alt";

describe("alt великих фото — мовою сторінки (рішення 15.11)", () => {
  it("сезон: чемпіон або лідер сезону, що триває", () => {
    expect(seasonPhotoAlt(uk.seasonsPage.photoAlt, "Макс Ферстаппен", 2023, true)).toBe("Макс Ферстаппен — чемпіон 2023");
    expect(seasonPhotoAlt(en.seasonsPage.photoAlt, "Max Verstappen", 2023, true)).toBe("Max Verstappen, 2023 champion");
    expect(seasonPhotoAlt(uk.seasonsPage.photoAlt, "Кімі Антонеллі", 2026, false)).toBe("Кімі Антонеллі — лідер сезону 2026");
    expect(seasonPhotoAlt(en.seasonsPage.photoAlt, "Kimi Antonelli", 2026, false)).toBe("Kimi Antonelli, 2026 championship leader");
  });

  it("траса: коротка назва й місце; без повтору, коли вони збігаються", () => {
    expect(circuitPhotoAlt(uk.circuitPage.heroAlt, "Яс-Марина", "Абу-Дабі")).toBe("Траса «Яс-Марина», Абу-Дабі");
    expect(circuitPhotoAlt(en.circuitPage.heroAlt, "Yas Marina", "Abu Dhabi")).toBe("Yas Marina circuit, Abu Dhabi");
    expect(circuitPhotoAlt(uk.circuitPage.heroAlt, "Монца", "Монца")).toBe("Траса «Монца»");
    expect(circuitPhotoAlt(en.circuitPage.heroAlt, "Monza", "Monza")).toBe("Monza circuit");
  });
});
