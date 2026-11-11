import Link from "next/link";
import { lang } from "next/root-params";
import { navItems } from "@/components/site/header";
import { defaultLocale, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";

// Явний notFound() зі сторінки (сервер віддає порожній HTML — vercel/next.js#62228; мова — після гідратації).
// Невідомі адреси обробляє global-not-found.tsx.
export default async function NotFound() {
  const value = await lang();
  const locale = isLocale(value) ? value : defaultLocale;
  const dict = await getDictionary(locale);

  return (
    <section className="section-hero not-found" data-section="not-found">
      <div className="wrap">
        <p className="eyebrow">404</p>
        <h1 className="display">{dict.notFound.title}</h1>
        <div className="hero-actions">
          <Link className="btn" href={localizedPath("/", locale)}>
            {dict.notFound.home}
          </Link>
        </div>
        <nav aria-label={dict.notFound.sections} className="nf-sections">
          <ul>
            {navItems(locale, dict).map((item) => (
              <li key={item.key}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
