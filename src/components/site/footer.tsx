import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { Brand } from "./brand";
import { navItems } from "./header";

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
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="foot-legal">
          <span className="unofficial">{dict.footer.unofficial}</span>
          <p>{dict.footer.disclaimer}</p>
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
