"use client";

import { useEffect, useRef } from "react";
import { TURNSTILE_SCRIPT } from "@/lib/play/turnstile";

type TurnstileApi = {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi | null> | null = null;

/** Скрипт Cloudflare — один раз на сторінку, лише коли форма входу змонтована й ключ є. null — не завантажився (блокувальник, мережа). */
function loadTurnstile(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SCRIPT;
    s.async = true;
    s.onload = () => resolve(window.turnstile ?? null);
    s.onerror = () => {
      s.remove();
      loading = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Віджет Turnstile (режим Managed, appearance interaction-only — видно лише коли потрібна дія). Токен одноразовий: після
 * кожної відправки батько збільшує `resetSignal` — віджет скидається й чекає новий токен. Колбеки: onToken(токен) — готово;
 * onToken(null) — токен протух і оновлюється (expired); onFail — помилка віджета чи скрипт не завантажився.
 * Розмір compact — вузький екран (320 px) без горизонтальної прокрутки.
 */
export function TurnstileWidget({
  siteKey,
  lang,
  resetSignal,
  onToken,
  onFail,
}: {
  siteKey: string;
  lang: string;
  resetSignal: number;
  onToken: (token: string | null) => void;
  onFail: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  // Колбеки — у ref, щоб зміна пропсів не перемальовувала віджет.
  const cb = useRef({ onToken, onFail });
  useEffect(() => {
    cb.current = { onToken, onFail };
  });

  useEffect(() => {
    let dead = false;
    void loadTurnstile().then((api) => {
      if (dead) return;
      if (!api || !box.current) return cb.current.onFail();
      const id = api.render(box.current, {
        sitekey: siteKey,
        appearance: "interaction-only",
        size: "compact",
        theme: "auto",
        language: lang,
        callback: (t: string) => cb.current.onToken(t),
        "expired-callback": () => cb.current.onToken(null),
        "error-callback": () => cb.current.onFail(),
      });
      widget.current = { api, id };
    });
    return () => {
      dead = true;
      const w = widget.current;
      widget.current = null;
      if (w) w.api.remove(w.id);
    };
  }, [siteKey, lang]);

  // Скидання після відправки (не на першому рендері: віджет ще не створено).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const w = widget.current;
    if (w) w.api.reset(w.id);
  }, [resetSignal]);

  return <div ref={box} className="au-turnstile" />;
}
