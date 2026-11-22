"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useNow } from "@/components/calendar/clock";
import type { Locale } from "@/i18n/config";
import { followingShown } from "@/lib/next-race";
import type { PrelimResults } from "@/lib/prelim";
import type { PrelimLabels } from "./prelim-card";

// Код картки — окремий чанк: потрібен лише тоді, коли OpenF1 уже віддав результати (рідкісний стан між фінішем і data-sync).
const PrelimCard = dynamic(() => import("./prelim-card"), { ssr: false, loading: () => null });

/** Повторний запит, поки OpenF1 ще не віддав результатів (на сервері кеш 5 хв — частіше немає сенсу). */
const RETRY_MS = 5 * 60_000;

/**
 * Слот «результати ще не оновились» над минулою гонкою (видимий, коли етап завершився за часом — data-hm-next=b на корені).
 * Спершу — чесний рядок; коли /api/prelim віддав попередні результати OpenF1 — картка замість нього. Запит — лише коли етап
 * уже завершився за годинником браузера й слот наблизився до екрана (IntersectionObserver); без них — жодного запиту до API.
 */
export function HmPending({ text, lang, year, round, endAt, gp, labels, driverBase }: { text: string; lang: Locale; year: number; round: number; endAt: number | null; gp: string; labels: PrelimLabels; driverBase: string }) {
  const now = useNow();
  const due = now !== null && followingShown(now, endAt);
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [data, setData] = useState<PrelimResults | null>(null);

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

  useEffect(() => {
    if (!near || data) return;
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      fetch(`/api/prelim/${lang}/${year}/${round}`, { signal: ctl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<PrelimResults>) : Promise.reject(new Error(String(r.status)))))
        .then((d) => (Array.isArray(d.rows) && d.rows.length > 0 ? setData(d) : Promise.reject(new Error("empty"))))
        .catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === "AbortError")) timer = setTimeout(load, RETRY_MS);
        });
    };
    load();
    return () => {
      ctl.abort();
      clearTimeout(timer);
    };
  }, [near, data, lang, year, round]);

  return (
    <div ref={ref} className={data ? "hm-pending hm-pending-card" : "hm-pending"} role={data ? undefined : "status"}>
      {data ? <PrelimCard data={data} gp={gp} lang={lang} labels={labels} driverBase={driverBase} /> : <p>{text}</p>}
    </div>
  );
}
