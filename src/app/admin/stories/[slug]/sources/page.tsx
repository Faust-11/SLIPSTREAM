import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GitHub, GitHubError, githubEnv } from "@/lib/admin/github";
import { requireAdmin } from "@/lib/admin/session";
import { parseStoryJson } from "@/lib/admin/stories/format";
import { isSlug, openStoryPrs, readStory } from "@/lib/admin/stories/store";
import { SourceHealth, type SourceRow } from "./source-health";

export const metadata: Metadata = { title: "Здоров'я джерел" };
/** Одна дія «зберегти в Web Archive» може тривати до хвилини (замір 20.11: 86 с у найгіршому з трьох). */
export const maxDuration = 60;

const RESULT: Record<string, { level: "ok" | "one" | "bad"; text: string }> = {
  published: { level: "ok", text: "Копії записано: PR пройде перевірки й зіллється сам (~10–15 хв)." },
  none: { level: "one", text: "Нічого записувати: копії вже є або не підходять до джерел." },
  "open-pr": { level: "one", text: "У історії є відкриті PR — дочекайтесь їх злиття." },
  invalid: { level: "bad", text: "Після запису історія не проходить перевірку — PR не створено." },
  github: { level: "bad", text: "GitHub не відповів. Спробуйте пізніше." },
  "no-github": { level: "bad", text: "GitHub не підключено (див. «Система»)." },
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 60);
  }
};

/** Здоров'я джерел (7c): перевірка посилань і копії в Web Archive. Джерела — з main (GitHub), як у редакторі. */
export default async function AdminStorySources({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ r?: string; pr?: string; n?: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const { r, pr, n } = await searchParams;
  const result = r ? RESULT[r] : undefined;
  const env = githubEnv();
  const head = (
    <header className="ad-vh">
      <div>
        <p className="ad-crumb">
          <Link href="/admin/stories">Історії</Link> / <Link href={`/admin/stories/${slug}`}>{slug}</Link> / Джерела
        </p>
        <h1 id="ad-h" className="display">
          Здоров&apos;я джерел
        </h1>
      </div>
    </header>
  );
  if (!env) {
    return (
      <section className="ad-view" aria-labelledby="ad-h">
        {head}
        <p className="ad-result is-bad">GitHub не підключено (див. «Система»).</p>
      </section>
    );
  }
  const gh = new GitHub(env);
  let files;
  try {
    files = (await readStory(gh, slug)).files;
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) notFound();
    return (
      <section className="ad-view" aria-labelledby="ad-h">
        {head}
        <p className="ad-result is-bad">Не вдалося прочитати історію з GitHub. Спробуйте оновити сторінку.</p>
      </section>
    );
  }
  const story = parseStoryJson(files.json).story;
  const open = await openStoryPrs(gh, slug).catch(() => []);
  const rows: SourceRow[] = (story.sources ?? []).map((s, i) => ({
    id: String(s.id),
    n: i + 1,
    title: String(s.title ?? ""),
    publisher: String(s.publisher ?? ""),
    date: String(s.date ?? ""),
    url: String(s.url ?? ""),
    host: hostOf(String(s.url ?? "")),
    archive: typeof s.archive === "string" ? s.archive : "",
  }));
  const archived = rows.filter((x) => x.archive).length;

  return (
    <section className="ad-view" aria-labelledby="ad-h">
      {head}
      <p className="ad-lede">
        {rows.length} джерел, з копією в Web Archive — {archived}. Перевірка запускається кнопкою й нікуди не зберігається: результат видно лише тут. «Не вдалося
        перевірити» — це не тривога: багато сайтів закриті від ботів (403), обмежують частоту (429) чи відповідають довго.
      </p>
      {result && (
        <p className={`ad-result is-${result.level}`} role="status">
          {result.text}
          {r === "published" && pr && /^\d{1,9}$/.test(pr) && <span className="ad-mono"> PR #{pr}{n && /^\d{1,3}$/.test(n) ? `, копій: ${n}` : ""}</span>}
        </p>
      )}
      {rows.length === 0 ? <p className="ad-empty">У цієї історії немає джерел.</p> : <SourceHealth slug={slug} rows={rows} blocked={open.length > 0} />}
    </section>
  );
}
