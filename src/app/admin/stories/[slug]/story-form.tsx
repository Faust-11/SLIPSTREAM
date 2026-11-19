"use client";

import { useActionState, useEffect, useRef } from "react";
import type { Fields } from "@/lib/admin/stories/form";
import { saveStoryAction, type SaveState } from "../actions";

/**
 * Форма редактора історії (7c). Звичайна HTML-форма з неконтрольованими полями: після відповіді дії форма
 * перемонтується (key = nonce) зі значеннями, які повернув сервер, — тож помилка валідації нічого не стирає.
 * Нове твердження/джерело — останній порожній рядок. Імена полів — src/lib/admin/stories/form.ts.
 */
const IDLE: SaveState = { status: "idle" };

/** Скільки рядків малювати: до останнього непорожнього (id/текст/назва/адреса) + один порожній для нового. */
function rows(f: Fields, prefix: "c" | "s", probe: readonly string[]): number {
  const total = Number(f[prefix === "c" ? "claims" : "sources"] ?? 0) || 0;
  let last = -1;
  for (let i = 0; i < total; i++) if (probe.some((k) => (f[`${prefix}.${i}.${k}`] ?? "") !== "")) last = i;
  return last + 2;
}

export type TranslationProp = { status: "ok" | "stale" | "unmarked"; staleKeys: string[]; note: string };

/** Підказка під English-полем: оригінал змінився після останньої звірки. */
function StaleHint({ id, show }: { id: string; show: boolean }) {
  return show ? (
    <small id={id} className="ad-stale">
      Оригінал змінено після звірки — перевірте переклад.
    </small>
  ) : null;
}

export function StoryForm({ slug, initial, orig, translation }: { slug: string; initial: Fields; orig: string; translation: TranslationProp }) {
  const [state, action, pending] = useActionState(saveStoryAction, IDLE);
  const f = state.status === "idle" ? initial : state.fields;
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status !== "idle") summary.current?.focus();
  }, [state]);
  const v = (name: string) => f[name] ?? "";
  const nClaims = rows(f, "c", ["id", "text"]);
  const nSources = rows(f, "s", ["id", "title", "url"]);
  const key = state.status === "idle" ? "initial" : String(state.nonce);
  const stale = (k: string) => translation.staleKeys.includes(k);

  return (
    <form action={action} key={key} className="ad-ed" aria-busy={pending}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="orig" value={orig} />
      <input type="hidden" name="claims" value={nClaims} />
      <input type="hidden" name="sources" value={nSources} />

      <div ref={summary} tabIndex={-1} className="ad-ed-summary">
        {state.status === "error" && (
          <div className="ad-result is-bad" role="alert">
            <h2>Не збережено ({state.errors.length})</h2>
            <ul>
              {state.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {state.status === "saved" && (
          <div className="ad-result is-ok" role="status">
            <h2>PR #{state.pr} створено</h2>
            <p>
              Зміни: {state.changes.join("; ")}. Перевірки й злиття — автоматично (≈ 10–25 хв; якщо змінювався story.json — довше через Lighthouse), далі
              Vercel викладе сайт. Стежити:{" "}
              <a href={state.url} target="_blank" rel="noopener">
                PR #{state.pr}
              </a>
              .
            </p>
            {state.warnings.length > 0 && (
              <ul>
                {state.warnings.map((w) => (
                  <li key={w}>Попередження: {w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <section className="ad-panel" aria-labelledby="ed-main">
        <h2 id="ed-main">Основне</h2>
        <div className="ad-grid2">
          <label className="ad-fld">
            <span>Видимість на сайті</span>
            <select name="status" defaultValue={v("status") === "draft" ? "draft" : "published"}>
              <option value="published">Опубліковано</option>
              <option value="draft">Чернетка (на сайті немає)</option>
            </select>
          </label>
          <label className="ad-fld">
            <span>Джерела перевірено (дата)</span>
            <input type="text" name="checked" defaultValue={v("checked")} inputMode="numeric" placeholder="2026-11-15" />
          </label>
          <label className="ad-fld">
            <span>Заголовок · українська</span>
            <input type="text" name="title_uk" defaultValue={v("title_uk")} />
          </label>
          <label className="ad-fld">
            <span>Title · English</span>
            <input type="text" name="title_en" defaultValue={v("title_en")} aria-describedby={stale("title") ? "stale-title" : undefined} />
            <StaleHint id="stale-title" show={stale("title")} />
          </label>
          <label className="ad-fld">
            <span>Лід · українська</span>
            <textarea name="dek_uk" rows={3} defaultValue={v("dek_uk")} />
          </label>
          <label className="ad-fld">
            <span>Lead · English</span>
            <textarea name="dek_en" rows={3} defaultValue={v("dek_en")} aria-describedby={stale("dek") ? "stale-dek" : undefined} />
            <StaleHint id="stale-dek" show={stale("dek")} />
          </label>
          <label className="ad-fld">
            <span>Штамп (kicker) · українська</span>
            <input type="text" name="kicker_uk" defaultValue={v("kicker_uk")} />
          </label>
          <label className="ad-fld">
            <span>Kicker · English</span>
            <input type="text" name="kicker_en" defaultValue={v("kicker_en")} aria-describedby={stale("kicker") ? "stale-kicker" : undefined} />
            <StaleHint id="stale-kicker" show={stale("kicker")} />
          </label>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="ed-text">
        <h2 id="ed-text">Текст</h2>
        <p className="ad-note">
          Markdown за форматом <span className="ad-mono">content/stories/README.md</span>: розділи <span className="ad-mono">##</span>, виноски{" "}
          <span className="ad-mono">[^c12]</span> після кожного факту, блоки <span className="ad-mono">:::tldr</span> / <span className="ad-mono">:::timeline</span>,
          фото <span className="ad-mono">[[media:m1]]</span> окремим рядком. Виноски в обох мовах мають збігатися.
        </p>
        <label className="ad-fld">
          <span>Українська (оригінал)</span>
          <textarea name="md_uk" className="ad-ed-md" rows={24} spellCheck defaultValue={v("md_uk")} lang="uk" />
        </label>
        <label className="ad-fld">
          <span>English (переклад)</span>
          <textarea name="md_en" className="ad-ed-md" rows={24} spellCheck defaultValue={v("md_en")} lang="en" aria-describedby="tr-note" />
        </label>
        <div id="tr-note" className="ad-tr">
          {translation.status === "ok" && <p className="ad-note">Переклад відповідає оригіналу за останньою звіркою.</p>}
          {translation.status === "unmarked" && <p className="ad-note">Звірку English з оригіналом ще не відмічали — після звірки поставте галочку нижче.</p>}
          {translation.status === "stale" && (
            <p className="ad-result is-bad">
              <b>Переклад English застарів:</b> {translation.note}. Оновіть English і поставте галочку нижче — або залиште як є, і історія лишиться в списку «Переклад EN: перевірити».
            </p>
          )}
          <label className="ad-check">
            <input type="checkbox" name="translated_ok" defaultChecked={v("translated_ok") === "on"} /> Переклад English відповідає українському оригіналу (запам&apos;ятати як звірений)
          </label>
        </div>
      </section>

      <section className="ad-panel" aria-labelledby="ed-claims">
        <h2 id="ed-claims">Твердження · {nClaims - 1}</h2>
        <p className="ad-note">
          Статус: <b>ok</b> — щонайменше два незалежні видавці; <b>one</b> — одне джерело; <b>dis</b> — джерела розходяться (потрібні пояснення нижче рядка).
          Джерела — id через кому (<span className="ad-mono">s1, s4</span>). Останній порожній рядок — нове твердження.
        </p>
        <ol className="ad-ed-list">
          {Array.from({ length: nClaims }, (_, i) => {
            const id = v(`c.${i}.id`);
            const dis = v(`c.${i}.status`) === "dis";
            return (
              <li key={i}>
                <fieldset className="ad-ed-row">
                  <legend>{id || "Нове твердження"}</legend>
                  <input type="hidden" name={`c.${i}.id`} value={id} />
                  <div className="ad-ed-line">
                    <label className="ad-fld">
                      <span>Статус</span>
                      <select name={`c.${i}.status`} defaultValue={v(`c.${i}.status`) || "one"}>
                        <option value="ok">ok · ≥2 джерела</option>
                        <option value="one">one · одне</option>
                        <option value="dis">dis · спірне</option>
                      </select>
                    </label>
                    <label className="ad-fld ad-ed-grow">
                      <span>Джерела</span>
                      <input type="text" name={`c.${i}.sources`} defaultValue={v(`c.${i}.sources`)} spellCheck={false} />
                    </label>
                    {id && (
                      <label className="ad-check">
                        <input type="checkbox" name={`c.${i}.del`} defaultChecked={v(`c.${i}.del`) === "on"} /> Видалити
                      </label>
                    )}
                  </div>
                  <label className="ad-fld">
                    <span>Що стверджуємо</span>
                    <textarea name={`c.${i}.text`} rows={2} defaultValue={v(`c.${i}.text`)} />
                  </label>
                  <details open={dis}>
                    <summary>Пояснення розбіжності (для статусу dis)</summary>
                    <label className="ad-fld">
                      <span>Нотатка редактора</span>
                      <textarea name={`c.${i}.note`} rows={2} defaultValue={v(`c.${i}.note`)} />
                    </label>
                    <div className="ad-grid2">
                      <label className="ad-fld">
                        <span>Назва суперечки · uk</span>
                        <input type="text" name={`c.${i}.label_uk`} defaultValue={v(`c.${i}.label_uk`)} />
                      </label>
                      <label className="ad-fld">
                        <span>Dispute title · en</span>
                        <input type="text" name={`c.${i}.label_en`} defaultValue={v(`c.${i}.label_en`)} />
                      </label>
                      <label className="ad-fld">
                        <span>Для читача · uk</span>
                        <textarea name={`c.${i}.reader_uk`} rows={3} defaultValue={v(`c.${i}.reader_uk`)} />
                      </label>
                      <label className="ad-fld">
                        <span>For the reader · en</span>
                        <textarea name={`c.${i}.reader_en`} rows={3} defaultValue={v(`c.${i}.reader_en`)} />
                      </label>
                    </div>
                  </details>
                </fieldset>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="ad-panel" aria-labelledby="ed-sources">
        <h2 id="ed-sources">Джерела · {nSources - 1}</h2>
        <p className="ad-note">
          Вікіпедія — не джерело. Незалежність — за видавцем: дві статті одного видання чи два документи FIA — одне джерело. Видалити джерело, на яке
          посилається твердження, не вийде — спершу приберіть його з тверджень.
        </p>
        <ol className="ad-ed-list">
          {Array.from({ length: nSources }, (_, i) => {
            const id = v(`s.${i}.id`);
            return (
              <li key={i}>
                <fieldset className="ad-ed-row">
                  <legend>{id || "Нове джерело"}</legend>
                  <input type="hidden" name={`s.${i}.id`} value={id} />
                  <div className="ad-grid2">
                    <label className="ad-fld">
                      <span>Назва</span>
                      <input type="text" name={`s.${i}.title`} defaultValue={v(`s.${i}.title`)} />
                    </label>
                    <label className="ad-fld">
                      <span>Видавець</span>
                      <input type="text" name={`s.${i}.publisher`} defaultValue={v(`s.${i}.publisher`)} />
                    </label>
                  </div>
                  <label className="ad-fld">
                    <span>URL</span>
                    <input type="url" name={`s.${i}.url`} defaultValue={v(`s.${i}.url`)} spellCheck={false} />
                  </label>
                  <div className="ad-ed-line">
                    <label className="ad-fld">
                      <span>Тип</span>
                      <select name={`s.${i}.kind`} defaultValue={v(`s.${i}.kind`) || "secondary"}>
                        <option value="primary">primary · першоджерело</option>
                        <option value="secondary">secondary</option>
                      </select>
                    </label>
                    <label className="ad-fld">
                      <span>Мова</span>
                      <input type="text" name={`s.${i}.lang`} defaultValue={v(`s.${i}.lang`) || "en"} size={4} />
                    </label>
                    <label className="ad-fld">
                      <span>Дата</span>
                      <input type="text" name={`s.${i}.date`} defaultValue={v(`s.${i}.date`)} placeholder="2008-09-28" />
                    </label>
                    <label className="ad-fld ad-ed-grow">
                      <span>Автор</span>
                      <input type="text" name={`s.${i}.author`} defaultValue={v(`s.${i}.author`)} />
                    </label>
                  </div>
                  <label className="ad-fld">
                    <span>Копія в Web Archive (URL)</span>
                    <input type="url" name={`s.${i}.archive`} defaultValue={v(`s.${i}.archive`)} spellCheck={false} />
                  </label>
                  {id && (
                    <label className="ad-check">
                      <input type="checkbox" name={`s.${i}.del`} defaultChecked={v(`s.${i}.del`) === "on"} /> Видалити джерело
                    </label>
                  )}
                </fieldset>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="ad-ed-bar">
        <button type="submit" className="ad-btn ad-btn-primary" disabled={pending}>
          {pending ? "Публікую…" : "Опублікувати зміни"}
        </button>
        <span className="ad-note">PR → перевірки → автозлиття. Помилки валідації блокують публікацію.</span>
      </div>
    </form>
  );
}
