import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StoryView } from "@/components/stories/story-view";
import { GitHub, GitHubError, githubEnv } from "@/lib/admin/github";
import { requireAdmin } from "@/lib/admin/session";
import { parseStoryJson } from "@/lib/admin/stories/format";
import { isSlug, readStory } from "@/lib/admin/stories/store";
import { validateStory } from "@/lib/admin/stories/validate";
import { getDictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { buildStoryPage, getStoryList, parseLoaded, type StoryPage } from "@/lib/stories/content";
import { raceFacts, type RaceFacts } from "@/lib/stories/race-facts";
import "@/components/stories/stories.css";
import "@/components/glossary/glossary.css";
import "@/components/admin/preview.css";

export const metadata: Metadata = { title: "Перегляд історії" };
export const maxDuration = 60;

/**
 * Перегляд історії (7c, задача 9): сторінка так, як її бачить читач (та сама розмітка — StoryView), але зі СВІЖИХ файлів main, а не зі
 * збірки. Головне призначення — чернетки (`status: draft`): на сайті їх немає, а перевірити текст, виноски й фото перед публікацією треба.
 * Працює і для опублікованих: показує, що буде на сайті після злиття вже ухваленої правки.
 */
export default async function AdminStoryPreview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const lang: Locale = (await searchParams).lang === "en" ? "en" : "uk";
  const env = githubEnv();
  const crumb = (
    <p className="ad-crumb">
      <Link href="/admin/stories">Історії</Link> / <Link href={`/admin/stories/${slug}`}>{slug}</Link> / Перегляд
    </p>
  );
  const shell = (body: React.ReactNode) => (
    <section className="ad-view" aria-labelledby="ad-h">
      <header className="ad-vh">
        <div>
          {crumb}
          <h1 id="ad-h" className="display">
            Перегляд історії
          </h1>
        </div>
      </header>
      {body}
    </section>
  );
  if (!env) return shell(<p className="ad-result is-bad">GitHub не підключено (див. «Система»).</p>);

  let files;
  try {
    files = (await readStory(new GitHub(env), slug)).files;
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) notFound();
    return shell(<p className="ad-result is-bad">Не вдалося прочитати історію з GitHub. Спробуйте оновити сторінку.</p>);
  }
  const meta = parseStoryJson(files.json).story;
  const draft = meta.status === "draft";
  const check = validateStory(slug, meta, { uk: files.uk, en: files.en });

  let page: StoryPage | null = null;
  let facts: RaceFacts | null = null;
  let failure = "";
  try {
    page = buildStoryPage(parseLoaded(slug, files.json, files.uk, files.en), lang, getStoryList(lang));
    facts = page.race ? await raceFacts(page.race.year, page.race.round, lang).catch(() => null) : null;
  } catch (e) {
    failure = e instanceof Error ? e.message : "помилка";
  }
  const dict = await getDictionary(lang);
  const view = page ? (
    <StoryView lang={lang} story={page} dict={dict} facts={facts} preview />
  ) : (
    <p className="ad-result is-bad">Сторінку не вдалося зібрати: {failure}. Виправте це в редакторі.</p>
  );

  return shell(
    <>
      <div className="ad-pv-bar">
        <span className={`ad-chip ${draft ? "is-one" : "is-ok"}`}>{draft ? "Чернетка: на сайті цієї сторінки немає" : "Опубліковано"}</span>
        {check.errors.length > 0 ? <span className="ad-chip is-bad">Помилок: {check.errors.length}</span> : <span className="ad-chip is-ok">Без помилок</span>}
        <nav className="ad-tabs" aria-label="Мова перегляду">
          {(["uk", "en"] as const).map((l) => (
            <Link key={l} href={`/admin/stories/${slug}/preview?lang=${l}`} aria-current={l === lang ? "page" : undefined}>
              {l === "uk" ? "Українська" : "English"}
            </Link>
          ))}
        </nav>
      </div>
      <p className="ad-note">
        Файли — з main на GitHub. Без блоку «Читайте також» і авторів фото; посилання в тексті ведуть на публічний сайт.
        {check.errors.length > 0 && " Є помилки валідації: див. редактор."}
      </p>
      <div className="ad-preview" lang={lang}>
        {view}
      </div>
    </>,
  );
}
