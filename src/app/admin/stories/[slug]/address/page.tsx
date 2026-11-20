import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GitHub, GitHubError, githubEnv } from "@/lib/admin/github";
import { requireAdmin } from "@/lib/admin/session";
import { REDIRECTS_PATH, SLUG_RE, planRename } from "@/lib/admin/stories/rename";
import { loadRenameInput } from "@/lib/admin/stories/rename-io";
import type { OpenPr } from "@/lib/admin/stories/store";
import { isSlug, openPrsTouching, readStory } from "@/lib/admin/stories/store";
import { renameStoryAction } from "../../rename-actions";

export const metadata: Metadata = { title: "Адреса історії" };
export const maxDuration = 60;

const RESULT: Record<string, { level: "ok" | "one" | "bad"; text: string }> = {
  published: { level: "ok", text: "Зміну адреси створено: PR пройде перевірки й зіллється сам (~10–15 хв). Після злиття історія з'явиться за новою адресою." },
  "open-pr": { level: "one", text: "У цієї історії (чи в історій, на які вона посилається) є відкриті PR — дочекайтесь їх злиття." },
  invalid: { level: "bad", text: "Зміну адреси не створено: див. помилки нижче." },
  bad: { level: "one", text: "Такої історії немає." },
  github: { level: "bad", text: "GitHub не відповів. Спробуйте пізніше." },
  "no-github": { level: "bad", text: "GitHub не підключено (див. «Система»)." },
};

/** Зміна адреси історії (7c): що зміниться → підтвердження. Файли й посилання сервер бере з main і при підтвердженні рахує заново. */
export default async function AdminStoryAddress({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ to?: string; r?: string; pr?: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const { to: rawTo, r, pr } = await searchParams;
  const to = (rawTo ?? "").trim().slice(0, 80);
  const result = r ? RESULT[r] : undefined;
  const env = githubEnv();
  const head = (
    <header className="ad-vh">
      <div>
        <p className="ad-crumb">
          <Link href="/admin/stories">Історії</Link> / <Link href={`/admin/stories/${slug}`}>{slug}</Link> / Адреса
        </p>
        <h1 id="ad-h" className="display">
          Адреса історії
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
  let preview: { errors: string[]; summary?: { photos: number; linkedStories: string[]; mediaRewritten: number; warnings: string[] }; conflicts: OpenPr[] } | null = null;
  let loadFailed = false;
  if (!to) {
    // Без новой адреси історію теж перевіряємо: неіснуюча — той самий 404, що й у решти сторінок історії.
    await readStory(gh, slug).catch((e) => {
      if (e instanceof GitHubError && e.status === 404) notFound();
      loadFailed = true;
    });
  } else {
    try {
      const loaded = await loadRenameInput(gh, slug, to);
      if (!loaded) notFound();
      const plan = planRename(loaded.input);
      const conflicts = await openPrsTouching(gh, [slug, to, ...(plan.ok ? plan.summary.linkedStories : [])], [REDIRECTS_PATH]);
      preview = plan.ok ? { errors: [], summary: plan.summary, conflicts } : { errors: plan.errors, conflicts };
    } catch (e) {
      if ((e as { digest?: string }).digest?.startsWith("NEXT_HTTP_ERROR_FALLBACK")) throw e; // notFound()
      loadFailed = true;
    }
  }

  return (
    <section className="ad-view" aria-labelledby="ad-h">
      {head}
      <p className="ad-lede">
        Адреса — це частина посилання: <span className="ad-mono">/uk/stories/{slug}</span>. Зміна — один PR: тека історії, фото, посилання в інших історіях і
        запис у файлі редиректів. Старе посилання (у соцмережах, закладках) продовжить працювати: його буде перенаправлено на нове.
      </p>
      {result && (
        <p className={`ad-result is-${result.level}`} role="status">
          {result.text}
          {r === "published" && pr && /^\d{1,9}$/.test(pr) && <span className="ad-mono"> PR #{pr}</span>}
        </p>
      )}
      <form method="get" className="ad-search" action={`/admin/stories/${slug}/address`}>
        <label className="ad-fld">
          <span>Нова адреса</span>
          <input type="text" name="to" defaultValue={to} placeholder="наприклад, brawn-champions" maxLength={56} pattern={SLUG_RE.source} spellCheck={false} autoCapitalize="none" autoComplete="off" required />
        </label>
        <button type="submit" className="ad-btn">
          Показати, що зміниться
        </button>
      </form>
      {loadFailed && <p className="ad-result is-bad">Не вдалося прочитати дані з GitHub. Спробуйте ще раз.</p>}
      {preview && preview.errors.length > 0 && (
        <div className="ad-result is-bad">
          <h2>Не можна змінити адресу</h2>
          <ul>
            {preview.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {preview && preview.summary && (
        <section className="ad-panel" aria-labelledby="ad-plan">
          <h2 id="ad-plan">Що зміниться</h2>
          <ul className="ad-plan">
            <li>
              Нове посилання: <span className="ad-mono">/uk/stories/{to}</span>
            </li>
            <li>
              Старе <span className="ad-mono">/uk/stories/{slug}</span> (і без <span className="ad-mono">/uk</span>) перенаправлятиме на нове (постійно, 308).
            </li>
            <li>Тека історії: 3 файли. Фото: {preview.summary.photos}.</li>
            <li>
              Посилання в інших історіях:{" "}
              {preview.summary.linkedStories.length ? preview.summary.linkedStories.map((s) => <span key={s} className="ad-mono">{s} </span>) : "немає"}.
            </li>
            {preview.summary.warnings.map((w) => (
              <li key={w}>
                <b>Увага:</b> {w}
              </li>
            ))}
            <li>
              Картка для соцмереж (og) у нової адреси — загальна картка розділу, доки не перезапущено <span className="ad-mono">scripts/og/build.mjs</span>.
            </li>
          </ul>
          {preview.conflicts.length > 0 ? (
            <p className="ad-result is-bad" role="status">
              Чекають злиття:{" "}
              {preview.conflicts.map((p, i) => (
                <span key={p.number}>
                  {i > 0 && ", "}
                  <a href={p.url} target="_blank" rel="noopener">
                    PR #{p.number}
                  </a>
                </span>
              ))}
              . Змінити адресу можна після їх злиття.
            </p>
          ) : (
            <form action={renameStoryAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="to" value={to} />
              <button type="submit" className="ad-btn">
                Змінити адресу на «{to}»
              </button>
            </form>
          )}
        </section>
      )}
    </section>
  );
}
