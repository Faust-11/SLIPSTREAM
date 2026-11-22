"use client";

import { useLayoutEffect } from "react";
import { useNow } from "@/components/calendar/clock";
import { followingShown } from "@/lib/next-race";

/**
 * Тримає атрибут `data-hm-next` (a — показано «наступний» за збіркою, b — наступний за ним) на корені головної за часом
 * клієнта. До гідратації це робить inline-скрипт (nextSwitchScript — без мерехтіння на першому кадрі), тут — той самий
 * вибір для клієнтського переходу на головну (скрипти тоді не виконуються) і для сторінки, відкритої довго: гонка
 * завершується, поки вкладка відкрита. Атрибут не належить React (корінь рендерить сервер; suppressHydrationWarning).
 */
export function HmNextSwitch({ endAt }: { endAt: number | null }) {
  const now = useNow();
  useLayoutEffect(() => {
    if (now === null) return;
    const root = document.querySelector<HTMLElement>("[data-section=home]");
    if (root) root.setAttribute("data-hm-next", followingShown(now, endAt) ? "b" : "a");
  }, [now, endAt]);
  return null;
}
