import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GitHub, GitHubError, githubEnv } from "@/lib/admin/github";
import { classifyLicense } from "@/lib/admin/photos/license";
import { requireAdmin } from "@/lib/admin/session";
import { parseStoryJson } from "@/lib/admin/stories/format";
import { isSlug, readStory } from "@/lib/admin/stories/store";

export const metadata: Metadata = { title: "Фото історії" };

/** Фото історії (7c): hero й inline-фото з підписами; заміна hero, додавання inline. Читає main через GitHub, як і редактор. */
export default async function AdminStoryPhotos({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const env = githubEnv();
  const crumb = (
    <p className="ad-crumb">
      <Link href="/admin/stories">Історії</Link> / <Link href={`/admin/stories/${slug}`}>{slug}</Link> / Фото
    </p>
  );
  const head = (
    <header className="ad-vh">
      <div>
        {crumb}
        <h1 id="ad-h" className="display">
          Фото історії
        </h1>
      </div>
    </header>
  );
  if (!env) {
    return (
      <section className="ad-view" aria-labelledby="ad-h">
        {head}
        <p className="ad-result is-bad">GitHub не підключено — зміна фото неможлива (див. «Система»).</p>
      </section>
    );
  }
  let files;
  try {
    files = (await readStory(new GitHub(env), slug)).files;
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
  const media = story.media ?? [];
  const used = (id: string) => files.uk.includes(`[[media:${id}]]`) || files.en.includes(`[[media:${id}]]`);

  return (
    <section className="ad-view" aria-labelledby="ad-h">
      <header className="ad-vh">
        <div>
          {crumb}
          <h1 id="ad-h" className="display">
            Фото · {story.title?.uk || slug}
          </h1>
        </div>
        <Link className="ad-btn" href={`/admin/stories/${slug}/photos/new`}>
          Додати фото в текст
        </Link>
      </header>
      <p className="ad-lede">
        Головне фото (hero) — на початку історії; решта стоять у тексті там, де є рядок <span className="ad-mono">[[media:m2]]</span> (окремим рядком в обох
        мовах). Нове фото спершу додається тут, а рядок у текст вставляється в редакторі після того, як зміна злита.
      </p>
      <ul className="ad-media">
        {media.map((m) => {
          const credit = (m.credit ?? {}) as { page?: string; author?: string; license?: string };
          const verdict = classifyLicense(String(credit.license ?? ""));
          const cap = (m.caption ?? {}) as { uk?: string };
          return (
            <li key={m.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- власні файли сайту, прев'ю */}
              <img src={String(m.src)} alt={String((m.alt as { uk?: string } | undefined)?.uk ?? "")} width={Number(m.width) || undefined} height={Number(m.height) || undefined} loading="lazy" />
              <div>
                <p>
                  <b className="ad-mono">{m.id}</b>{" "}
                  <span className={`ad-chip ${m.role === "hero" ? "is-ok" : "is-one"}`}>{m.role === "hero" ? "Головне" : "У тексті"}</span>
                  {m.role !== "hero" && !used(m.id) && <span className="ad-chip is-bad">Не вставлено в текст</span>}
                  {verdict.level === "nc" && <span className="ad-chip is-one">NC</span>}
                </p>
                {cap.uk && <p>{cap.uk}</p>}
                <small>
                  {credit.author ?? "автор невідомий"} · {credit.license ?? "ліцензія невідома"} · {String(m.width)}×{String(m.height)}
                </small>
                <Link className="ad-btn ad-btn-sm" href={`/admin/stories/${slug}/photos/${m.id}`}>
                  Замінити<span className="ad-sr"> {m.id}</span>
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      {media.length === 0 && <p className="ad-empty">Фото ще немає.</p>}
    </section>
  );
}
