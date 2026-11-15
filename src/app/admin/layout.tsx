import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/nav";
import { ROUNDEL_SVG } from "@/components/site/roundel-svg";
import { getAdmin } from "@/lib/admin/session";
import { fontVariables } from "../fonts";
import "../globals.css";
import "@/components/admin/admin.css";

/** Адмінка (фаза 7) — окремий кореневий layout: лише українською, без шапки сайту, ніколи не індексується. */
export const metadata: Metadata = {
  title: { default: "Адмінка · Slipstream", template: "%s · Адмінка · Slipstream" },
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = { colorScheme: "light dark" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Лише для шапки (хто увійшов). Доступ перевіряє кожна сторінка (requireAdmin), не layout — docs authentication.md.
  const admin = await getAdmin();
  return (
    <html lang="uk" className={fontVariables}>
      <body className="ad-body">
        <a className="ad-skip" href="#ad-main">
          До змісту
        </a>
        <div className="ad-app">
          <aside className="ad-side">
            <Link className="ad-brand" href="/admin">
              <span className="ad-roundel" aria-hidden="true">
                <svg viewBox="0 0 64 64" dangerouslySetInnerHTML={{ __html: ROUNDEL_SVG }} />
              </span>
              <span>
                <b translate="no">SLIPSTREAM</b>
                <small>Адмінка</small>
              </span>
            </Link>
            <AdminNav />
            {admin && (
              <div className="ad-me">
                <span className="ad-av" aria-hidden="true">
                  {admin.email.slice(0, 1).toUpperCase()}
                </span>
                <span className="ad-me-who">
                  <b>{admin.email}</b>
                  <small>Власник</small>
                </span>
                <form action="/admin/auth/logout" method="post">
                  <button type="submit" className="ad-btn ad-btn-sm ad-btn-ghost">
                    Вийти
                  </button>
                </form>
              </div>
            )}
          </aside>
          <main className="ad-main" id="ad-main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
