import type { ChartLine } from "@/lib/data/season-page";

type Props = {
  rounds: { round: number; place: string }[];
  lines: ChartLine[];
  /** Позиція лідера в палітрі після кожного етапу (індекс — як у rounds). */
  leaders: (number | null)[];
  label: string;
  roundLabel: (n: number) => string;
  stripLabel: string;
  tableLabel: string;
  colRound: string;
  fmt: (n: number) => string;
};

const W = 760;
const H = 360;
const M = { l: 40, r: 128, t: 12, b: 30 };
/** Друга ознака, крім кольору (скіл dataviz: лінії не лише кольором): штрих за позицією в палітрі. */
export const DASH = ["", "7 4", "2 3", "10 3 2 3", "1 4", "6 2 1 2"];

/** «Кругла» верхня межа осі Y: 4–5 ліній сітки. */
function niceMax(v: number): { max: number; step: number } {
  const raw = Math.max(v, 1) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw)!;
  return { max: Math.ceil(v / step) * step || step, step };
}

/**
 * «Битва за титул» — очки після кожного етапу, SVG на сервері (без JS, як графік команди 3b). Підказка — <title> колонки
 * етапу, перехрестя — CSS :hover; для клавіатури й екранних читачів графік — img з підписом, ті самі числа — у таблиці.
 * Кольори — валідовані слоти палітри (season.css), не лівреї: історичних кольорів команд у даних немає.
 */
export function TitleChart({ rounds, lines, leaders, label, roundLabel, stripLabel, tableLabel, colRound, fmt }: Props) {
  const n = rounds.length;
  if (n === 0 || lines.length === 0) return null;
  const { max, step } = niceMax(Math.max(...lines.map((l) => Math.max(...l.points))));
  const x = (i: number) => M.l + (n === 1 ? (W - M.l - M.r) / 2 : (i * (W - M.l - M.r)) / (n - 1));
  const y = (v: number) => M.t + (1 - v / max) * (H - M.t - M.b);
  const grid: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) grid.push(v);
  const tickEvery = n > 16 ? 2 : 1;

  // Підписи в кінці ліній: не ближче 15 px один до одного.
  const ends = lines.map((l) => ({ l, yy: y(l.final) })).sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < ends.length; i++) if (ends[i]!.yy - ends[i - 1]!.yy < 15) ends[i]!.yy = ends[i - 1]!.yy + 15;

  const colW = n === 1 ? W - M.l - M.r : (W - M.l - M.r) / (n - 1);
  return (
    <div className="fc-box">
      <ul className="fc-legend" role="list">
        {lines.map((l) => (
          <li key={l.driver.id} data-slot={l.slot}>
            <svg width="24" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="24" y2="3" strokeDasharray={DASH[l.slot] || undefined} />
            </svg>
            {l.driver.short}
          </li>
        ))}
      </ul>
      <div className="fc-scroll" tabIndex={0} role="region" aria-label={label}>
        <svg className="fc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          {grid.map((v) => (
            <g key={v}>
              <line className="gl" x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} />
              <text x={M.l - 8} y={y(v) + 4} textAnchor="end">
                {fmt(v)}
              </text>
            </g>
          ))}
          {rounds.map((r, i) =>
            i % tickEvery === 0 || i === n - 1 ? (
              <text key={r.round} x={x(i)} y={H - M.b + 18} textAnchor="middle">
                {r.round}
              </text>
            ) : null,
          )}
          {lines.map((l) => (
            <path
              key={l.driver.id}
              data-slot={l.slot}
              className={l.slot === 0 ? "ln lead" : "ln"}
              d={l.points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join("")}
              strokeDasharray={DASH[l.slot] || undefined}
            />
          ))}
          {lines.map((l) => (
            <circle key={l.driver.id} data-slot={l.slot} className="dot" cx={x(n - 1)} cy={y(l.final)} r={4.5} />
          ))}
          {ends.map(({ l, yy }) => (
            <text key={l.driver.id} className="end" x={x(n - 1) + 10} y={yy + 4}>
              {l.driver.short} {fmt(l.final)}
            </text>
          ))}
          {rounds.map((r, i) => {
            const rows = lines.map((l) => ({ name: l.driver.short, p: l.points[i]! })).sort((a, b) => b.p - a.p);
            return (
              <g key={r.round} className="col">
                <rect x={x(i) - colW / 2} y={M.t} width={colW} height={H - M.t - M.b} />
                <line className="hl" x1={x(i)} x2={x(i)} y1={M.t} y2={H - M.b} />
                <title>{`${roundLabel(r.round)} · ${r.place}\n${rows.map((row) => `${row.name} ${fmt(row.p)}`).join("\n")}`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="fc-strip">
        <p>
          <span>{stripLabel}</span>
          <span className="num">
            {rounds[0]!.round} → {rounds.at(-1)!.round}
          </span>
        </p>
        <ol role="list" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {rounds.map((r, i) => {
            const s = leaders[i];
            const who = s !== null && s !== undefined ? lines.find((l) => l.slot === s)?.driver.short : undefined;
            return <li key={r.round} data-slot={s ?? undefined} title={`${roundLabel(r.round)}: ${who ?? "—"}`} />;
          })}
        </ol>
      </div>
      <details className="fc-table">
        <summary>{tableLabel}</summary>
        <div className="fc-table-scroll" tabIndex={0} role="region" aria-label={tableLabel}>
          <table>
            <thead>
              <tr>
                <th scope="col">{colRound}</th>
                {lines.map((l) => (
                  <th key={l.driver.id} scope="col">
                    {l.driver.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rounds.map((r, i) => (
                <tr key={r.round}>
                  <th scope="row">
                    <span className="num">{r.round}</span> {r.place}
                  </th>
                  {lines.map((l) => (
                    <td key={l.driver.id} className="num" data-lead={leaders[i] === l.slot || undefined}>
                      {fmt(l.points[i]!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
