import "server-only";
import { siteUrl } from "@/lib/seo";

/** Спільне для обробників /api/auth/* і /api/session: той самий origin, JSON без кешу, малий ліміт тіла. */
export function sameOrigin(request: Request): boolean {
  return request.headers.get("origin") === siteUrl().origin;
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
    if (text.length > maxBytes) return null;
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
