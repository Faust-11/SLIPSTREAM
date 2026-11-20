import { AccountLink } from "@/components/auth/account-link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { navItems } from "@/config/nav";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { Brand } from "./brand";
import { LangSwitch } from "./lang-switch";
import { Livery } from "./livery";
import { MainNav } from "./main-nav";
import { MobileMenu } from "./mobile-menu";

export function Header({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const items = navItems(locale, dict);
  const account = { labels: { signIn: dict.auth.signIn, account: dict.auth.account, accountNick: dict.auth.accountNick }, loginHref: localizedPath("/login", locale), profileHref: localizedPath("/profile", locale) };
  return (
    <>
      <header className="site-head">
        <div className="wrap">
          <Brand href={localizedPath("/", locale)} label={dict.header.home} />
          <MainNav items={items} label={dict.header.mainNav} />
          <LangSwitch current={locale} label={dict.header.language} names={dict.header.languageNames} />
          <ThemeToggle labels={dict.theme} className="theme-btn" />
          <AccountLink {...account} />
          <MobileMenu
            items={items}
            labels={{ open: dict.header.menu, nav: dict.header.mainNav }}
            extra={
              <>
                <AccountLink {...account} withText className="mnav-account" />
                <ThemeToggle labels={dict.theme} className="mnav-theme" withText />
              </>
            }
          />
          {/* До гідратації (або без JS) — та сама іконка, але посилання на розділи у футері. */}
          <a className="mnav-fallback" href="#sections">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
            <span className="sr-only">{dict.header.menu}</span>
          </a>
        </div>
      </header>
      <Livery />
    </>
  );
}
