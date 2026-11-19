"use client";

/** POST JSON на наш /api/…: той самий origin (cookie й перевірка Origin на сервері). Помилка мережі — status 0. */
export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<{ status: number; body: T }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
    return { status: res.status, body: ((await res.json().catch(() => ({}))) as T) };
  } catch {
    return { status: 0, body: {} as T };
  }
}
