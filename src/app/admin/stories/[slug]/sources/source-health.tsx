"use client";

import { useRef, useState, useTransition } from "react";
import type { CopyResult, SaveResult } from "@/lib/admin/stories/links/archive";
import type { LinkResult } from "@/lib/admin/stories/links/check";
import { checkLinksAction, findCopiesAction, recordArchivesAction, saveCopyAction } from "../../source-actions";

export type SourceRow = { id: string; n: number; title: string; publisher: string; date: string; url: string; host: string; archive: string };

const LINK_BATCH = 6; // перевірка посилань: 0,2–1,2 с на URL (замір 19.11), 6 паралельно
const COPY_BATCH = 4; // Availability API: ~1,7 с на URL (замір 20.11)

const chunk = <T,>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

const LINK_CHIP = { ok: ["is-ok", "Працює"], dead: ["is-bad", "Мертве"], unknown: ["is-one", "Не вдалося перевірити"] } as const;

/**
 * Здоров'я джерел історії: перевірка посилань, пошук копій у Web Archive, збереження копії, запис знайдених у story.json.
 * Усе — за натисканням; результати живуть у цій сторінці й нікуди не зберігаються (рішення 19.11). Пачки викликаються з
 * браузера по черзі, тож є прогрес, а кожен виклик коротший за ліміт функції.
 */
export function SourceHealth({ slug, rows, blocked }: { slug: string; rows: SourceRow[]; blocked: boolean }) {
  const [links, setLinks] = useState<Record<string, LinkResult>>({});
  const [copies, setCopies] = useState<Record<string, CopyResult | SaveResult>>({});
  const [status, setStatus] = useState("");
  const [busy, startBusy] = useTransition();
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  const missing = rows.filter((r) => !r.archive);
  const found = missing.filter((r) => {
    const c = copies[r.id];
    return c && (c.state === "found" || c.state === "saved");
  });
  const archiveOf = (id: string): string | null => {
    const c = copies[id];
    return c && c.state === "found" ? c.archive : c && c.state === "saved" ? c.archive : null;
  };

  function run(label: string, work: () => Promise<void>) {
    stop.current = false;
    setRunning(true);
    startBusy(async () => {
      try {
        await work();
      } catch {
        setStatus(`${label}: збій зв'язку. Спробуйте ще раз.`);
      } finally {
        setRunning(false);
      }
    });
  }

  const checkAll = () =>
    run("Перевірка посилань", async () => {
      setLinks({});
      let done = 0;
      for (const batch of chunk(rows, LINK_BATCH)) {
        if (stop.current) break;
        setStatus(`Перевіряю посилання: ${done} з ${rows.length}…`);
        const r = await checkLinksAction(slug, batch.map((b) => b.id));
        if (!r.ok) return setStatus("Перевірка не вдалась: GitHub не відповів. Спробуйте ще раз.");
        setLinks((prev) => ({ ...prev, ...r.results }));
        done += batch.length;
      }
      setStatus(stop.current ? `Перевірку зупинено: ${done} з ${rows.length}.` : `Перевірено ${done} з ${rows.length}.`);
    });

  const findAll = () =>
    run("Пошук копій", async () => {
      let done = 0;
      for (const batch of chunk(missing, COPY_BATCH)) {
        if (stop.current) break;
        setStatus(`Шукаю копії у Web Archive: ${done} з ${missing.length}…`);
        const r = await findCopiesAction(slug, batch.map((b) => b.id));
        if (!r.ok) return setStatus("Пошук не вдався: GitHub не відповів. Спробуйте ще раз.");
        setCopies((prev) => ({ ...prev, ...r.results }));
        done += batch.length;
      }
      setStatus(stop.current ? `Пошук зупинено: ${done} з ${missing.length}.` : `Опрацьовано ${done} з ${missing.length}.`);
    });

  const saveOne = (id: string) =>
    run("Збереження", async () => {
      setStatus("Зберігаю в Web Archive — це може тривати до хвилини…");
      const r = await saveCopyAction(slug, id);
      if (!r.ok) return setStatus("Не вдалося: джерела немає або GitHub не відповів.");
      setCopies((prev) => ({ ...prev, [id]: r.result }));
      setStatus(
        r.result.state === "saved"
          ? "Збережено. Тепер «Записати знайдені копії в історію»."
          : r.result.state === "pending"
            ? "Web Archive ще зберігає сторінку. Натисніть «Знайти копії» за хвилину."
            : r.result.state === "refused"
              ? `Не архівуємо: ${r.result.detail}.`
              : `Не вдалося: ${r.result.detail}.`,
      );
    });

  const counts = { ok: 0, dead: 0, unknown: 0 };
  for (const r of Object.values(links)) counts[r.state] += 1;
  const checked = Object.keys(links).length;

  return (
    <>
      <div className="ad-acts" role="group" aria-label="Дії з джерелами">
        <button type="button" className="ad-btn" onClick={checkAll} disabled={running || busy}>
          Перевірити посилання
        </button>
        <button type="button" className="ad-btn" onClick={findAll} disabled={running || busy || missing.length === 0}>
          Знайти копії в Web Archive{missing.length ? ` (${missing.length})` : ""}
        </button>
        {running && (
          <button type="button" className="ad-btn ad-btn-ghost" onClick={() => (stop.current = true)}>
            Зупинити
          </button>
        )}
      </div>
      <p className="ad-note" role="status" aria-live="polite">
        {status}
        {checked > 0 && ` Працює: ${counts.ok} · мертвих: ${counts.dead} · не вдалося перевірити: ${counts.unknown}.`}
      </p>

      <div className="ad-tbl ad-stories" tabIndex={0} role="region" aria-label="Джерела історії">
        <table>
          <thead>
            <tr>
              <th scope="col">Джерело</th>
              <th scope="col">Посилання</th>
              <th scope="col">Копія в Web Archive</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const l = links[r.id];
              const c = copies[r.id];
              const archive = r.archive || archiveOf(r.id);
              return (
                <tr key={r.id}>
                  <th scope="row">
                    <b>
                      {r.n}. {r.publisher}
                      {r.date && `, ${r.date}`}
                    </b>
                    <small>{r.title}</small>
                    <small>
                      <a href={r.url} target="_blank" rel="noopener noreferrer">
                        {r.host}
                        <span className="ad-sr"> (нова вкладка): {r.title}</span> ↗
                      </a>
                    </small>
                  </th>
                  <td data-label="Посилання">
                    {l ? (
                      <>
                        <span className={`ad-chip ${LINK_CHIP[l.state][0]}`}>{LINK_CHIP[l.state][1]}</span>
                        <small>
                          {l.detail}
                          {l.finalUrl && ` → ${new URL(l.finalUrl).hostname}`}
                        </small>
                      </>
                    ) : (
                      <span className="ad-note">не перевірялось</span>
                    )}
                  </td>
                  <td data-label="Копія в Web Archive">
                    {archive ? (
                      <>
                        <a href={archive} target="_blank" rel="noopener noreferrer">
                          Є копія<span className="ad-sr"> (нова вкладка): {r.title}</span> ↗
                        </a>
                        {!r.archive && <small>Знайдено, ще не записано в історію.</small>}
                      </>
                    ) : (
                      <>
                        <span className="ad-note">{c?.state === "none" ? "копії немає" : c?.state === "pending" ? "ще зберігається" : c?.state === "error" || c?.state === "failed" || c?.state === "refused" ? (c as { detail: string }).detail : "немає"}</span>
                        <button type="button" className="ad-btn ad-btn-sm ad-btn-ghost" onClick={() => saveOne(r.id)} disabled={running || busy}>
                          Зберегти в Web Archive<span className="ad-sr"> — {r.title}</span>
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form action={recordArchivesAction} className="ad-acts">
        <input type="hidden" name="slug" value={slug} />
        {found.map((r) => (
          <input key={r.id} type="hidden" name={`a.${r.id}`} value={archiveOf(r.id) ?? ""} />
        ))}
        <button type="submit" className="ad-btn" disabled={found.length === 0 || blocked || running || busy}>
          Записати знайдені копії в історію{found.length ? ` (${found.length})` : ""}
        </button>
        {blocked && <span className="ad-note">Є відкритий PR цієї історії — дочекайтесь злиття.</span>}
      </form>
    </>
  );
}
