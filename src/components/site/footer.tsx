import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { Brand } from "./brand";
import { navItems } from "@/config/nav";

export function Footer({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <footer className="site-foot" data-mnav-inert>
      <div className="wrap">
        <div className="foot-brand">
          <Brand href={localizedPath("/", locale)} label={dict.header.home} name="SLIPSTREAM" />
          <p>{dict.footer.tagline}</p>
        </div>
        {/* Дублює головне меню: усі розділи досяжні й без JavaScript. */}
        <nav className="foot-nav" id="sections" aria-label={dict.footer.navLabel}>
          <ul>
            {navItems(locale, dict).map((item) => (
              <li key={item.key}>
                {/* Дубль меню: не передзавантажуємо (на коротких сторінках футер одразу у в'юпорті → 9 запитів). */}
                <Link href={item.href} prefetch={false}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="foot-legal">
          <span className="unofficial">{dict.footer.unofficial}</span>
          <p>{dict.footer.disclaimer}</p>
          {/* Службові сторінки (фаза 8): «Про сайт» і «Джерела й ліцензії» — лише у футері, не в головному меню. */}
          <nav className="foot-service" aria-label={dict.footer.serviceLabel}>
            <Link href={localizedPath("/about", locale)} prefetch={false}>
              {dict.footer.about}
            </Link>
            <Link href={localizedPath("/sources", locale)} prefetch={false}>
              {dict.footer.sources}
            </Link>
          </nav>
          <p className="credits">
            {dict.footer.dataLabel}:{" "}
            <a href="https://jolpi.ca" translate="no">
              Jolpica F1
            </a>{" "}
            · CC BY-NC-SA 4.0
          </p>
        </div>
      </div>
    </footer>
  );
}
