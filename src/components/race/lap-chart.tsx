import { DASH } from "@/components/season/title-chart";
import type { LapLine } from "@/lib/data/race-page";

type Props = {
  lines: LapLine[];
  laps: number;
  label: string;
  regionLabel: string;
  tableLabel: string;
  lapCol: string;
  pitKey: string;
  lapLabel: (n: number) => string;
};

const W = 780;
const H = 330;
const M = { l: 34, r: 120, t: 12, b: 28 };

/**
 * «Коло за колом» — позиції пілотів графіка по колах (P1 угорі), SVG на сервері (як графік сезону 3f): кольори — слоти
 * палітри dataviz за місцем фінішу, друга ознака — штрих; кружки — піт-стопи. Підказка — <title> колонки кола,
 * перехрестя — CSS :hover; ті самі числа — у таблиці під графіком.
 */
export function LapChart({ lines, laps, label, regionLabel, tableLabel, lapCol, pitKey, lapLabel }: Props) {
  if (laps < 2 || lines.length === 0) return null;
  const maxPos = Math.max(5, ...lines.flatMap((l) => l.positions.filter((p): p is number => p !== null)));
  const x = (lap: number) => M.l + ((lap - 1) * (W - M.l - M.r)) / (laps - 1);
  const y = (pos: number) => M.t + ((pos - 1) * (H - M.t - M.b)) / Math.max(maxPos - 1, 1);
  const yTicks = [1, ...Array.from({ length: Math.floor(maxPos / 5) }, (_, i) => (i + 1) * 5)].filter((p) => p <= maxPos);
  const lapTicks = Array.from({ length: laps }, (_, i) => i + 1).filter((n) => n === 1 || n === laps || n % 10 === 0);
  const colW = (W - M.l - M.r) / (laps - 1);

  // Лінія рветься на колах без позиції (схід): окремі відрізки шляху.
  const path = (pos: (number | null)[]) => {
    let d = "";
    let pen = false;
    pos.forEach((p, i) => {
      if (p === null) return void (pen = false);
      d += `${pen ? "L" : "M"}${x(i + 1).toFixed(1)} ${y(p).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const ends = lines
    .map((l) => {
      const last = l.positions.findLastIndex((p) => p !== null);
      return { l, lap: last + 1, pos: l.positions[last] ?? null };
    })
    .filter((e) => e.pos !== null)
    .sort((a, b) => a.pos! - b.pos!);
  const labelY = ends.map((e) => y(e.pos!));
  for (let i = 1; i < labelY.length; i++) if (labelY[i]! - labelY[i - 1]! < 14) labelY[i] = labelY[i - 1]! + 14;

  return (
    <div className="rc-lc">
      <ul className="rc-lc-legend" role="list">
        {lines.map((l) => (
          <li key={l.driver.id} data-slot={l.slot}>
            <svg width="24" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="24" y2="3" strokeDasharray={DASH[l.slot] || undefined} />
            </svg>
            {l.driver.short}
          </li>
        ))}
        <li className="pit">
          <svg width="10" height="10" aria-hidden="true">
            <circle cx="5" cy="5" r="3.5" />
          </svg>
          {pitKey}
        </li>
      </ul>
      <div className="rc-lc-scroll" tabIndex={0} role="region" aria-label={regionLabel}>
        <svg className="rc-lc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          {yTicks.map((p) => (
            <g key={p}>
              <line className="gl" x1={M.l} x2={W - M.r} y1={y(p)} y2={y(p)} />
              <text x={M.l - 8} y={y(p) + 4} textAnchor="end">
                P{p}
              </text>
            </g>
          ))}
          {lapTicks.map((n) => (
            <text key={n} x={x(n)} y={H - M.b + 18} textAnchor="middle">
              {n}
            </text>
          ))}
          {lines.map((l) => (
            <path key={l.driver.id} data-slot={l.slot} className={l.slot === 0 ? "ln lead" : "ln"} d={path(l.positions)} strokeDasharray={DASH[l.slot] || undefined} />
          ))}
          {lines.flatMap((l) =>
            l.stops
              .filter((lap) => lap >= 1 && lap <= l.positions.length && l.positions[lap - 1] != null)
              .map((lap) => <circle key={`${l.driver.id}-${lap}`} data-slot={l.slot} className="pit" cx={x(lap)} cy={y(l.positions[lap - 1]!)} r={4} />),
          )}
          {ends.map((e, i) => (
            <text key={e.l.driver.id} className="end" x={x(e.lap) + 10} y={labelY[i]! + 4}>
              {e.l.driver.short} P{e.pos}
            </text>
          ))}
          {Array.from({ length: laps }, (_, i) => {
            const rows = lines
              .map((l) => ({ name: l.driver.short, p: l.positions[i] ?? null }))
              .filter((r) => r.p !== null)
              .sort((a, b) => a.p! - b.p!);
            return (
              <g key={i} className="col">
                <rect x={x(i + 1) - colW / 2} y={M.t} width={colW} height={H - M.t - M.b} />
                <line className="hl" x1={x(i + 1)} x2={x(i + 1)} y1={M.t} y2={H - M.b} />
                <title>{`${lapLabel(i + 1)}\n${rows.map((r) => `P${r.p} ${r.name}`).join("\n")}`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <details className="rc-lc-table">
        <summary>{tableLabel}</summary>
        <div className="rc-lc-table-scroll" tabIndex={0} role="region" aria-label={tableLabel}>
          <table>
            <thead>
              <tr>
                <th scope="col">{lapCol}</th>
                {lines.map((l) => (
                  <th key={l.driver.id} scope="col">
                    {l.driver.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: laps }, (_, i) => (
                <tr key={i}>
                  <th scope="row" className="num">
                    {i + 1}
                  </th>
                  {lines.map((l) => (
                    <td key={l.driver.id} className="num" data-pit={l.stops.includes(i + 1) || undefined}>
                      {l.positions[i] ?? "—"}
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
