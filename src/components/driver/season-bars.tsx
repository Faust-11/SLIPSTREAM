type Bar = {
  year: number;
  points: number | null;
  /** «P2», «DSQ» або «—». */
  place: string;
  /** Колір команди сезону; null — нейтральний. */
  color: string | null;
  champion: boolean;
  /** Підказка стовпчика: «2024 · P2 · 374 очки · McLaren». */
  title: string;
};

const W = 760;
const H = 300;
const X0 = 30;
const X1 = 730;
const BASE = 270;
const TOP = 78;

/**
 * Очки й місце в заліку за сезонами — SVG на сервері (без JS). Підказка — <title> стовпчика; ті самі числа —
 * у таблиці поруч (для екранних читачів графік — img з підписом). Стовпчик — колір команди сезону,
 * чемпіонський — жовтий. Понад 12 сезонів — короткі підписи років (’07) і лише місце над стовпчиком.
 */
export function SeasonBars({ bars, label }: { bars: Bar[]; label: string }) {
  const max = Math.max(...bars.map((b) => b.points ?? 0));
  if (bars.length < 2 || max <= 0) return null;
  const n = bars.length;
  const slot = (X1 - X0) / n;
  const bw = Math.min(61, slot * 0.7);
  const compact = n > 12;
  const dense = n > 18;
  return (
    <svg className="sb" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {bars.map((b, i) => {
        const h = b.points ? Math.max((b.points / max) * (BASE - TOP), 2) : 0;
        const cx = X0 + slot * i + slot / 2;
        const y = BASE - h;
        return (
          <g key={b.year}>
            <title>{b.title}</title>
            {h > 0 && (
              <rect
                x={(cx - bw / 2).toFixed(1)}
                y={y.toFixed(1)}
                width={bw.toFixed(1)}
                height={h.toFixed(1)}
                className={b.champion ? "sb-ch" : b.color ? undefined : "sb-n"}
                // Колір — стилем: правило .sb rect у CSS сильніше за атрибут fill.
                style={b.champion || !b.color ? undefined : { fill: b.color }}
              />
            )}
            <text className="sb-p" x={cx.toFixed(1)} y={(y - (compact ? 8 : 26)).toFixed(1)} textAnchor="middle" fontSize={dense ? 9 : compact ? 11 : 15}>
              {b.place}
            </text>
            {!compact && b.points !== null && (
              <text className="sb-v" x={cx.toFixed(1)} y={(y - 8).toFixed(1)} textAnchor="middle">
                {b.points}
              </text>
            )}
            <text className="sb-y" x={cx.toFixed(1)} y={BASE + 20} textAnchor="middle" fontSize={dense ? 9 : compact ? 10 : 12}>
              {compact ? `’${String(b.year).slice(2)}` : b.year}
            </text>
          </g>
        );
      })}
      <line x1={X0} x2={X1} y1={BASE} y2={BASE} className="sb-base" />
    </svg>
  );
}
