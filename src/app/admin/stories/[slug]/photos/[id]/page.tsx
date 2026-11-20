import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FocusPicker } from "@/components/admin/focus-picker";
import { UploadField } from "@/components/admin/upload-field";
import { GitHub, GitHubError, githubEnv } from "@/lib/admin/github";
import { commonsFile, searchCommons, type Candidate } from "@/lib/admin/photos/commons";
import { parseFocus } from "@/lib/admin/photos/crop";
import { requireAdmin } from "@/lib/admin/session";
import { parseStoryJson } from "@/lib/admin/stories/format";
import { MEDIA_ID } from "@/lib/admin/stories/media";
import { isSlug, openStoryPrs, readStory } from "@/lib/admin/stories/store";
import { publishStoryPhotoAction } from "../../../photo-actions";

export const metadata: Metadata = { title: "Фото історії" };
// Нарізка кількох розмірів і ~15 запитів до GitHub — довше за типові 10 с.
export const maxDuration = 60;

const RESULTS: Record<string, { level: "ok" | "bad"; text: string }> = {
  published: { level: "ok", text: "Опубліковано: PR пройде перевірки й зіллється сам (≈ 10–25 хв, є Lighthouse), потім фото з'явиться на сайті." },
  bad: { level: "bad", text: "Некоректний запит." },
  text: { level: "bad", text: "Підписи й опис фото (uk та en) обов'язкові." },
  "no-github": { level: "bad", text: "GitHub не підключено — публікація неможлива (див. «Система»)." },
  "open-pr": { level: "bad", text: "Правки цієї історії вже чекають злиття — дочекайтеся його (або закрийте PR) і повторіть." },
  commons: { level: "bad", text: "Файл на Commons не знайдено або Commons не відповідає." },
  license: { level: "bad", text: "Ця ліцензія не дозволена (ND — без змін, fair use або невідома)." },
  "upload-file": { level: "bad", text: "Файл: JPEG, PNG чи WebP до 4 МБ." },
  "upload-fields": { level: "bad", text: "Для свого фото потрібні автор, ліцензія, посилання (https) і підтвердження прав." },
  "too-small": { level: "bad", text: "Фото замале (головне — щонайменше 960 px завширшки, у тексті — 640)." },
  render: { level: "bad", text: "Не вдалося обробити зображення." },
  invalid: { level: "bad", text: "Після зміни історія не проходить перевірку — спершу виправте її в редакторі." },
  github: { level: "bad", text: "GitHub не прийняв правку. Спробуйте пізніше." },
};
const LICENSE_TEXT = { ok: "дозволено", nc: "лише некомерційно", no: "не можна" } as const;
const LICENSE_CHIP = { ok: "is-ok", nc: "is-one", no: "is-bad" } as const;

type Existing = { caption?: { uk?: string; en?: string }; alt?: { uk?: string; en?: string } };

export default async function AdminStoryPhoto({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ q?: string; file?: string; r?: string; pr?: string }>;
}) {
  await requireAdmin();
  const [{ slug, id }, sp] = await Promise.all([params, searchParams]);
  if (!isSlug(slug) || (id !== "new" && !MEDIA_ID.test(id))) notFound();
  const env = githubEnv();
  const self = `/admin/stories/${slug}/photos/${id}`;
  if (!env) {
    return (
      <section className="ad-view" aria-labelledby="ad-h">
        <h1 id="ad-h" className="display">
          Фото історії
        </h1>
        <p className="ad-result is-bad">GitHub не підключено — зміна фото неможлива (див. «Система»).</p>
      </section>
    );
  }
  const gh = new GitHub(env);
  let files;
  try {
    files = (await readStory(gh, slug)).files;
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) notFound();
    throw e;
  }
  const story = parseStoryJson(files.json).story;
  const current = id === "new" ? undefined : (story.media ?? []).find((m) => m.id === id);
  if (id !== "new" && !current) notFound();
  const role = current?.role === "hero" ? "hero" : "inline";
  const open = await openStoryPrs(gh, slug).catch(() => []);

  const q = (sp.q ?? story.title?.en ?? slug).slice(0, 200);
  const candidates: Candidate[] | null = sp.q !== undefined || !sp.file ? await searchCommons(q).catch(() => null) : null;
  const chosen = sp.file ? await commonsFile(sp.file, 960).catch(() => null) : null;
  const result = sp.r && Object.hasOwn(RESULTS, sp.r) ? RESULTS[sp.r] : undefined;
  const old = (current ?? {}) as Existing;
  const focus = parseFocus(typeof current?.focus === "string" ? current.focus : undefined);
  const initialFocus = { x: Math.round(focus.x * 100), y: Math.round(focus.y * 100) };

  const text = (
    <fieldset className="ad-parts ad-ptext">
      <legend>Підпис і опис (uk та en)</legend>
      {current && <p className="ad-note">Підписи старого фото підставлено — перевірте, що вони відповідають новому.</p>}
      <div className="ad-grid2">
        <label className="ad-fld">
          <span>Підпис · українська</span>
          <textarea name="caption_uk" rows={2} required maxLength={300} defaultValue={old.caption?.uk ?? ""} />
        </label>
        <label className="ad-fld">
          <span>Caption · English</span>
          <textarea name="caption_en" rows={2} required maxLength={300} defaultValue={old.caption?.en ?? ""} />
        </label>
        <label className="ad-fld">
          <span>Опис для незрячих · українська</span>
          <textarea name="alt_uk" rows={2} required maxLength={400} defaultValue={old.alt?.uk ?? ""} />
        </label>
        <label className="ad-fld">
          <span>Alt text · English</span>
          <textarea name="alt_en" rows={2} required maxLength={400} defaultValue={old.alt?.en ?? ""} />
        </label>
      </div>
      <p className="ad-note">Підпис — фактичний (що й де на фото, рік); опис — що видно, для людей без зору.</p>
    </fieldset>
  );
  const hidden = (source: string) => (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="source" value={source} />
    </>
  );

  return (
    <section className="ad-view" aria-labelledby="ad-h">
      <header className="ad-vh">
        <div>
          <p className="ad-crumb">
            <Link href="/admin/stories">Історії</Link> / <Link href={`/admin/stories/${slug}`}>{slug}</Link> / <Link href={`/admin/stories/${slug}/photos`}>Фото</Link>
          </p>
          <h1 id="ad-h" className="display">
            {id === "new" ? "Нове фото в тексті" : role === "hero" ? "Головне фото" : `Фото ${id}`}
          </h1>
        </div>
      </header>
      {result && (
        <p className={`ad-result is-${result.level}`} role="status">
          {result.text}
          {sp.pr && /^\d+$/.test(sp.pr) && ` PR #${sp.pr}.`}
        </p>
      )}
      {open.length > 0 && (
        <p className="ad-result is-bad" role="status">
          Правки цієї історії вже чекають злиття (PR #{open.map((p) => p.number).join(", #")}) — публікувати нове, поки вони не злиті, не можна.
        </p>
      )}

      {current && (
        <section className="ad-panel" aria-labelledby="ad-now">
          <h2 id="ad-now">Зараз на сайті</h2>
          <figure className="ad-now">
            {/* eslint-disable-next-line @next/next/no-img-element -- власні файли сайту, прев'ю */}
            <img src={String(current.src)} alt={old.alt?.uk ?? ""} />
            <figcaption>
              <b>{id}</b>
              <small>
                {(current.credit as { author?: string; license?: string } | undefined)?.author} · {(current.credit as { license?: string } | undefined)?.license}
              </small>
            </figcaption>
          </figure>
        </section>
      )}

      {chosen && (
        <section className="ad-panel" aria-labelledby="ad-pick">
          <h2 id="ad-pick">Обране фото</h2>
          <form action={publishStoryPhotoAction} className="ad-pick">
            {hidden("commons")}
            <input type="hidden" name="title" value={chosen.title} />
            <FocusPicker src={chosen.thumb} alt={chosen.title} initial={initialFocus} />
            <dl className="ad-kv">
              <div>
                <dt>Файл</dt>
                <dd>
                  <a href={chosen.page} target="_blank" rel="noopener">
                    {chosen.title} ↗
                  </a>
                </dd>
              </div>
              <div>
                <dt>Автор</dt>
                <dd>{chosen.author}</dd>
              </div>
              <div>
                <dt>Ліцензія</dt>
                <dd>
                  {chosen.license} <span className={`ad-chip ${LICENSE_CHIP[chosen.verdict.level]}`}>{LICENSE_TEXT[chosen.verdict.level]}</span>
                </dd>
              </div>
            </dl>
            {chosen.verdict.level === "nc" && <p className="ad-result is-one">Лише некомерційно: якщо на сайті з&apos;явиться реклама, підписка чи спонсор — це фото доведеться замінити (воно буде в списку).</p>}
            {chosen.verdict.level !== "no" ? (
              <>
                {text}
                <div className="ad-acts">
                  <button type="submit" className="ad-btn ad-btn-primary" disabled={open.length > 0}>
                    Опублікувати
                  </button>
                </div>
              </>
            ) : (
              <p className="ad-result is-bad">{chosen.verdict.reason} — це фото обрати не можна.</p>
            )}
          </form>
        </section>
      )}

      <section className="ad-panel" aria-labelledby="ad-commons">
        <h2 id="ad-commons">Пошук на Wikimedia Commons</h2>
        <form method="get" action={self} className="ad-search" role="search">
          <label className="ad-fld">
            <span>Запит</span>
            <input type="search" name="q" defaultValue={q} />
          </label>
          <button type="submit" className="ad-btn">
            Шукати
          </button>
        </form>
        {candidates === null && sp.file === undefined && <p className="ad-result is-bad">Commons не відповідає — спробуйте пізніше.</p>}
        {candidates && candidates.length === 0 && <p className="ad-empty">Нічого не знайдено — спробуйте інший запит (латиницею, з роком чи командою).</p>}
        {candidates && candidates.length > 0 && (
          <ul className="ad-cands">
            {candidates.map((c) => (
              <li key={c.title} className={c.verdict.level === "no" ? "is-off" : undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element -- прев'ю Commons */}
                <img src={c.thumb} alt="" loading="lazy" />
                <div>
                  <b title={c.title}>{c.title}</b>
                  <small>
                    {c.author} · {c.width}×{c.height}
                  </small>
                  <span className={`ad-chip ${LICENSE_CHIP[c.verdict.level]}`}>
                    {c.license || "без ліцензії"} · {LICENSE_TEXT[c.verdict.level]}
                  </span>
                  {c.verdict.level !== "no" && (
                    <Link className="ad-btn ad-btn-sm" href={`${self}?file=${encodeURIComponent(c.title)}`}>
                      Обрати
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="ad-panel">
        <summary>
          <h2>Своє фото</h2>
        </summary>
        <form action={publishStoryPhotoAction} className="ad-pick">
          {hidden("upload")}
          <UploadField initialFocus={initialFocus} />
          <label className="ad-fld">
            <span>Автор</span>
            <input name="author" required maxLength={200} />
          </label>
          <label className="ad-fld">
            <span>Ліцензія</span>
            <select name="license" required defaultValue="CC BY 4.0">
              <option>CC BY 4.0</option>
              <option>CC BY-SA 4.0</option>
              <option>CC0</option>
              <option>CC BY-NC 4.0</option>
            </select>
          </label>
          <label className="ad-fld">
            <span>Посилання (де фото опубліковане або сторінка автора)</span>
            <input name="page" type="url" required pattern="https://.+" placeholder="https://" maxLength={500} />
          </label>
          <label className="ad-check">
            <input type="checkbox" name="rights" required /> Я автор цього фото або маю дозвіл автора на цю ліцензію
          </label>
          {text}
          <div className="ad-acts">
            <button type="submit" className="ad-btn ad-btn-primary" disabled={open.length > 0}>
              Опублікувати
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}
