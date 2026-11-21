"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/components/auth/account-store";
import { useHydrated } from "@/components/calendar/clock";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { fill } from "@/i18n/fill";
import { localizedPath } from "@/i18n/paths";
import { fmtDay } from "@/lib/fmt";
import { fmtLap, TRACK_KEYS, type TrackKey } from "@/lib/game/physics";
import { loadStore } from "@/lib/game/store";
import { sendLap, type SaveOutcome } from "./save-lap";

type Labels = Dictionary["gamePage"];
type Row = { place: number; player: string; ticks: number; jump: boolean; at: string };
type Board = { track: TrackKey; rows: Row[]; total: number } | { track: TrackKey; error: true };
type Mine = { track: TrackKey; lap: { ticks: number; jump: boolean; place: number } | null };

/** Текст відмови відправки (спільний для таблиці й результату кола). */
export function saveMessage(out: SaveOutcome, L: Labels): string {
  const t = L.lb;
  if (out.kind === "saved") return fill(t.saved, { place: out.place });
  if (out.kind === "kept") return fill(t.kept, { time: fmtLap(out.ticks), place: out.place });
  return t[out.reason];
}

export const loginHref = (locale: Locale) => `${localizedPath("/login", locale)}?next=${encodeURIComponent(localizedPath("/game", locale))}`;

/**
 * Таблиця лідерів під вікном гри: топ-10 вибраної траси (публічна, кешується CDN 30 с), своє місце й підказка про вхід.
 * Сторінка лишається статичною — дані підвантажує клієнт. `refresh` збільшується після збереженого кола: тоді таблицю
 * запитуємо повз кеш CDN (параметр v), щоб гравець одразу побачив себе.
 */
export function Leaderboard({ track, labels: L, locale, refresh }: { track: TrackKey; labels: Labels; locale: Locale; refresh: number }) {
  const account = useAccount();
  const t = L.lb;
  // Власна вкладка поверх траси гри: гравець може дивитись іншу трасу; вибір траси картками повертає таблицю до неї.
  const [pick, setPick] = useState<{ base: TrackKey; view: TrackKey } | null>(null);
  const shown = pick && pick.base === track ? pick.view : track;
  const [board, setBoard] = useState<Board | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [sent, setSent] = useState<{ for: string; out: SaveOutcome | "busy" } | null>(null);
  const [bump, setBump] = useState(0);
  const hydrated = useHydrated();
  const isUser = account.status === "user";

  useEffect(() => {
    let live = true;
    const url = `/api/game/leaderboard?track=${shown}${refresh + bump > 0 ? `&v=${refresh + bump}` : ""}`;
    fetch(url, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { rows: Row[]; total: number }) => {
        if (live) setBoard({ track: shown, rows: b.rows, total: b.total });
      })
      .catch(() => {
        if (live) setBoard({ track: shown, error: true });
      });
    return () => {
      live = false;
    };
  }, [shown, refresh, bump]);

  useEffect(() => {
    if (!isUser) return;
    let live = true;
    fetch(`/api/game/laps?track=${shown}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { mine: Mine["lap"] } | null) => {
        if (live && b) setMine({ track: shown, lap: b.mine });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [shown, isUser, refresh, bump]);

  const data = board && board.track === shown ? board : null;
  const rows = data && "rows" in data ? data.rows : null;
  const myLap = mine && mine.track === shown ? mine.lap : undefined; // undefined — ще не знаємо
  const nick = account.status === "user" ? account.nick : null;
  const local = isUser ? loadStore(shown).best : null;
  const canSend = isUser && myLap !== undefined && local !== null && (myLap === null || myLap.ticks > local.total);
  const state = sent && sent.for === shown ? sent.out : null;

  async function sendBest() {
    if (!local) return;
    setSent({ for: shown, out: "busy" });
    const out = await sendLap(shown, local.inputs, local.jump === true);
    setSent({ for: shown, out });
    if (out.kind === "saved") setBump((n) => n + 1);
  }

  const T = L.tracks[shown];
  const showMineRow = !!myLap && !!rows && !rows.some((r) => r.place === myLap.place && r.ticks === myLap.ticks && r.player === nick);

  return (
    <section className="gm-lb" aria-labelledby="gm-lb-h" id="gm-lb">
      <div className="gm-sec-head">
        <h2 className="display" id="gm-lb-h">
          {t.h}
        </h2>
      </div>
      <p className="gm-lb-lead">{t.lead}</p>
      <div className="gm-lb-tabs" role="group" aria-label={t.tabs}>
        {TRACK_KEYS.map((k) => (
          <button key={k} type="button" aria-pressed={k === shown} onClick={() => setPick({ base: track, view: k })}>
            {L.tracks[k].name}
          </button>
        ))}
      </div>

      <div className="gm-lb-body" aria-busy={data === null}>
        {data === null ? (
          <p className="gm-lb-state" role="status">
            {t.loading}
          </p>
        ) : "error" in data ? (
          <p className="gm-lb-state" role="status">
            {t.error}
          </p>
        ) : data.rows.length === 0 ? (
          <p className="gm-lb-state">{t.empty}</p>
        ) : (
          <div className="gm-lb-wrap">
            <table className="gm-lb-table">
              <caption className="sr-only">{fill(t.caption, { track: T.name })}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.cols.place}</th>
                  <th scope="col">{t.cols.player}</th>
                  <th scope="col" className="gm-lb-r">
                    {t.cols.time}
                  </th>
                  <th scope="col" className="gm-lb-r gm-lb-date">
                    {t.cols.date}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const you = nick !== null && r.player === nick && myLap?.ticks === r.ticks;
                  return (
                    <tr key={`${r.place}-${r.player}-${i}`} className={you ? "is-you" : undefined} aria-current={you ? "true" : undefined}>
                      <td className="num">{r.place}</td>
                      <th scope="row" translate="no">
                        {r.player}
                        {you && <span className="gm-lb-tag">{t.you}</span>}
                      </th>
                      <td className="gm-lb-r num">
                        {fmtLap(r.ticks)}
                        {r.jump && (
                          <abbr className="gm-lb-jump" title={t.jump} aria-label={t.jump}>
                            ⚑
                          </abbr>
                        )}
                      </td>
                      <td className="gm-lb-r gm-lb-date num">{fmtDay(r.at, locale, false)}</td>
                    </tr>
                  );
                })}
                {showMineRow && myLap && (
                  <tr className="is-you is-gap" aria-current="true">
                    <td className="num">{myLap.place}</td>
                    <th scope="row" translate="no">
                      {nick}
                      <span className="gm-lb-tag">{t.you}</span>
                    </th>
                    <td className="gm-lb-r num">{fmtLap(myLap.ticks)}</td>
                    <td className="gm-lb-r gm-lb-date" />
                  </tr>
                )}
              </tbody>
            </table>
            <p className="gm-lb-total">{fill(t.total, { n: data.total })}</p>
          </div>
        )}
      </div>

      {isUser ? (
        <div className="gm-lb-me">
          {myLap ? <p>{fill(t.mine, { place: myLap.place, time: fmtLap(myLap.ticks) })}</p> : myLap === null ? <p>{t.mineNone}</p> : null}
          {canSend && (
            <button type="button" className="gm-btn gm-lb-send" onClick={sendBest} disabled={state === "busy"}>
              {state === "busy" ? t.sendBusy : fill(t.sendBest, { time: fmtLap(local!.total) })}
            </button>
          )}
          <p className="gm-lb-msg" role="status">
            {state && state !== "busy" ? saveMessage(state, L) : ""}
            {state && state !== "busy" && state.kind === "error" && state.reason === "noNick" && (
              <>
                {" "}
                <a href={localizedPath("/profile", locale)}>{t.noNickCta}</a>
              </>
            )}
          </p>
        </div>
      ) : hydrated && account.status === "anon" ? (
        <div className="gm-lb-login">
          <h3>{t.loginH}</h3>
          <p>{t.loginP}</p>
          <a className="gm-btn gm-lb-cta" href={loginHref(locale)}>
            {t.loginCta}
          </a>
        </div>
      ) : null}
      <noscript>
        <p className="gm-lb-state">{t.noscript}</p>
      </noscript>
    </section>
  );
}
