import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GitHub, GitHubError, githubEnv } from "@/lib/admin/github";
import { requireAdmin } from "@/lib/admin/session";
import { isSlug, openStoryPrs, readStory, type OpenPr } from "@/lib/admin/stories/store";
import { listVersions, type Version } from "@/lib/admin/stories/versions";
import { revertStoryAction } from "../../version-actions";

export const metadata: Metadata = { title: "Версії історії" };

const RESULT: Record<string, { level: "ok" | "one" | "bad"; text: string }> = {
  reverted: { level: "ok", text: "Відкат створено: PR пройде перевірки й зіллється сам (~10–15 хв)." },
  refused: {
    level: "one",
    text: "Відкат неможливий автоматично: файли змінились після цієї правки, її вже відкочували, або вона не з одного коміту. Відкат пізнішої правки поверне й цю.",
  },
  "open-pr": { level: "one", text: "У історії є відкриті PR — дочекайтесь їх злиття, тоді відкат." },
  bad: { level: "one", text: "Такої правки в журналі цієї історії немає." },
  github: { level: "bad", text: "GitHub не відповів. Спробуйте пізніше." },
  "no-github": { level: "bad", text: "GitHub не підключено (див. «Система»)." },
};

const when = (iso: string): string => iso.slice(0, 16).replace("T", " ");

/** Версії історії (7c): злиті PR адмінки з її файлами; «Що змінилось» — diff від GitHub; «Відкотити» — наявний revertPublished. */
export default async function AdminStoryVersions({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ r?: string; pr?: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const { r, pr } = await searchParams;
  const result = r ? RESULT[r] : undefined;
  const env = githubEnv();
  const head = (
    <header className="ad-vh">
      <div>
        <p className="ad-crumb">
          <Link href="/admin/stories">Історії</Link> / <Link href={`/admin/stories/${slug}`}>{slug}</Link> / Версії
        </p>
        <h1 id="ad-h" className="display">
          Версії історії
        </h1>
      </div>
    </header>
  );
  if (!env) {
    return (
      <section className="ad-view" aria-labelledby="ad-h">
        {head}
        <p className="ad-result is-bad">GitHub не підключено — журнал версій недоступний (див. «Система»).</p>
      </section>
    );
  }
  const gh = new GitHub(env);
  // Історії, якої немає в main, тут нічого показувати (і запитувати журнал для довільного рядка в адресі).
  try {
    await readStory(gh, slug);
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) notFound();
  }
  let versions: Version[] | null = null;
  let open: OpenPr[] = [];
  try {
    [versions, open] = await Promise.all([listVersions(gh, slug), openStoryPrs(gh, slug)]);
  } catch {
    versions = null;
  }
  return (
    <section className="ad-view" aria-labelledby="ad-h">
      {head}
      <p className="ad-lede">
        Усі злиті правки цієї історії з адмінки. Правки, зроблені вручну в репозиторії, тут не видно; час — UTC. Відкат — новий PR, що повертає файли до стану перед правкою;
        він можливий, лише поки файли не змінились після неї.
      </p>
      {result && (
        <p className={`ad-result is-${result.level}`} role="status">
          {result.text}
          {r === "reverted" && pr && /^\d{1,9}$/.test(pr) && <span className="ad-mono"> PR #{pr}</span>}
        </p>
      )}
      {open.length > 0 && (
        <p className="ad-result is-bad" role="status">
          Чекають злиття:{" "}
          {open.map((p, i) => (
            <span key={p.number}>
              {i > 0 && ", "}
              <a href={p.url} target="_blank" rel="noopener">
                PR #{p.number}
              </a>
            </span>
          ))}
          . Поки вони не злиті, відкат і нові правки недоступні.
        </p>
      )}
      <section className="ad-panel" aria-labelledby="ad-ver">
        <h2 id="ad-ver">Журнал</h2>
        {versions === null ? (
          <p className="ad-empty">Не вдалося прочитати журнал із GitHub. Оновіть сторінку.</p>
        ) : versions.length === 0 ? (
          <p className="ad-empty">Правок цієї історії з адмінки ще не було.</p>
        ) : (
          <ul className="ad-log ad-ver">
            {versions.map((v) => (
              <li key={v.number}>
                <span className="ad-mono">{when(v.mergedAt)}</span>
                <span>
                  <b>
                    <Link href={`/admin/stories/${slug}/versions/${v.number}`}>{v.title}</Link>
                  </b>{" "}
                  <span className="ad-mono">#{v.number}</span>
                  {v.kind === "revert" && <span className="ad-chip is-one"> Відкат</span>}
                </span>
                <form action={revertStoryAction}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="pr" value={v.number} />
                  <button type="submit" className="ad-btn ad-btn-sm ad-btn-ghost" disabled={open.length > 0}>
                    Відкотити<span className="ad-sr"> правку #{v.number}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
