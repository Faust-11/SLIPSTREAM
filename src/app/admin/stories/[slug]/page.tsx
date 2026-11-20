import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GitHub, GitHubError, githubEnv } from "@/lib/admin/github";
import { requireAdmin } from "@/lib/admin/session";
import { toFields } from "@/lib/admin/stories/form";
import { hashFiles, isSlug, openStoryPrs, readStory, type OpenPr } from "@/lib/admin/stories/store";
import { parseStoryJson } from "@/lib/admin/stories/format";
import { checkTranslation, staleSummary } from "@/lib/admin/stories/translation";
import { validateStory } from "@/lib/admin/stories/validate";
import { StoryForm } from "./story-form";

/** Збереження/відкат — ≈15–20 послідовних запитів до GitHub (як на сторінці фото). */
export const maxDuration = 60;
export const metadata: Metadata = { title: "Редактор історії" };

/**
 * Редактор історії (7c). Читає файли з main через GitHub (не зі збірки): правка завжди від свіжого стану, а форма
 * запам'ятовує його відбиток (`orig`) — дія не затре чужу правку. Публікація — src/app/admin/stories/actions.ts.
 */
export default async function AdminStory({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const env = githubEnv();
  const back = (
    <p className="ad-crumb">
      <Link href="/admin/stories">Історії</Link> / <span className="ad-mono">{slug}</span>
    </p>
  );
  if (!env) {
    return (
      <section className="ad-view" aria-labelledby="ad-h">
        <header className="ad-vh">
          <div>
            {back}
            <h1 id="ad-h" className="display">
              Редактор
            </h1>
          </div>
        </header>
        <p className="ad-result is-bad">GitHub не підключено — редагування неможливе (див. «Система»).</p>
      </section>
    );
  }
  const gh = new GitHub(env);
  let story;
  try {
    story = await readStory(gh, slug);
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) notFound();
    return (
      <section className="ad-view" aria-labelledby="ad-h">
        <header className="ad-vh">
          <div>
            {back}
            <h1 id="ad-h" className="display">
              Редактор
            </h1>
          </div>
        </header>
        <p className="ad-result is-bad">Не вдалося прочитати історію з GitHub. Спробуйте оновити сторінку.</p>
      </section>
    );
  }
  const open: OpenPr[] = await openStoryPrs(gh, slug).catch(() => []);
  const meta = parseStoryJson(story.files.json).story;
  const check = validateStory(slug, meta, { uk: story.files.uk, en: story.files.en });
  const draft = meta.status === "draft";
  const tr = checkTranslation(meta, { uk: story.files.uk, en: story.files.en });
  const translation = { status: tr.status, staleKeys: tr.stale.map((u) => u.key), note: staleSummary(tr) };

  return (
    <section className="ad-view" aria-labelledby="ad-h">
      <header className="ad-vh">
        <div>
          {back}
          <h1 id="ad-h" className="display">
            {meta.title?.uk || slug}
          </h1>
        </div>
        <div className="ad-acts">
          <Link className="ad-btn" href={`/admin/stories/${slug}/preview`}>
            Перегляд
          </Link>
          <Link className="ad-btn" href={`/admin/stories/${slug}/photos`}>
            Фото історії
          </Link>
          <Link className="ad-btn" href={`/admin/stories/${slug}/versions`}>
            Версії
          </Link>
          <Link className="ad-btn" href={`/admin/stories/${slug}/sources`}>
            Здоров&apos;я джерел
          </Link>
          <Link className="ad-btn" href={`/admin/stories/${slug}/address`}>
            Адреса
          </Link>
          {!draft && (
            <a className="ad-btn" href={`/uk/stories/${slug}`} target="_blank" rel="noopener">
              На сайті<span className="ad-sr"> (нова вкладка)</span> ↗
            </a>
          )}
        </div>
      </header>
      <p className="ad-lede">
        <span className={`ad-chip ${draft ? "is-one" : "is-ok"}`}>{draft ? "Чернетка" : "Опубліковано"}</span>{" "}
        {check.errors.length === 0 ? <span className="ad-chip is-ok">Без помилок</span> : <span className="ad-chip is-bad">Помилок: {check.errors.length}</span>}
        {check.warnings.length > 0 && <span className="ad-note"> Попереджень: {check.warnings.length}</span>}{" "}
        {tr.status === "ok" && <span className="ad-chip is-ok">Переклад EN актуальний</span>}
        {tr.status === "stale" && <span className="ad-chip is-bad">Переклад EN застарів</span>}
        {tr.status === "unmarked" && <span className="ad-chip is-one">Переклад EN без відмітки</span>}
      </p>
      {open.length > 0 && (
        <p className="ad-result is-bad" role="status">
          Правки цієї історії вже чекають злиття:{" "}
          {open.map((p, i) => (
            <span key={p.number}>
              {i > 0 && ", "}
              <a href={p.url} target="_blank" rel="noopener">
                PR #{p.number}
              </a>
            </span>
          ))}
          . Публікувати нове, поки вони не злиті, не можна.
        </p>
      )}
      {check.errors.length > 0 && (
        <div className="ad-result is-bad">
          <h2>Помилки в поточній версії</h2>
          <ul>
            {check.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <StoryForm slug={slug} initial={toFields(story.files)} orig={hashFiles(story.files)} translation={translation} />
    </section>
  );
}
