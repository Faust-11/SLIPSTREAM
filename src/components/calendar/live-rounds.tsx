"use client";

import { useEffect } from "react";
import { liveStates, useNow } from "./clock";

/**
 * Картки й клітинки смуги, що на збірку були «попереду» (data-race — початок гонки), отримують data-live за часом
 * клієнта: started / next / later. Атрибут не належить React (картки рендерить сервер, повний перелік і без JS), тож
 * оновлення не конфліктує з гідратацією; CSS показує «наступну» за data-live, а без нього — за станом збірки.
 */
export function LiveRounds({ rootId }: { rootId: string }) {
  const now = useNow();
  useEffect(() => {
    if (now === null) return;
    const root = document.getElementById(rootId);
    if (!root) return;
    for (const group of [".cl-strip > li[data-race]", ".cl-grid > li[data-race]"]) {
      const els = [...root.querySelectorAll<HTMLElement>(group)];
      const states = liveStates(els.map((el) => el.dataset.race ?? null), now);
      els.forEach((el, i) => (el.dataset.live = states[i]));
    }
  }, [now, rootId]);
  return null;
}
