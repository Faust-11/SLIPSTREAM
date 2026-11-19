import { LOGO_ASPECT, LOGO_MARK, LOGO_RED, LOGO_TAG, LOGO_VIEWBOX, LOGO_WORD } from "./logo-paths";

/**
 * Логотип Outlap (вектор з scripts/assets/logo_trace.py): знак-дуга з бордюром + напис «OUTLAP».
 * Колір «чорнила» й світлих смуг бордюру — CSS-змінні --logo-ink / --logo-paper (за замовчуванням світлі: шапка й підвал
 * сайту завжди темні); червоний — фірмовий, однаковий на будь-якому тлі. `tagline` додає «THE F1 HUB» (лише там, де
 * достатньо місця: дрібний підпис у шапці нечитний). Висоту задає CSS (`.logo`), ширина — за пропорціями.
 */
export function Logo({ tagline = false, className = "logo" }: { tagline?: boolean; className?: string }) {
  return (
    <svg className={className} viewBox={LOGO_VIEWBOX} width={Math.round(LOGO_ASPECT * 100)} height={100} aria-hidden="true" focusable="false">
      <path className="lg-paper" fillRule="evenodd" d={LOGO_MARK.paper} />
      <path fill={LOGO_RED} fillRule="evenodd" d={LOGO_MARK.red} />
      <path className="lg-ink" fillRule="evenodd" d={LOGO_MARK.ink} />
      <path fill={LOGO_RED} fillRule="evenodd" d={LOGO_WORD.red} />
      <path className="lg-ink" fillRule="evenodd" d={LOGO_WORD.ink} />
      {tagline ? <path className="lg-ink" fillRule="evenodd" d={LOGO_TAG.ink} /> : null}
    </svg>
  );
}
