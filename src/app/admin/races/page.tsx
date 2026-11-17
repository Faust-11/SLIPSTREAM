import type { Metadata } from "next";
import Link from "next/link";
import racePhotosJson from "@/data/curated/race-photos.json";
import videosJson from "@/data/curated/race-videos.json";
import { requireAdmin } from "@/lib/admin/session";
import { getCalendarPage } from "@/lib/data/calendar";
import { setVideoAction } from "./actions";

export const metadata: Metadata = { title: "Гонки" };

type Video = { id: string; title: string };
const videos = (videosJson as unknown as { videos: Record<string, Video> }).videos;
const photos = (racePhotosJson as unknown as { photos: Record<string, unknown> }).photos;

const RESULTS: Record<string, { level: "ok" | "bad"; text: string }> = {
  published: { level: "ok", text: "Хайлайт поставлено: PR пройде перевірки й зіллється сам (~10–15 хв)." },
  removed: { level: "ok", text: "Хайлайт прибирається: PR пройде перевірки й зіллється сам." },
  link: { level: "bad", text: "Це не схоже на посилання YouTube." },
  "not-official": { level: "bad", text: "Відео не з офіційного каналу FORMULA 1, приватне або його заборонено вбудовувати." },
  "no-github": { level: "bad", text: "GitHub не підключено — публікація неможлива (див. Система)." },
  github: { level: "bad", text: "GitHub не прийняв правку. Спробуйте пізніше." },
  bad: { level: "bad", text: "Некоректний запит." },
};

/**
 * Візуальний контент сторінок гонок (рішення користувача 17.11): хайлайт з офіційного каналу FORMULA 1 і банер
 * конкретної гонки. Список — поточний сезон; інший етап — полем «рік/етап» унизу. Стан — як у збірці сайту (main може
 * бути новішим на хвилини після злиття).
 */
export default async function AdminRaces({ searchParams }: { searchParams: Promise<{ r?: string; pr?: string; k?: string }> }) {
  await requireAdmin();
  const [{ r, pr, k }, cal] = await Promise.all([searchParams, getCalendarPage("uk").catch(() => null)]);
  const result = r && Object.hasOwn(RESULTS, r) ? RESULTS[r] : undefined;
  const cards = cal?.cards ?? [];
  const withVideo = cards.filter((c) => videos[`${cal!.season}/${c.round}`]).length;

  return (
    <section className="ad-view" aria-labelledby="ad-h">
      <header className="ad-vh">
        <div>
          <p className="ad-crumb">Адмінка</p>
          <h1 id="ad-h" className="display">
            Гонки
          </h1>
        </div>
      </header>
      {result && (
        <p className={`ad-result is-${result.level}`} role="status">
          {result.text}
          {k && /^\d{4}\/\d{1,2}$/.test(k) && ` Етап ${k}.`}
          {pr && /^\d+$/.test(pr) && ` PR #${pr}.`}
        </p>
      )}
      <p className="ad-lede">
        Хайлайт — лише з офіційного YouTube-каналу FORMULA 1 (адмінка перевіряє автора й дозвіл на вбудовування). Банер гонки
        замінює фото траси на сторінці цього етапу.
      </p>
      {!cal && <p className="ad-result is-bad">База не відповідає — календар зараз недоступний.</p>}
      {cal && (
        <section className="ad-panel" aria-labelledby="ad-season">
          <h2 id="ad-season">
            Сезон {cal.season} · хайлайти {withVideo} з {cal.done}
          </h2>
          <ul className="ad-races">
            {cards.map((c) => {
              const key = `${cal.season}/${c.round}`;
              const v = videos[key];
              return (
                <li key={key} className={c.state === "done" && !v ? "is-missing" : undefined}>
                  <div className="ad-race-h">
                    <b>
                      {c.round}. {c.gp}
                    </b>
                    <small>
                      {c.state === "done" ? "відбувся" : c.state === "next" ? "наступний" : "попереду"}
                      {photos[key] ? " · свій банер" : " · банер — фото траси"}
                    </small>
                  </div>
                  <div className="ad-race-v">
                    {v ? (
                      <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener">
                        {v.title} ↗
                      </a>
                    ) : (
                      <span className="ad-chip is-one">{c.state === "done" ? "немає хайлайта" : "ще не було"}</span>
                    )}
                  </div>
                  <form action={setVideoAction} className="ad-race-f">
                    <input type="hidden" name="key" value={key} />
                    <label className="ad-fld">
                      <span className="ad-sr">Посилання YouTube для етапу {c.round}</span>
                      <input name="link" type="url" placeholder="https://www.youtube.com/watch?v=…" required />
                    </label>
                    <button type="submit" className="ad-btn ad-btn-sm">
                      {v ? "Замінити" : "Поставити"}
                    </button>
                  </form>
                  <div className="ad-acts">
                    {v && (
                      <form action={setVideoAction}>
                        <input type="hidden" name="key" value={key} />
                        <input type="hidden" name="remove" value="1" />
                        <button type="submit" className="ad-btn ad-btn-sm ad-btn-ghost">
                          Прибрати відео
                        </button>
                      </form>
                    )}
                    <Link className="ad-btn ad-btn-sm ad-btn-ghost" href={`/admin/photos/race/${cal.season}-${c.round}`}>
                      Банер гонки
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section className="ad-panel" aria-labelledby="ad-other">
        <h2 id="ad-other">Інший етап</h2>
        <form action={setVideoAction} className="ad-search">
          <label className="ad-fld">
            <span>Рік/етап</span>
            <input name="key" required pattern="\d{4}/\d{1,2}" placeholder="2019/5" inputMode="numeric" />
          </label>
          <label className="ad-fld">
            <span>Посилання YouTube</span>
            <input name="link" type="url" required placeholder="https://www.youtube.com/watch?v=…" />
          </label>
          <button type="submit" className="ad-btn">
            Поставити
          </button>
        </form>
      </section>
    </section>
  );
}
