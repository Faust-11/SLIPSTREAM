"use client";

import { useEffect, useRef, useState } from "react";
import { useHydrated } from "@/components/calendar/clock";

export type LightsLabels = {
  idle: string;
  arm: string;
  hot: string;
  again: string;
  hint: string;
  wait: string;
  jumpH: string;
  jump: string;
  result: string;
  unit: string;
  noJs: string;
};

type State = "idle" | "arm" | "hot";
type Last = null | "jump" | number;

/** Пауза між п'ятою парою і «вогні гаснуть» (як на справжньому старті — випадкова): 0,2–3 с. */
export const holdMs = (rnd: number) => 200 + rnd * 2800;

/**
 * Гра «Спробуйте старт» (макет «Новачкам»): 5 пар вогнів загоряються щосекунди, гаснуть після випадкової паузи; результат —
 * час реакції. `pointerdown`, а не `click` (click приходить після відпускання й додає ~100 мс); Enter/Пробіл — те саме.
 * Без JS — лише вогні й підказка (кнопка з'являється після гідратації). Результат не зберігаємо (рекорди — фаза 9).
 */
export function StartLights({ t, locale }: { t: LightsLabels; locale: string }) {
  const [state, setState] = useState<State>("idle");
  const [lit, setLit] = useState(0);
  const [last, setLast] = useState<Last>(null);
  const ready = useHydrated();
  const timers = useRef<number[]>([]);
  const t0 = useRef(0);
  const stateRef = useRef<State>("idle");

  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  const go = (s: State) => {
    stateRef.current = s;
    setState(s);
  };

  useEffect(() => clear, []);

  const press = () => {
    const s = stateRef.current;
    if (s === "idle") {
      setLast(null);
      setLit(0);
      go("arm");
      for (let i = 1; i <= 5; i++) timers.current.push(window.setTimeout(() => setLit(i), i * 1000));
      timers.current.push(
        window.setTimeout(() => {
          setLit(0);
          t0.current = performance.now();
          go("hot");
        }, 5000 + holdMs(Math.random())),
      );
    } else if (s === "arm") {
      clear();
      setLit(0);
      setLast("jump");
      go("idle");
    } else {
      setLast(Math.round(performance.now() - t0.current));
      go("idle");
    }
  };

  const label = state === "idle" ? (last === null ? t.idle : t.again) : state === "arm" ? t.arm : t.hot;
  const secs = typeof last === "number" ? new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(last / 1000) : null;

  return (
    <>
      <div className="nb-lights" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={i < lit ? "nb-pod nb-on" : "nb-pod"}>
            <i />
            <i />
          </div>
        ))}
      </div>
      {ready ? (
        <button
          type="button"
          className={state === "hot" ? "nb-go nb-hot" : "nb-go"}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            press();
          }}
          // Активація читачем екрана / голосом — синтетичний click без pointerdown (detail 0); мишачий click після pointerdown — ігнор.
          onClick={(e) => {
            if (e.detail === 0) press();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!e.repeat) press();
            }
          }}
        >
          {label}
        </button>
      ) : (
        <p className="nb-nojs">{t.noJs}</p>
      )}
      <p className="nb-res" role="status">
        {state === "arm" ? (
          t.wait
        ) : last === "jump" ? (
          <>
            <b>{t.jumpH}</b> {t.jump}
          </>
        ) : secs !== null ? (
          <>
            <b className="num">
              {secs} {t.unit}
            </b>{" "}
            {t.result}
          </>
        ) : (
          t.hint
        )}
      </p>
    </>
  );
}
