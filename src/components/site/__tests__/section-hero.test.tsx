import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NAV, SECTION_HERO } from "@/config/nav";
import { contrastRatio, heroColors, SectionHero } from "../section-hero";

describe("heroColors", () => {
  it("заголовок на кожному кольорі розділу проходить WCAG AA для великого тексту (≥ 3:1)", () => {
    // На першому екрані — лише h1 ≥ 32 px (site.css). Для звичайного тексту на #1E8A63 AA недосяжний
    // ні білим (4.31), ні темним (4.12) — дрібний текст на цих кольорах не ставити.
    for (const [key, bg] of Object.entries(SECTION_HERO)) {
      const { fg } = heroColors(bg);
      expect(contrastRatio(fg, bg), `${key} ${bg} / ${fg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("де можливо — і для звичайного тексту (≥ 4.5:1): усі, крім Новин", () => {
    for (const [key, bg] of Object.entries(SECTION_HERO)) {
      if (key === "news") continue;
      const { fg } = heroColors(bg);
      expect(contrastRatio(fg, bg), `${key} ${bg} / ${fg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("помаранчевий і бірюзовий — темний текст (білий не проходить)", () => {
    expect(heroColors("#FF8000").fg).toBe("#16181D");
    expect(heroColors("#27D9C2").fg).toBe("#16181D");
  });

  it("контраст рахується за WCAG 2.x (контрольні значення)", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#FFC400", "#F3F4F1")).toBeCloseTo(1.45, 2);
  });
});

describe("SectionHero", () => {
  it("лише заголовок розділу (h1), без пояснювального тексту", () => {
    const { container } = render(<SectionHero section="stories" title="Історії" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Історії");
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("розділи без власного кольору теж мають перший екран", () => {
    for (const { key } of NAV) {
      const { unmount } = render(<SectionHero section={key} title={key} />);
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      unmount();
    }
  });
});
