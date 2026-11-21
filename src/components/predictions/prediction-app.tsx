"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LocalTime, TzNote } from "@/components/calendar/local-time";
import { useHydrated, useNow } from "@/components/calendar/clock";
import { useAccount } from "@/components/auth/account-store";
import { NickForm, type NickText } from "@/components/auth/nick-form";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import type { PickDriver, PickTeam } from "@/lib/data/predictions";
import { countdown } from "@/lib/play/countdown";
import { KindForm } from "./kind-form";
import { RevealedTable } from "./revealed-table";
import type { PredictionsText, RoundApi, SavedPrediction } from "./types";

type Fetched = { ok: true; body: RoundApi; offset: number } | { ok: false };

/** Стан етапу з нашого API. Різниця годинників рахується в момент відповіді (час сервера мінус час браузера). */
async function fetchRound(year: number, round: number): Promise<Fetched> {
  try {
    const res = await fetch(`/api/predictions?year=${year}&round=${round}`, { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as RoundApi;
    return { ok: true, body, offset: body.now - Date.now() };
  } catch {
    return { ok: false };
  }
}

/**
 * Сторінка прогнозу на етап. Статичний HTML несе лише шапку й довідник пілотів; стан (дедлайн, хто я, мої й чужі прогнози)
 * читається з /api/predictions після гідратації — той самий origin, тож CSP connect-src 'self' не змінюється.
 *  - Відлік рахується за годинником СЕРВЕРА (різниця now − Date.now() у момент відповіді), а не за годинником браузера.
 *  - Дедлайн остаточно тримає база: коли відлік обнулився або збереження дало 409, сторінка перечитує стан і переходить у
 *    «лише перегляд» (там же з'являються чужі прогнози).
 */
export function PredictionApp({ text, nickText, locale, year, round, deadlineAt, drivers, teams, loginHref, selfHref }: {
  text: PredictionsText;
  nickText: NickText;
  locale: Locale;
  year: number;
  round: number;
  /** Дедлайн за розкладом календаря на момент збірки — для першого кадру; далі його заміняє відповідь бази. */
  deadlineAt: string | null;
  drivers: PickDriver[];
  teams: PickTeam[];
  loginHref: string;
  /** Адреса цієї сторінки (для ?next= після входу). */
  selfHref: string;
}) {
  const t = text.round;
  const [api, setApi] = useState<RoundApi | null>(null);
  const [failed, setFailed] = useState(false);
  const [offset, setOffset] = useState(0);
  const now = useNow();
  const hydrated = useHydrated();
  const account = useAccount();
  const retries = useRef(0);
  const prevClosed = useRef<boolean | null>(null);
  const statusRef = useRef<HTMLElement>(null);

  const apply = useCallback((res: Fetched) => {
    if (res.ok) {
      setOffset(res.offset);
      setApi(res.body);
      setFailed(false);
    } else setFailed(true);
  }, []);
  const load = useCallback(() => void fetchRound(year, round).then(apply), [year, round, apply]);

  useEffect(() => {
    let alive = true;
    void fetchRound(year, round).then((res) => {
      if (alive) apply(res);
    });
    return () => {
      alive = false;
    };
  }, [year, round, apply]);

  const deadline = api ? api.deadline : deadlineAt;
  const deadlineMs = deadline ? Date.parse(deadline) : null;
  const serverNow = now === null ? null : now + offset;
  const closedByClock = deadlineMs !== null && serverNow !== null && serverNow >= deadlineMs;
  const closed = api ? api.closed || closedByClock : false;
  // Пропозиція входу — одразу, не чекаючи відповіді API: немає позначки сесії (акаунт-стор: «анонім») — гість точно не ввійшов.
  // Коли API відповів — слово за ним (позначка могла лишитись від минулої, вже недійсної сесії). Закритий етап входу не потребує.
  const needSignIn = api ? !api.signedIn && !api.unavailable && !closed : hydrated && account.status === "anon" && !closedByClock;

  // Відлік дійшов до нуля, а сервер ще каже «відкрито» (годинник сервера трохи відстає від бази): перечитуємо одразу, далі ще двічі
  // з паузою (2 с, 5 с) і зупиняємось — не вічний цикл запитів; щойно сервер підтверджує «закрито», лічильник скидається (рев'ю 21.11, I).
  const lagging = !!api && !api.closed && closedByClock;
  useEffect(() => {
    if (!api) return;
    if (!lagging) {
      if (api.closed) retries.current = 0;
      return;
    }
    const attempt = retries.current;
    if (attempt > 2) return;
    const timer = setTimeout(() => {
      retries.current = attempt + 1;
      load();
    }, attempt === 0 ? 0 : attempt === 1 ? 2000 : 5000);
    return () => clearTimeout(timer);
  }, [api, lagging, load]);

  // Форма розмонтовується при переході «відкрито → закрито» — фокус, що був у ній, зникає: переносимо його на блок стану.
  // Перший кадр, який уже «закрито», фокус не краде (prevClosed тоді ще null).
  useEffect(() => {
    if (!api) return;
    if (prevClosed.current === false && closed) statusRef.current?.focus();
    prevClosed.current = closed;
  }, [api, closed]);

  const left = deadlineMs !== null && serverNow !== null ? deadlineMs - serverNow : null;
  const player = api?.user ?? null;
  const mine = api?.mine ?? null;
  const reveal = api?.revealed ?? null;

  return (
    <div className="pd-app">
      {needSignIn ? (
        <section className="au-card pd-signin" aria-labelledby="pd-signin">
          <h2 className="au-h" id="pd-signin">
            {t.signIn.h}
          </h2>
          <p className="au-note">{t.signIn.text}</p>
          <Link className="btn au-btn" href={`${loginHref}?next=${encodeURIComponent(selfHref)}`}>
            {t.signIn.cta}
          </Link>
        </section>
      ) : null}

      <section className="pd-deadline au-card" ref={statusRef} tabIndex={-1} aria-label={t.deadlineLabel}>
        <p className="au-label">{t.deadlineLabel}</p>
        {deadline ? (
          <p className="pd-when">
            <LocalTime iso={deadline} locale={locale} />
          </p>
        ) : (
          <p className="au-note">{text.noTime}</p>
        )}
        <p className="pd-left" data-soon={left !== null && left > 0 && left < 24 * 3_600_000 ? "" : undefined}>
          {api === null ? "" : closed || deadlineMs === null ? t.closedLead : left !== null ? fill(t.remaining, { t: countdown(left, locale).text }) : ""}
        </p>
        <TzNote utc={text.tz.utc} local={text.tz.local} />
      </section>

      {api === null ? (
        failed ? (
          <div className="au-card" role="alert">
            <p className="au-err">{t.unavailable}</p>
            <button className="btn btn-ghost au-btn" type="button" onClick={load}>
              {t.retry}
            </button>
          </div>
        ) : (
          <p className="au-note au-card pd-loading" role="status">
            {t.loading}
          </p>
        )
      ) : (
        <>
          {api.unavailable ? (
            <p className="au-err au-card" role="alert">
              {t.unavailable}
            </p>
          ) : null}

          {!closed && player !== null && player.nick === null ? (
            <div className="au-card">
              <NickForm text={nickText} onDone={load} autoFocus />
            </div>
          ) : null}

          {!closed && player?.nick ? (
            <>
              <p className="au-note pd-as">{fill(t.playingAs, { nick: player.nick })}</p>
              <div className="pd-kinds">
                {(["Q", "R"] as const).map((kind) => (
                  <KindForm
                    key={kind}
                    kind={kind}
                    year={year}
                    round={round}
                    drivers={drivers}
                    teams={teams}
                    initial={mine?.[kind] ?? null}
                    text={text}
                    onClosed={load}
                    onNoProfile={load}
                    onUnauthorized={load}
                  />
                ))}
              </div>
            </>
          ) : null}

          {closed ? (
            <>
              <MineReadOnly mine={mine} drivers={drivers} teams={teams} text={text} signedIn={player !== null} />
              <section className="pd-reveal" aria-labelledby="pd-reveal-h">
                <h2 className="au-h" id="pd-reveal-h">
                  {t.revealed.h}
                </h2>
                <p className="au-note">{t.revealed.lead}</p>
                {reveal && reveal.length > 0 ? (
                  <>
                    <RevealedTable kind="Q" rows={reveal} drivers={drivers} teams={teams} me={player?.publicName ?? null} text={text} />
                    <RevealedTable kind="R" rows={reveal} drivers={drivers} teams={teams} me={player?.publicName ?? null} text={text} />
                  </>
                ) : (
                  <p className="au-note">{reveal ? t.revealed.none : ""}</p>
                )}
              </section>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Мій прогноз у режимі «лише перегляд» (після дедлайну). */
function MineReadOnly({ mine, drivers, teams, text, signedIn }: { mine: RoundApi["mine"]; drivers: PickDriver[]; teams: PickTeam[]; text: PredictionsText; signedIn: boolean }) {
  const t = text.round;
  if (!signedIn) return null;
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const teamById = new Map(teams.map((x) => [x.id, x]));
  const any = mine && (mine.Q || mine.R);
  return (
    <section className="pd-mine" aria-labelledby="pd-mine-h">
      <h2 className="au-h" id="pd-mine-h">
        {t.mine.h}
      </h2>
      {any ? (
        <div className="pd-kinds">
          {(["Q", "R"] as const).map((kind) => {
            const p: SavedPrediction | null = mine?.[kind] ?? null;
            if (!p) return null;
            return (
              <div className="au-card" key={kind}>
                <h3 className="au-label">{t.kinds[kind].h}</h3>
                <ol className="pd-readonly">
                  {p.picks.map((id, i) => {
                    const d = id === null ? undefined : byId.get(id);
                    return (
                      <li key={i}>
                        <span className="pd-dot" style={d ? { background: d.color } : undefined} aria-hidden="true" />
                        <span>{id === null ? t.none : (d?.short ?? t.gone)}</span>
                      </li>
                    );
                  })}
                </ol>
                {kind === "R" ? (
                  <p className="au-note">
                    {t.dnf.label}: {p.allFinish ? t.dnf.all : p.dnfTeam !== null ? (teamById.get(p.dnfTeam)?.name ?? t.goneTeam) : t.dnf.none}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="au-note">{t.mine.none}</p>
      )}
    </section>
  );
}
