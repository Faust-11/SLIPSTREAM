import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NAV } from "@/config/nav";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { Brand } from "./brand";
import { LangSwitch } from "./lang-switch";
import { Livery } from "./livery";
import { MainNav } from "./main-nav";
import { MobileMenu, type MenuItem } from "./mobile-menu";

export function navItems(locale: Locale, dict: Dictionary): MenuItem[] {
  return NAV.map((item) => ({ ...item, href: localizedPath(item.href, locale), label: dict.nav[item.key] }));
}

export function Header({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const items = navItems(locale, dict);
  return (
    <>
      <header className="site-head">
        <div className="wrap">
          <Brand href={localizedPath("/", locale)} label={dict.header.home} name="SLIPSTREAM" />
          <MainNav items={items} label={dict.header.mainNav} />
          <LangSwitch current={locale} label={dict.header.language} names={dict.header.languageNames} />
          <ThemeToggle labels={dict.theme} className="theme-btn" />
          <MobileMenu
            items={items}
            labels={{ open: dict.header.menu, nav: dict.header.mainNav }}
            extra={<ThemeToggle labels={dict.theme} className="mnav-theme" withText />}
          />
          <a className="mnav-fallback" href="#sections">
            {dict.header.menu} ↓
          </a>
        </div>
      </header>
      <Livery />
    </>
  );
}
