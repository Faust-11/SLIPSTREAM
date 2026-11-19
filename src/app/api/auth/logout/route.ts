import { json, sameOrigin } from "@/lib/play/http";
import { revokeSession } from "@/lib/play/gotrue";
import { playConfig } from "@/lib/play/config";
import { SESSION_COOKIE, decodeSession } from "@/lib/play/cookie";
import { clearPlaySession } from "@/lib/play/session";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/** Вихід: токен відкликаємо в Supabase (найкращим зусиллям), cookie знімаємо завжди. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { error: "origin" });
  const cfg = playConfig();
  const pair = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (cfg && pair) await revokeSession(cfg, pair.a);
  await clearPlaySession();
  return json(200, { ok: true });
}
