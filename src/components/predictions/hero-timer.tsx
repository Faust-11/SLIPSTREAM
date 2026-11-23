"use client";

import Link from "next/link";
import { useAccount } from "@/components/auth/account-store";
import { timeLeftSeconds, useHydrated, useNowSeconds } from "@/components/calendar/clock";
import { LocalTime, TzNote } from "@/components/calendar/local-time";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import type { PredictionsText } from "./types";

export type HeroRound = { round: number; gp: string; deadlineAt: string | null; href: string };
export type TimerUnits = { days: string; hours: string; minutes: string; seconds: string };

/**
 * Таймер першого екрана сторінки прогнозів: скільки лишилось до закриття найближчого ВІДКРИТОГО етапу (за годинником
 * браузера, крок 1 с — як відлік на головній) і кнопка до нього. Сервер і перший кадр — «—»: сторінка статична, часу «зараз»
 * на ній немає, а етап, що закрився після збірки, не повинен мигнути. Гість (після гідратації акаунт-стор каже «анонім»)
 * бачить «Увійдіть, щоб зробити прогноз» із поверненням на етап; без JS — звичайне посилання на перший етап із відомим дедлайном.
 */
export function HeroTimer({
  rounds,
  locale,
  text,
  units,
  timerLabel,
  loginHref,
}: {
  rounds: HeroRound[];
  locale: Locale;
  text: PredictionsText;
  units: TimerUnits;
  timerLabel: string;
  loginHref: string;
}) {
  const now = useNowSeconds();
  const hydrated = useHydrated();
  const account = useAccount();
  const ready = now !== null;
  const target = ready ? (rounds.find((r) => r.deadlineAt !== null && Date.parse(r.deadlineAt) > now) ?? null) : null;
  // До гідратації кнопка веде на перший етап із відомим дедлайном (посилання працює й без JS).
  const link = target ?? (ready ? null : (rounds.find((r) => r.deadlineAt !== null) ?? null));
  const c = target?.deadlineAt && ready ? timeLeftSeconds(Date.parse(target.deadlineAt) - now - 1) : null;
  const guest = hydrated && account.status === "anon";
  const state = !ready ? "wait" : target ? "open" : "none";
  return (
    <div className="pd-timer" data-state={state}>
      <p className="pd-timer-lab">{text.round.deadlineLabel}</p>
      <p className="pd-timer-gp">{target ? `${fill(text.roundN, { n: target.round })} · ${target.gp}` : "—"}</p>
      {state === "none" ? (
        <p className="pd-timer-none">{text.heroNone}</p>
      ) : (
        <>
          <div className="pd-count" role="timer" aria-label={timerLabel}>
            {(
              [
                [c?.d, units.days],
                [c?.h, units.hours],
                [c?.m, units.minutes],
                [c?.s, units.seconds],
              ] as const
            ).map(([v, l], i) => (
              <div key={l}>
                {/* Хвилини й секунди — завжди дві цифри: ширина не стрибає щосекунди. */}
                <b className="num">{v === undefined ? "—" : i >= 2 ? String(v).padStart(2, "0") : v}</b>
                <span>{l}</span>
              </div>
            ))}
          </div>
          <div className="pd-timer-when">
            {target?.deadlineAt ? (
              <>
                <p>
                  {text.deadline} <LocalTime iso={target.deadlineAt} locale={locale} />
                </p>
                <TzNote utc={text.tz.utc} local={text.tz.local} />
              </>
            ) : null}
          </div>
        </>
      )}
      {link ? (
        <Link className="pd-cta" href={guest ? `${loginHref}?next=${encodeURIComponent(link.href)}` : link.href} data-signin={guest ? "" : undefined}>
          {guest ? text.round.signIn.h : text.make}
        </Link>
      ) : null}
      {guest && link ? <p className="pd-timer-fine">{text.round.signIn.text}</p> : null}
    </div>
  );
}
