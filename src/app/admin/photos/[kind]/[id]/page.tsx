import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FocusPicker } from "@/components/admin/focus-picker";
import { UploadField } from "@/components/admin/upload-field";
import { KINDS, findItem, type Kind } from "@/lib/admin/photos/catalog";
import { commonsFile, searchCommons, type Candidate } from "@/lib/admin/photos/commons";
import { requireAdmin } from "@/lib/admin/session";
import { publishPhotoAction, takedownAction } from "../../actions";

export const metadata: Metadata = { title: "Фото" };
// Нарізка кількох розмірів і ~15 запитів до GitHub — довше за типові 10 с.
export const maxDuration = 60;

const RESULTS: Record<string, { level: "ok" | "one" | "bad"; text: string }> = {
  published: { level: "ok", text: "Опубліковано: PR пройде перевірки й зіллється сам (~10–15 хв), потім фото з'явиться на сайті." },
  draft: { level: "ok", text: "Чернетку збережено (PR-чернетка). Опублікувати — з GitHub або повторно звідси." },
  nothing: { level: "one", text: "Цієї частини фото на сайті немає — знімати нічого." },
  removed: { level: "ok", text: "Фото знімається з сайту: PR пройде перевірки й зіллється сам (~10–15 хв). Заміну можна обрати нижче." },
  bad: { level: "bad", text: "Некоректний запит." },
  "no-github": { level: "bad", text: "GitHub не підключено — публікація неможлива (див. Система)." },
  commons: { level: "bad", text: "Файл на Commons не знайдено або Commons не відповідає." },
  license: { level: "bad", text: "Ця ліцензія не дозволена (ND — без змін, fair use або невідома)." },
  "upload-file": { level: "bad", text: "Файл: JPEG, PNG чи WebP до 4 МБ." },
  "upload-fields": { level: "bad", text: "Для свого фото потрібні автор, ліцензія, посилання (https) і підтвердження прав." },
  "too-small": { level: "bad", text: "Фото замале для цього місця (для банерів — щонайменше 960 px завширшки)." },
  render: { level: "bad", text: "Не вдалося обробити зображення." },
  github: { level: "bad", text: "GitHub не прийняв правку. Спробуйте пізніше." },
};

const LICENSE_TEXT = { ok: "дозволено", nc: "лише некомерційно", no: "не можна" } as const;
const LICENSE_CHIP = { ok: "is-ok", nc: "is-one", no: "is-bad" } as const;

export default async function AdminPhoto({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{ q?: string; file?: string; r?: string; pr?: string }>;
}) {
  await requireAdmin();
  const [{ kind, id: rawId }, sp] = await Promise.all([params, searchParams]);
  if (!KINDS.some((x) => x.kind === kind)) notFound();
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    notFound();
  }
  const item = await findItem(kind as Kind, id);
  if (!item) notFound();

  const q = (sp.q ?? item.name).slice(0, 200);
  const candidates: Candidate[] | null = sp.q !== undefined || !sp.file ? await searchCommons(q).catch(() => null) : null;
  const chosen = sp.file ? await commonsFile(sp.file, 960).catch(() => null) : null;
  const result = sp.r && Object.hasOwn(RESULTS, sp.r) ? RESULTS[sp.r] : undefined;
  const self = `/admin/photos/${kind}/${encodeURIComponent(id)}`;
  const label = KINDS.find((x) => x.kind === kind)!.label;
  // Пілот: обличчя зазвичай угорі кадру (як squareTop / crop_4x5 скриптів); інше — центр.
  const initialFocus = kind === "driver" ? { x: 50, y: 20 } : { x: 50, y: 50 };
  // Банер пілота сайт показує лише з аватаром — без аватара лише «обидва».
  const canSplit = item.paired && !(kind === "driver" && !item.card);

  return (
    <section className="ad-view" aria-labelledby="ad-h">
      <header className="ad-vh">
        <div>
          <p className="ad-crumb">
            <Link href={`/admin/photos?k=${kind}`}>Фото · {label}</Link>
          </p>
          <h1 id="ad-h" className="display">
            {item.name}
          </h1>
        </div>
      </header>
      {result && (
        <p className={`ad-result is-${result.level}`} role="status">
          {result.text}
          {sp.pr && /^\d+$/.test(sp.pr) && ` PR #${sp.pr}.`}
        </p>
      )}

      <section className="ad-panel" aria-labelledby="ad-now">
        <h2 id="ad-now">Зараз на сайті</h2>
        <div className="ad-now">
          {[item.card && { t: item.kind === "driver" ? "Аватар" : "Картка", ...item.card }, item.hero && { t: "Банер", ...item.hero }]
            .filter((x): x is NonNullable<typeof x> => !!x)
            .map((p) => (
              <figure key={p.t}>
                {/* eslint-disable-next-line @next/next/no-img-element -- власні файли сайту, прев'ю */}
                <img src={p.src} alt={`${p.t}: ${item.name}`} />
                <figcaption>
                  <b>{p.t}</b>
                  {p.credit && (
                    <small>
                      {p.credit.author} · {p.credit.license}
                    </small>
                  )}
                </figcaption>
              </figure>
            ))}
          {!item.card && !item.hero && <p className="ad-empty">Фото немає{kind === "race" ? " — показується фото траси" : ""}.</p>}
        </div>
      </section>

      {chosen && (
        <section className="ad-panel" aria-labelledby="ad-pick">
          <h2 id="ad-pick">Обране фото</h2>
          <form action={publishPhotoAction} className="ad-pick">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="source" value="commons" />
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
            {canSplit && <PartChoice kind={kind as Kind} />}
            {chosen.verdict.level !== "no" ? (
              <div className="ad-acts">
                <button type="submit" name="mode" value="publish" className="ad-btn ad-btn-primary">
                  Опублікувати
                </button>
                <button type="submit" name="mode" value="draft" className="ad-btn">
                  Зберегти чернетку
                </button>
              </div>
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
        <form action={publishPhotoAction} className="ad-pick">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="source" value="upload" />
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
          {canSplit && <PartChoice kind={kind as Kind} />}
          <div className="ad-acts">
            <button type="submit" name="mode" value="publish" className="ad-btn ad-btn-primary">
              Опублікувати
            </button>
            <button type="submit" name="mode" value="draft" className="ad-btn">
              Зберегти чернетку
            </button>
          </div>
        </form>
      </details>
      {(item.card ?? item.hero) && (
        <details className="ad-panel">
          <summary>
            <h2>Зняти за запитом автора</h2>
          </summary>
          <form action={takedownAction} className="ad-pick">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={id} />
            <p className="ad-note">
              Фото зникне з сайту після перевірок (~10–15 хв): файли видаляються, підписи прибираються. Заміну шукаємо потім.
              {(kind === "team" || kind === "driver") && " Знімаються обидва фото: без картки (аватара) банер на сайті не показується."}
            </p>
            {item.paired && kind === "season" && <PartChoice kind={kind as Kind} />}
            <label className="ad-fld">
              <span>Причина (необов&apos;язково)</span>
              <input name="reason" maxLength={300} />
            </label>
            <label className="ad-check">
              <input type="checkbox" name="confirm" required /> Автор просить прибрати фото
            </label>
            <div className="ad-acts">
              <button type="submit" className="ad-btn ad-btn-danger">
                Зняти фото
              </button>
            </div>
          </form>
        </details>
      )}
    </section>
  );
}

function PartChoice({ kind }: { kind: Kind }) {
  const card = kind === "driver" ? "Лише аватар" : "Лише картка";
  return (
    <fieldset className="ad-parts">
      <legend>Куди ставимо</legend>
      <label>
        <input type="radio" name="part" value="both" defaultChecked /> Обидва місця
      </label>
      <label>
        <input type="radio" name="part" value="card" /> {card}
      </label>
      <label>
        <input type="radio" name="part" value="hero" /> Лише банер
      </label>
    </fieldset>
  );
}
