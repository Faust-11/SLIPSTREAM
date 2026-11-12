import type { TeamSeasonRow } from "@/lib/data/types";

type Props = {
  seasons: TeamSeasonRow[];
  label: string;
  /** Підпис точки для підказки: «1988 · P1 · 15 перемог · 199 очок». */
  describe: (s: TeamSeasonRow) => string;
};

const W = 900;
const H = 320;
const PAD = { l: 34, r: 12, t: 14, b: 30 };

/**
 * Місце в Кубку конструкторів за сезонами — SVG на сервері (без JS). Підказка — <title> точки;
 * ті самі числа — у таблиці під графіком (для клавіатури й екранних читачів графік — img з підписом).
 * Лінія рветься там, де місця немає (пропущений сезон, виключення). Виключені сезони — кільце на нижній лінії.
 */
export function SeasonChart({ seasons, label, describe }: Props) {
  const ranked = seasons.filter((s) => s.position !== null || s.excluded);
  if (ranked.length < 2) return null;
  const years = ranked.map((s) => s.year);
  const y0 = Math.min(...years);
  const y1 = Math.max(...years);
  const maxPos = Math.max(...ranked.map((s) => s.position ?? 0), 3);
  const span = Math.max(y1 - y0, 1);
  const x = (year: number) => PAD.l + ((year - y0) / span) * (W - PAD.l - PAD.r);
  const exY = H - PAD.b;
  const y = (pos: number) => PAD.t + ((pos - 1) / Math.max(maxPos - 1, 1)) * (exY - 18 - PAD.t);

  const byYear = new Map(ranked.map((s) => [s.year, s]));
  const paths: string[] = [];
  let cur = "";
  for (let yr = y0; yr <= y1; yr++) {
    const s = byYear.get(yr);
    if (s?.position) cur += `${cur ? "L" : "M"}${x(yr).toFixed(1)} ${y(s.position).toFixed(1)}`;
    else if (cur) {
      paths.push(cur);
      cur = "";
    }
  }
  if (cur) paths.push(cur);

  const gridPos = [1, ...[5, 10, 15, 20].filter((p) => p < maxPos), maxPos].filter((p, i, a) => a.indexOf(p) === i);
  const decadeTicks: number[] = [];
  for (let d = Math.ceil(y0 / 10) * 10; d <= y1; d += 10) decadeTicks.push(d);

  return (
    <svg className="sc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {gridPos.map((p) => (
        <g key={p}>
          <line className="sc-gl" x1={PAD.l} x2={W - PAD.r} y1={y(p)} y2={y(p)} />
          <text x={PAD.l - 8} y={y(p) + 4} textAnchor="end">
            P{p}
          </text>
        </g>
      ))}
      {decadeTicks.map((d) => (
        <text key={d} x={x(d)} y={H - 8} textAnchor="middle">
          {d}
        </text>
      ))}
      {paths.map((d) => (
        <path key={d} className="sc-ln" d={d} />
      ))}
      {ranked.map((s) =>
        s.excluded ? (
          <circle key={s.year} className="sc-ex" cx={x(s.year)} cy={exY - 6} r={5.5}>
            <title>{describe(s)}</title>
          </circle>
        ) : (
          <circle key={s.year} className={s.champion ? "sc-win" : "sc-dot"} cx={x(s.year)} cy={y(s.position!)} r={s.champion ? 6 : 4}>
            <title>{describe(s)}</title>
          </circle>
        ),
      )}
    </svg>
  );
}
