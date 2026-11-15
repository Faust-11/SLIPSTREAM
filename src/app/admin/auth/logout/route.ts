import { endSession, getAdmin } from "@/lib/admin/session";
import { siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Вихід — лише POST з нашого ж походження (форма в адмінці); GET-посилання з чужого сайту нічого не зробить. */
export async function POST(request: Request): Promise<Response> {
  const origin = siteUrl().origin;
  if (request.headers.get("origin") !== origin || !(await getAdmin())) return new Response("Not Found", { status: 404 });
  await endSession();
  return new Response(null, { status: 303, headers: { Location: new URL("/", origin).href, "Cache-Control": "no-store" } });
}
