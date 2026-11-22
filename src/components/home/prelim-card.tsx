"use client";

import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { plural } from "@/lib/plural";
import type { PrelimResults, PrelimRow } from "@/lib/prelim";
import { gapTime, raceTime } from "@/lib/race-math";

export type PrelimLabels = {
  title: string;
  source: string;
  sourcesHref: string;
  sourcesLink: string;
  tableLabel: string;
  pos: string;
  driver: string;
  gap: string;
  pts: string;
  dnf: string;
  dns: string;
  dsq: string;
  lapsDown: Parameters<typeof plural>[2];
};

const TOP = 10;

/**
 * Картка «Попередні результати» (OpenF1): подіум і топ-10, коли офіційних даних ще нема (рішення 22.11). Окремий чанк —
 * вантажиться, лише коли відповідь API вже є; для решти відвідувачів на головній цього коду нема.
 */
export default function PrelimCard({ data, gp, lang, labels, driverBase }: { data: PrelimResults; gp: string; lang: Locale; labels: PrelimLabels; driverBase: string }) {
  const top = data.rows.slice(0, TOP);
  const cell = (r: PrelimRow): string => {
    if (r.status === "dnf") return labels.dnf;
    if (r.status === "dns") return labels.dns;
    if (r.status === "dsq") return labels.dsq;
    if (r.position === 1 && r.timeMs !== null) return raceTime(r.timeMs);
    if (r.gapMs !== null) return gapTime(r.gapMs);
    if (r.lapsDown !== null) return fill(plural(r.lapsDown, lang, labels.lapsDown), { n: r.lapsDown });
    return "—";
  };
  const who = (r: PrelimRow) =>
    r.slug ? (
      <a className="hm-ent" href={`${driverBase}/${r.slug}`}>
        <span>{r.name}</span>
      </a>
    ) : (
      <span className="hm-ent">
        <span>{r.name}</span>
      </span>
    );
  const tint = (r: PrelimRow) => (r.color ? ({ "--c": r.color } as CSSProperties) : undefined);
  return (
    <section className="hm-prelim" aria-labelledby="hm-prelim-h">
      <p className="hm-eyebrow">{labels.title}</p>
      <h3 className="display" id="hm-prelim-h">
        {gp}
      </h3>
      <ol className="hm-podium">
        {top.slice(0, 3).map((r) => (
          <li key={r.number} style={tint(r)}>
            <span className="hm-pod-p">P{r.position}</span>
            {who(r)}
            <span className="hm-pod-s">
              <span translate="no">{r.team}</span> · <span className="num">{cell(r)}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="hm-tbl" role="region" aria-label={labels.tableLabel} tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">{labels.pos}</th>
              <th scope="col">{labels.driver}</th>
              <th scope="col" className="hm-r">
                {labels.gap}
              </th>
              <th scope="col" className="hm-r">
                {labels.pts}
              </th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.number}>
                <td className="num hm-pos">{r.position ?? "—"}</td>
                <th scope="row">
                  <span className="hm-drv">
                    <i className="hm-stripe" style={tint(r)} aria-hidden="true" />
                    {who(r)}
                  </span>
                </th>
                <td className="hm-r num">{cell(r)}</td>
                <td className="hm-r num hm-pts">{r.points ? r.points : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hm-prelim-src">
        {labels.source} <a href={labels.sourcesHref}>{labels.sourcesLink}</a>
      </p>
    </section>
  );
}
