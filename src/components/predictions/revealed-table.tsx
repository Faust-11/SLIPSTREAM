"use client";

import { useId } from "react";
import { fill } from "@/i18n/fill";
import type { PickDriver, PickTeam } from "@/lib/data/predictions";
import { REVEALED_LIMIT, SLOTS, type PredictionKind } from "@/lib/play/predictions";
import type { PredictionsText, RevealedRow } from "./types";

/**
 * Прогнози всіх гравців на етап — лише після дедлайну (їх віддає публічне подання бази, до дедлайну воно порожнє).
 * Видно публічне ім'я (нік) і прогноз; пошти й ідентифікаторів немає. Таблиця прокручується всередині власної області
 * (role=region + tabindex — доступна з клавіатури), колонка гравця «прилипає» зліва, тож на 320 px ім'я не губиться.
 */
export function RevealedTable({ kind, rows, drivers, teams, me, text }: {
  kind: PredictionKind;
  rows: RevealedRow[];
  drivers: PickDriver[];
  teams: PickTeam[];
  /** Мій нік — рядок підсвічується позначкою «ви». */
  me: string | null;
  text: PredictionsText;
}) {
  const cap = useId();
  const r = text.round.revealed;
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const teamById = new Map(teams.map((x) => [x.id, x]));
  const list = rows.filter((x) => x.kind === kind);
  if (list.length === 0) return null;
  return (
    <div role="region" tabIndex={0} aria-labelledby={cap} className="pd-scroll">
      <table className="pd-table">
        <caption id={cap}>{kind === "Q" ? r.captionQ : r.captionR}</caption>
        <thead>
          <tr>
            <th scope="col">{r.player}</th>
            <th scope="col" className="pd-num">
              {r.points}
            </th>
            {Array.from({ length: SLOTS }, (_, i) => (
              <th scope="col" key={i} className="pd-num" aria-label={fill(text.round.slot, { n: i + 1 })}>
                {i + 1}
              </th>
            ))}
            {kind === "R" ? <th scope="col">{r.dnf}</th> : null}
          </tr>
        </thead>
        <tbody>
          {list.map((row, n) => (
            <tr key={`${row.player}-${n}`}>
              <th scope="row">
                {row.player}
                {me !== null && row.player === me ? <span className="pd-you"> ({r.you})</span> : null}
              </th>
              <td className="pd-num">{row.points ?? "—"}</td>
              {row.picks.map((id, i) => (
                <td key={i} className="pd-num" title={id !== null ? byId.get(id)?.name : undefined}>
                  {id === null ? "·" : (byId.get(id)?.code ?? r.unknown)}
                </td>
              ))}
              {kind === "R" ? <td>{row.allFinish ? r.allFinish : row.dnfTeam !== null ? (teamById.get(row.dnfTeam)?.name ?? r.unknown) : "—"}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {list.length >= REVEALED_LIMIT ? <p className="au-hint pd-limit">{fill(r.limit, { n: REVEALED_LIMIT })}</p> : null}
    </div>
  );
}
