import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import { FILTERS, filterCounts, filterRows, listStories, parseFilter, type StoryFilter, type StoryRow } from "@/lib/admin/stories/list";

export const metadata: Metadata = { title: "Історії" };

const FILTER_LABEL: Record<StoryFilter, string> = { all: "Усі", draft: "Чернетки", errors: "З помилками", translation: "Переклад EN: перевірити", noarchive: "Без архіву джерел" };
const EMPTY: Record<StoryFilter, string> = {
  all: "Історій немає.",
  draft: "Чернеток немає: усі історії опубліковані.",
  errors: "Помилок немає.",
  translation: "Переклад усіх історій відповідає оригіналу.",
  noarchive: "У всіх джерел є копія в Web Archive.",
};

function href(filter: StoryFilter, q: string): string {
  const p = new URLSearchParams();
  if (filter !== "all") p.set("f", filter);
  if (q) p.set("q", q);
  const s = p.toString();
  return s ? `/admin/stories?${s}` : "/admin/stories";
}

/** Смужка «≥2 джерела · одне · спірні» — ширина сегмента пропорційна кількості; нулі не малюємо. */
function ClaimBar({ claims }: { claims: StoryRow["claims"] }) {
  const parts = [
    ["ok", claims.ok, "підтверджено ≥2 джерелами"],
    ["one", claims.one, "одне джерело"],
    ["dis", claims.dis, "джерела розходяться"],
  ] as const;
  return (
    <>
      <span className="ad-mbar" aria-hidden="true">
        {parts.map(([k, n]) => (n > 0 ? <i key={k} className={`is-${k}`} style={{ flexGrow: n }} /> : null))}
      </span>
      <small className="ad-mono">
        {claims.total}: {claims.ok} · {claims.one} · {claims.dis}
        <span className="ad-sr">
          {" "}
          ({parts.map(([, n, label]) => `${n} — ${label}`).join("; ")})
        </span>
      </small>
    </>
  );
}

function TranslationChip({ t }: { t: StoryRow["translation"] }) {
  if (t.status === "ok") return <span className="ad-chip is-ok">Актуальний</span>;
  if (t.status === "none") return <span className="ad-note">—</span>;
  return (
    <>
      <span className={`ad-chip ${t.status === "stale" ? "is-bad" : "is-one"}`}>{t.status === "stale" ? "Застарів" : "Без відмітки"}</span>
      <small>{t.status === "stale" ? t.note : "Звірку з оригіналом ніхто не відмічав."}</small>
    </>
  );
}

/**
 * Історії (7c): таблиця всіх історій з тим, що вирішує «що перевірити першим». Назва історії веде до редактора. Дані — з файлів у збірці (як на сайті; main може бути новішим на хвилини).
 */
export default async function AdminStories({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  await requireAdmin();
  const { f, q: rawQ } = await searchParams;
  const filter = parseFilter(f);
  const q = (rawQ ?? "").slice(0, 80);
  const all = listStories();
  const counts = filterCounts(all);
  const rows = filterRows(all, filter, q);

  return (
    <section className="ad-view" aria-labelledby="ad-h">
      <header className="ad-vh">
        <div>
          <p className="ad-crumb">Адмінка</p>
          <h1 id="ad-h" className="display">
            Історії
          </h1>
        </div>
      </header>
      <p className="ad-lede">
        Усього {all.length}. Нові історії кладуться в репозиторій файлами за форматом <span className="ad-mono">content/stories/README.md</span> і
        з&apos;являються тут; чернетки на сайт не потрапляють, доки їх не опубліковано.
      </p>
      <nav className="ad-tabs" aria-label="Фільтр історій">
        {FILTERS.map((x) => (
          <Link key={x} href={href(x, q)} aria-current={x === filter ? "page" : undefined}>
            {FILTER_LABEL[x]} · {counts[x]}
          </Link>
        ))}
      </nav>
      <form className="ad-search" method="get" action="/admin/stories" role="search">
        {filter !== "all" && <input type="hidden" name="f" value={filter} />}
        <label className="ad-fld">
          <span>Знайти</span>
          <input type="search" name="q" defaultValue={q} placeholder="Адреса або заголовок" maxLength={80} />
        </label>
        <button type="submit" className="ad-btn">
          Шукати
        </button>
      </form>
      <section className="ad-panel" aria-labelledby="ad-list">
        <h2 id="ad-list">
          {FILTER_LABEL[filter]} · {rows.length}
          {q && ` · «${q}»`}
        </h2>
        {rows.length === 0 ? (
          <p className="ad-empty">{q ? "Нічого не знайдено." : EMPTY[filter]}</p>
        ) : (
          <div className="ad-tbl ad-stories" tabIndex={0} role="region" aria-labelledby="ad-list">
            <table>
              <thead>
                <tr>
                  <th scope="col">Історія</th>
                  <th scope="col">Стан</th>
                  <th scope="col">Твердження: ≥2 · одне · спірні</th>
                  <th scope="col">Переклад EN</th>
                  <th scope="col">Джерел</th>
                  <th scope="col">Перевірка</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.slug}>
                    <th scope="row">
                      <Link href={`/admin/stories/${r.slug}`}>
                        <b>{r.title}</b>
                      </Link>
                      <small className="ad-mono">
                        {r.slug}
                        {r.year !== null && ` · ${r.year}`}
                      </small>
                      {r.status === "published" ? (
                        <small>
                          <a href={`/uk/stories/${r.slug}`} target="_blank" rel="noopener">
                            На сайті<span className="ad-sr"> (нова вкладка): {r.title}</span> ↗
                          </a>
                        </small>
                      ) : (
                        <small>
                          <Link href={`/admin/stories/${r.slug}/preview`}>
                            Перегляд<span className="ad-sr">: {r.title}</span>
                          </Link>
                        </small>
                      )}
                    </th>
                    <td data-label="Стан">
                      {r.status === "draft" ? <span className="ad-chip is-one">Чернетка</span> : <span className="ad-chip is-ok">Опубліковано</span>}
                    </td>
                    <td data-label="Твердження">
                      <ClaimBar claims={r.claims} />
                    </td>
                    <td data-label="Переклад EN">
                      <TranslationChip t={r.translation} />
                    </td>
                    <td data-label="Джерел" className="ad-mono">
                      {r.sources}
                      <small>
                        з копією в архіві: {r.archived} з {r.archivable}
                      </small>
                    </td>
                    <td data-label="Перевірка">
                      {r.errors.length > 0 ? (
                        <>
                          <span className="ad-chip is-bad">Помилок: {r.errors.length}</span>
                          <small>{r.errors[0]}</small>
                        </>
                      ) : (
                        <span className="ad-chip is-ok">Без помилок</span>
                      )}
                      {r.warnings.length > 0 && <small>Попереджень: {r.warnings.length}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
