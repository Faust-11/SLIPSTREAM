import "server-only";
/**
 * Спільне для обробників /api/auth/* і /api/session: той самий origin, JSON без кешу, малий ліміт тіла.
 *
 * Origin має збігатися з ХОСТОМ запиту (x-forwarded-host, інакше Host), а не з SITE_URL: сайт відкривається і за outlap.org,
 * і за www, і за адресою *.vercel.app — порівняння з однією «канонічною» адресою відхиляло б законні запити з інших
 * псевдонімів. Підробити Origin з чужої сторінки браузер не дає; відсутній Origin (не-браузер) — відмова.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && url.host === host;
  } catch {
    return false;
  }
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

export async function readJson(request: Request, maxBytes = 2048): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > maxBytes) return null; // байти, не одиниці UTF-16: кирилиця — 2 байти на літеру
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
