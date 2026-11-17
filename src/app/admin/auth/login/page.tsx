import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withKey } from "@/lib/admin/auth-http";
import { adminEnv, sameKey } from "@/lib/admin/env";

export const metadata: Metadata = { title: "Вхід" };

/** Вхід: GitHub і/або код на пошту — що налаштовано. Без правильного ключа в адресі — 404. */
export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key = "" } = await searchParams;
  const env = adminEnv();
  if (!env || !sameKey(key, env.loginKey)) notFound();
  return (
    <section className="ad-auth" aria-labelledby="ad-h">
      <h1 id="ad-h" className="display">
        Вхід
      </h1>
      {env.github && (
        <a className="ad-btn ad-btn-primary ad-btn-wide" href={withKey("/admin/auth/github", key)}>
          Увійти через GitHub
        </a>
      )}
      {env.github && env.email && <p className="ad-or">або</p>}
      {env.email && (
        <form className="ad-auth-form" method="post" action={withKey("/admin/auth/email", key)}>
          <label className="ad-fld">
            <span>E-mail</span>
            <input type="email" name="email" required autoComplete="email" inputMode="email" maxLength={254} />
          </label>
          <button type="submit" className="ad-btn ad-btn-wide">
            Надіслати код
          </button>
        </form>
      )}
    </section>
  );
}
