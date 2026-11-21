"use client";

import { useEffect, useState } from "react";
import type { WeatherSession } from "@/lib/weather";

export type WeatherPayload = { sessions: WeatherSession[] };

/**
 * Погода вікенду з /api/weather/<рік>/<етап> (ISR 10 хв). null — ще чекаємо (або `enabled` = false: запиту нема), "error" —
 * джерела недоступні чи етапу нема (блок не показуємо). Один запит на монтування, при розмонтуванні скасовується.
 */
export function useWeather(year: number, round: number, enabled = true): WeatherPayload | "error" | null {
  const [data, setData] = useState<WeatherPayload | "error" | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    fetch(`/api/weather/${year}/${round}`, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<WeatherPayload>) : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setData("error");
      });
    return () => ctl.abort();
  }, [year, round, enabled]);

  return data;
}
