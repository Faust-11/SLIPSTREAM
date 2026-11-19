import type { Metadata } from "next";
import { ProfilePanel } from "@/components/auth/profile-panel";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const t = (await getDictionary(lang)).auth.profile;
  return { title: t.title, description: t.description, robots: { index: false, follow: false } };
}

export default async function ProfilePage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const { auth } = await getDictionary(lang);
  const { profile } = auth;
  return (
    <div className="au-page">
      <section className="au-hero">
        <div className="wrap">
          <p className="au-stamp">{profile.stamp}</p>
          <h1 className="display">{profile.h1}</h1>
        </div>
      </section>
      <div className="wrap au-body">
        <ProfilePanel text={profile} nick={auth.nick} loginHref={localizedPath("/login", lang)} homeHref={localizedPath("/", lang)} />
      </div>
    </div>
  );
}
