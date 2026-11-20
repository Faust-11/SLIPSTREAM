import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GitHub, GitHubError, githubEnv } from "@/lib/admin/github";
import { requireAdmin } from "@/lib/admin/session";
import { isSlug } from "@/lib/admin/stories/store";
import { loadVersion, type VersionDiff } from "@/lib/admin/stories/versions";

export const metadata: Metadata = { title: "Що змінила правка" };

/** Скільки рядків diff показуємо на файл; решта — на GitHub (uk.md з десятком абзаців — це ~100 рядків). */
const MAX_LINES = 400;
const MARK = { add: "+", del: "−", ctx: " ", hunk: "@" } as const;
const WORDS = { add: "додано: ", del: "прибрано: ", ctx: "", hunk: "ділянка: " } as const;

/** Що змінила правка: файли PR з GitHub (`patch`), файли історії першими, фото — лише назвою. */
export default async function AdminStoryVersion({ params }: { params: Promise<{ slug: string; pr: string }> }) {
  await requireAdmin();
  const { slug, pr } = await params;
  if (!isSlug(slug) || !/^\d{1,9}$/.test(pr)) notFound();
  const env = githubEnv();
  const crumb = (
    <p className="ad-crumb">
      <Link href="/admin/stories">Історії</Link> / <Link href={`/admin/stories/${slug}`}>{slug}</Link> / <Link href={`/admin/stories/${slug}/versions`}>Версії</Link> / #{pr}
    </p>
  );
  if (!env) {
    return (
      <section className="ad-view" aria-labelledby="ad-h">
        <header className="ad-vh">
          <div>
            {crumb}
            <h1 id="ad-h" className="display">
              Що змінила правка
            </h1>
          </div>
        </header>
        <p className="ad-result is-bad">GitHub не підключено (див. «Система»).</p>
      </section>
    );
  }
  let diff: VersionDiff | null;
  try {
    diff = await loadVersion(new GitHub(env), slug, Number(pr));
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) notFound();
    return (
      <section className="ad-view" aria-labelledby="ad-h">
        <header className="ad-vh">
          <div>
            {crumb}
            <h1 id="ad-h" className="display">
              Що змінила правка
            </h1>
          </div>
        </header>
        <p className="ad-result is-bad">GitHub не відповів. Оновіть сторінку.</p>
      </section>
    );
  }
  if (!diff) notFound();
  const { version, files, truncated } = diff;

  return (
    <section className="ad-view" aria-labelledby="ad-h">
      <header className="ad-vh">
        <div>
          {crumb}
          <h1 id="ad-h" className="display">
            {version.title}
          </h1>
        </div>
        <div className="ad-acts">
          <a className="ad-btn" href={version.url} target="_blank" rel="noopener">
            PR #{version.number} на GitHub<span className="ad-sr"> (нова вкладка)</span> ↗
          </a>
        </div>
      </header>
      <p className="ad-lede">
        <span className="ad-mono">Злито {version.mergedAt.slice(0, 16).replace("T", " ")} UTC</span>
        {version.kind === "revert" && <span className="ad-chip is-one"> Відкат</span>} · файлів: {files.length}
        {truncated && " (показано перші 100)"}
      </p>
      {files.map((f, i) => (
        <section key={f.filename} className="ad-panel" aria-labelledby={`ad-f${i}`}>
          <h2 id={`ad-f${i}`} className="ad-mono">
            {f.filename.replace(/^content\/stories\//, "")}
          </h2>
          <p className="ad-note">
            {f.status === "added" ? "новий файл" : f.status === "removed" ? "видалено" : f.status === "renamed" ? "перейменовано" : "змінено"}
            {" · "}
            <span className="ad-diff-n is-add">+{f.additions}</span> <span className="ad-diff-n is-del">−{f.deletions}</span>
          </p>
          {f.lines === null ? (
            <p className="ad-empty">{/\.(webp|png|jpe?g)$/.test(f.filename) ? "Зображення: порівняння — на GitHub." : "Зміни завеликі — дивіться на GitHub."}</p>
          ) : (
            <>
              <pre className="ad-diff" tabIndex={0} aria-label={`Зміни: ${f.filename}`}>
                {f.lines.slice(0, MAX_LINES).map((l, j) => (
                  <span key={j} className={`ad-dl is-${l.kind}`}>
                    <span className="ad-dm" aria-hidden="true">
                      {MARK[l.kind]}
                    </span>
                    <span className="ad-sr">{WORDS[l.kind]}</span>
                    {l.text}
                    {"\n"}
                  </span>
                ))}
              </pre>
              {f.lines.length > MAX_LINES && (
                <p className="ad-note">
                  Ще {f.lines.length - MAX_LINES} рядків —{" "}
                  <a href={`${version.url}/files`} target="_blank" rel="noopener">
                    повністю на GitHub
                  </a>
                  .
                </p>
              )}
            </>
          )}
        </section>
      ))}
    </section>
  );
}
