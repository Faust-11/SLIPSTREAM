import { SECTION_HERO, type NavKey } from "@/config/nav";
import { contrastRatio } from "@/lib/contrast";

export { contrastRatio };

const INK = "#16181D";
const WHITE = "#FFFFFF";

/** Колір тексту для фону першого екрана: темний або білий — що контрастніше (WCAG AA ≥ 4.5). */
export function heroColors(bg: string): { bg: string; fg: string } {
  return { bg, fg: contrastRatio(INK, bg) >= contrastRatio(WHITE, bg) ? INK : WHITE };
}

/** Перший екран розділу: лише назва розділу на кольорі розділу (без пояснювального тексту). */
export function SectionHero({ section, title }: { section: NavKey; title: string }) {
  const color = SECTION_HERO[section];
  const style = color
    ? { "--hero-bg": heroColors(color).bg, "--hero-fg": heroColors(color).fg }
    : undefined;
  return (
    <section className="section-hero" data-section={section} style={style as React.CSSProperties | undefined}>
      <div className="wrap">
        <h1 className="display">{title}</h1>
      </div>
    </section>
  );
}
