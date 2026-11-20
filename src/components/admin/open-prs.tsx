import { closePrAction } from "@/app/admin/stories/pr-actions";
import type { OpenPr } from "@/lib/admin/stories/store";

/**
 * Відкриті PR історії з кнопкою «Закрити PR» (7c): без неї застряглий PR блокував історію, поки його не закриють на GitHub.
 * Злитись він сам ще може — тому кнопка не прихована, а підписана: закриття не зачіпає main, гілка лишається.
 */
export function OpenPrs({ slug, prs, from, lead, tail }: { slug: string; prs: OpenPr[]; from: "editor" | "versions"; lead: string; tail: string }) {
  if (prs.length === 0) return null;
  return (
    <div className="ad-result is-bad ad-openprs">
      <p role="status">
        {lead}
        {tail}
      </p>
      <ul>
        {prs.map((p) => (
          <li key={p.number}>
            <a href={p.url} target="_blank" rel="noopener">
              PR #{p.number}
              <span className="ad-sr"> (нова вкладка)</span>
            </a>{" "}
            <span className="ad-note">{p.title}</span>
            <form action={closePrAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="pr" value={p.number} />
              <input type="hidden" name="from" value={from} />
              <button type="submit" className="ad-btn ad-btn-sm" aria-label={`Закрити PR #${p.number} без злиття`}>
                Закрити PR
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p className="ad-note">Закриття не змінює сайт: гілка лишається, PR можна знову відкрити на GitHub.</p>
    </div>
  );
}
