import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_HEADER, resolveLocaleRoute } from "@/i18n/paths";

export function proxy(request: NextRequest) {
  const route = resolveLocaleRoute(request.nextUrl.pathname);

  if (route.kind === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = route.pathname;
    return NextResponse.redirect(url, 308);
  }

  // Мова запиту для global-not-found (у нього немає params). Значення клієнта завжди перезаписуємо.
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, route.locale);

  if (route.kind === "next") return NextResponse.next({ request: { headers } });

  const url = request.nextUrl.clone();
  url.pathname = route.pathname;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Не чіпаємо службові шляхи Next і файли з розширенням (public/, robots.txt, sitemap.xml, icon.svg):
  // rewrite на /en зламав би їх, бо proxy виконується раніше за роздачу файлів.
  matcher: ["/((?!_next/|.*\\.[A-Za-z0-9]+$).*)"],
};
