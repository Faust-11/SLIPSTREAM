import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withKey } from "@/lib/admin/auth-http";
import { adminEnv, sameKey } from "@/lib/admin/env";
import { CODE_LENGTH } from "@/lib/admin/token";

export const metadata: Metadata = { title: "Код з листа" };

export default async function AdminCode({ searchParams }: { searchParams: Promise<{ key?: string; e?: string }> }) {
  const { key = "", e } = await searchParams;
  const env = adminEnv();
  if (!env?.email || !sameKey(key, env.loginKey)) notFound();
  return (
    <section className="ad-auth" aria-labelledby="ad-h">
      <h1 id="ad-h" className="display">
        Код з листа
      </h1>
      <p className="ad-lede">Якщо адреса є в списку адмінів, на неї надіслано код із {CODE_LENGTH} символів. Він діє 10 хвилин і лише в цьому браузері.</p>
      {e === "1" && (
        <p className="ad-result is-bad" role="alert">
          Код не підійшов або вже не діє.
        </p>
      )}
      <form className="ad-auth-form" method="post" action={withKey("/admin/auth/verify", key)}>
        <label className="ad-fld">
          <span>Код</span>
          <input
            name="code"
            required
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            maxLength={CODE_LENGTH + 2}
            placeholder="XXXX-XXXX"
            className="ad-code"
          />
        </label>
        <button type="submit" className="ad-btn ad-btn-primary ad-btn-wide">
          Увійти
        </button>
      </form>
      <p className="ad-note">
        <a href={withKey("/admin/auth/login", key)}>Надіслати новий код</a>
      </p>
    </section>
  );
}
