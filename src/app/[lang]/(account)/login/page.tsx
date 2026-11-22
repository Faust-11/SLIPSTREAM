import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { turnstileSiteKey } from "@/lib/play/turnstile";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const t = (await getDictionary(lang)).auth.login;
  // Сторінка входу не для пошуку: noindex завжди (не залежить від SITE_INDEXING), не в sitemap.
  return { title: t.title, description: t.description, robots: { index: false, follow: false } };
}

export default async function LoginPage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const { auth } = await getDictionary(lang);
  const { login } = auth;
  // Ключ віджета — з env збірки (сторінка статична): без ключа форма без Turnstile.
  const siteKey = turnstileSiteKey();
  return (
    <div className="au-page">
      <section className="au-hero">
        <div className="wrap">
          <p className="au-stamp">{login.stamp}</p>
          <h1 className="display">{login.h1}</h1>
          <p className="au-lead">{login.lead}</p>
        </div>
      </section>
      <div className="wrap au-body">
        <LoginForm text={login} nick={auth.nick} fallbackHref={localizedPath("/profile", lang)} turnstile={siteKey ? { siteKey, lang } : undefined} />
      </div>
    </div>
  );
}
