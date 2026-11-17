import type { Metadata } from "next";
import Link from "next/link";
import { KINDS, catalog, queue, type Kind } from "@/lib/admin/photos/catalog";
import { requireAdmin } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Фото" };

/** Фото сайту: розділ (пілоти, команди…), черга без фото за важливістю і пошук будь-кого — замінити можна будь-яке фото. */
export default async function AdminPhotos({ searchParams }: { searchParams: Promise<{ k?: string; q?: string }> }) {
  await requireAdmin();
  const { k, q = "" } = await searchParams;
  const kind: Kind = KINDS.some((x) => x.kind === k) ? (k as Kind) : "driver";
  const items = await catalog(kind);
  const missing = queue(items);
  const needle = q.trim().toLowerCase();
  const found = needle ? items.filter((i) => `${i.name} ${i.id}`.toLowerCase().includes(needle)).slice(0, 60) : [];
  const withPhoto = items.filter((i) => i.card ?? i.hero).length;

  return (
    <section className="ad-view" aria-labelledby="ad-h">
      <header className="ad-vh">
        <div>
          <p className="ad-crumb">Адмінка</p>
          <h1 id="ad-h" className="display">
            Фото
          </h1>
        </div>
      </header>
      <nav className="ad-tabs" aria-label="Що змінюємо">
        {KINDS.map((x) => (
          <Link key={x.kind} href={`/admin/photos?k=${x.kind}`} aria-current={x.kind === kind ? "page" : undefined}>
            {x.label}
          </Link>
        ))}
      </nav>
      <p className="ad-lede">
        З фото: {withPhoto} з {items.length}. Замінити можна будь-яке — знайдіть за назвою; без фото — у черзі нижче.
      </p>
      <form className="ad-search" method="get" action="/admin/photos" role="search">
        <input type="hidden" name="k" value={kind} />
        <label className="ad-fld">
          <span>Знайти</span>
          <input type="search" name="q" defaultValue={q} placeholder={kind === "driver" ? "Сенна, hamilton…" : "Назва"} />
        </label>
        <button type="submit" className="ad-btn">
          Шукати
        </button>
      </form>
      {needle && (
        <section className="ad-panel" aria-labelledby="ad-found">
          <h2 id="ad-found">Знайдено · {found.length}</h2>
          <ItemList items={found} />
        </section>
      )}
      <section className="ad-panel" aria-labelledby="ad-queue">
        <h2 id="ad-queue">Без фото · спершу найважливіші</h2>
        {missing.length ? <ItemList items={missing} /> : <p className="ad-empty">У цьому розділі фото є в усіх.</p>}
      </section>
    </section>
  );
}

function ItemList({ items }: { items: Awaited<ReturnType<typeof catalog>> }) {
  return (
    <ul className="ad-items">
      {items.map((i) => (
        <li key={i.id}>
          <Link href={`/admin/photos/${i.kind}/${encodeURIComponent(i.id)}`}>
            <b>{i.name}</b>
            <small>{i.note}</small>
          </Link>
          <span className={`ad-chip ${i.card ?? i.hero ? "is-ok" : "is-one"}`}>{i.card ?? i.hero ? "є фото" : "немає"}</span>
        </li>
      ))}
    </ul>
  );
}
