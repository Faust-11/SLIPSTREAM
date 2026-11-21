"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { weekendWeatherDue } from "@/lib/weather";
import { WeatherSkeleton } from "./skeleton";
import type { WeekendWeatherProps } from "./weekend-weather";
import "./weather.css";

// Код блока й запит — окремий чанк, завантажується лише коли місце під блок наблизилось до екрана (головна на межі
// Lighthouse: TBT/FCP). Поки далеко — лише заглушка тієї ж висоти.
const WeekendWeather = dynamic(() => import("./weekend-weather").then((m) => m.WeekendWeather), { ssr: false, loading: () => null });

const noSubscribe = () => () => {};
const serverDue = () => false;

/**
 * Обгортка «Погоди вікенду» для картки наступної гонки. Сервер лише передає етап (будь-який наступний з 2023); чи
 * показувати, вирішує браузер за своїм годинником (гонка не далі ніж через 12 діб і не раніше ніж 3 доби тому) —
 * збірка не залежить від дати, а далекий етап не робить запиту й не лишає порожнього місця. До запиту — IntersectionObserver
 * із запасом 300 px: на головній, де панель нижче першого екрана, ні код, ні fetch не вантажаться до прокрутки.
 */
export function LazyWeekendWeather({ raceAt, ...props }: Omit<WeekendWeatherProps, "onEmpty"> & { raceAt: string | null }) {
  const due = useSyncExternalStore(noSubscribe, () => weekendWeatherDue(raceAt, Date.now()), serverDue);
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [empty, setEmpty] = useState(false);
  const onEmpty = useCallback(() => setEmpty(true), []);

  useEffect(() => {
    const el = ref.current;
    if (!due || near || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setNear(true), 2000);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [due, near]);

  return (
    <div ref={ref} className="ww-slot" hidden={!due || empty}>
      {near ? <WeekendWeather {...props} onEmpty={onEmpty} /> : <WeatherSkeleton n={props.kinds.length} />}
    </div>
  );
}
