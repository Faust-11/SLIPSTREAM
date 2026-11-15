import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Огляд" };

export default async function AdminOverview() {
  await requireAdmin();
  return (
    <section className="ad-view" aria-labelledby="ad-h">
      <header className="ad-vh">
        <div>
          <p className="ad-crumb">Адмінка</p>
          <h1 id="ad-h" className="display">
            Огляд
          </h1>
        </div>
        <a className="ad-btn" href="/uk" target="_blank" rel="noopener">
          Відкрити сайт ↗
        </a>
      </header>
    </section>
  );
}
