"use client";

import { postJson } from "@/components/auth/post";
import type { TrackKey } from "@/lib/game/physics";

/** Исход отправки круга в таблицу лидеров (ответ /api/game/laps → понятный интерфейсу вид). */
export type SaveOutcome =
  | { kind: "saved"; place: number; ticks: number }
  | { kind: "kept"; place: number; ticks: number }
  | { kind: "error"; reason: "noNick" | "blocked" | "rate" | "invalid" | "unavailable" | "session" };

/**
 * Отправить коло: сервер сам повторює заїзд за вводом і рахує час (клієнтський не передається). saved=false — власне коло гравця
 * в таблиці не гірше: показуємо його час і місце («kept»).
 */
export async function sendLap(track: TrackKey, inputs: string, jump: boolean): Promise<SaveOutcome> {
  const res = await postJson<{ error?: string; saved?: boolean; place?: number; ticks?: number }>("/api/game/laps", { track, inputs, jump });
  if (res.status === 200 && typeof res.body.place === "number" && typeof res.body.ticks === "number") {
    return { kind: res.body.saved ? "saved" : "kept", place: res.body.place, ticks: res.body.ticks };
  }
  if (res.status === 401) return { kind: "error", reason: "session" };
  if (res.status === 403) return { kind: "error", reason: res.body.error === "blocked" ? "blocked" : "noNick" };
  if (res.status === 400) return { kind: "error", reason: "invalid" };
  if (res.status === 429) return { kind: "error", reason: "rate" };
  return { kind: "error", reason: "unavailable" };
}
