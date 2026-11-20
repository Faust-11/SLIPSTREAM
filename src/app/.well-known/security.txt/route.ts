import { securityTxt } from "@/lib/security-txt";
import { contactEmail } from "@/lib/service/content";
import { siteUrl } from "@/lib/seo";

// Раз на добу перераховуємо Expires (див. src/lib/security-txt.ts).
export const revalidate = 86400;

export function GET() {
  const body = securityTxt(contactEmail(), siteUrl().origin);
  // Без контактної адреси файл не віддаємо: security.txt без Contact недійсний.
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
