"use client";

import { useState } from "react";

type Props = {
  /** [номер перемоги, готовий рядок «дата · Гран-прі · команда · старт P1», id команди] — від нових до старих. */
  wins: [n: number, text: string, team: string][];
  /** Команди з перемогами (≥ 2 — показуємо фільтр). */
  teams: { id: string; name: string; count: number }[];
  labels: { filterLabel: string; all: string };
};

/** Повний перелік перемог з фільтром за командою. Без JS — увесь перелік (кнопки приховані стилем). */
export function WinsList({ wins, teams, labels }: Props) {
  const [team, setTeam] = useState("");
  const shown = team ? wins.filter((w) => w[2] === team) : wins;
  return (
    <>
      {teams.length > 1 && (
        <div className="wchips" role="group" aria-label={labels.filterLabel}>
          <button type="button" aria-pressed={team === ""} onClick={() => setTeam("")}>
            {labels.all}
          </button>
          {teams.map((t) => (
            <button key={t.id} type="button" aria-pressed={team === t.id} onClick={() => setTeam(t.id)}>
              <span translate="no">{t.name}</span> · {t.count}
            </button>
          ))}
        </div>
      )}
      {/* Номер перемоги — у value: після фільтра нумерація лишається наскрізною (17-та перемога — 17-та). */}
      <ol className="tscroll wlist" reversed aria-live="polite">
        {shown.map(([n, text]) => (
          <li key={n} value={n}>
            {text}
          </li>
        ))}
      </ol>
    </>
  );
}
