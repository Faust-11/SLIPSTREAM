import type { Metadata } from "next";
import { deployHookUrl } from "@/lib/admin/github";
import { loadOverview, runLevel, type Level, type RunInfo } from "@/lib/admin/overview";
import { requireAdmin } from "@/lib/admin/session";
import { deployAction, rollbackAction } from "./actions";

export const metadata: Metadata = { title: "Огляд" };

/** Повідомлення після дій (код з адреси — лише з цього списку, довільний текст з адреси не показуємо). */
const RESULTS: Record<string, { level: Level; text: string }> = {
  "revert-ok": { level: "ok", text: "Відкат створено: PR пройде перевірки й зіллється сам (~10–15 хв)." },
  "revert-refused": { level: "one", text: "Відкат неможливий автоматично: файли змінились після цієї правки або правка не з адмінки." },
  "revert-error": { level: "bad", text: "GitHub не прийняв відкат. Спробуйте пізніше." },
  "deploy-ok": { level: "ok", text: "Збірку проду запущено. Статус оновиться за ~5 хв." },
  "deploy-error": { level: "bad", text: "Vercel не прийняв запит на збірку." },
  "no-hook": { level: "one", text: "Deploy Hook не налаштовано (змінна ADMIN_VERCEL_DEPLOY_HOOK)." },
  bad: { level: "bad", text: "Некоректний запит." },
};

const fmt = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const when = (iso: string) => `${fmt.format(new Date(iso))} UTC`;

function Chip({ level, children }: { level: Level; children: React.ReactNode }) {
  return <span className={`ad-chip is-${level}`}>{children}</span>;
}

function runLabel(run: RunInfo): string {
  if (!run) return "немає даних";
  if (run.status !== "completed") return "виконується";
  return run.conclusion === "success" ? "успішно" : "помилка";
}

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  await requireAdmin();
  const [o, { r }] = await Promise.all([loadOverview(), searchParams]);
  const result = r ? RESULTS[r] : undefined;
  const gh = o.github;
  const canDeploy = !!deployHookUrl() && gh?.main.deploy.level === "bad";

  return (
    <section className="ad-view" aria-labelledby="ad-h">
      <header className="ad-vh">
        <div>
          <p className="ad-crumb">Адмінка</p>
          <h1 id="ad-h" className="display">
            Огляд
          </h1>
        </div>
        <a className="ad-btn" href="/uk" target="_blank" rel="noopener">
          Відкрити сайт ↗
        </a>
      </header>
      {result && (
        <p className={`ad-result is-${result.level}`} role="status">
          {result.text}
        </p>
      )}

      <div className="ad-grid2">
        <section className="ad-panel ad-span2" aria-labelledby="ad-fresh">
          <h2 id="ad-fresh">Свіжість і прод</h2>
          <div className="ad-tbl">
            <table>
              <thead>
                <tr>
                  <th scope="col">Що</th>
                  <th scope="col">Останнє</th>
                  <th scope="col">Стан</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <b>Результати в базі</b>
                    <small>Jolpica → data-sync (GitHub Actions)</small>
                  </td>
                  <td className="ad-mono">
                    {o.site.lastRace ? `етап ${o.site.done} з ${o.site.total}, ${o.site.lastRace}` : "сезон ще не почався"}
                  </td>
                  <td>{o.site.lag ? <Chip level="bad">Бракує етапу {o.site.lag.round}</Chip> : <Chip level="ok">Свіже</Chip>}</td>
                </tr>
                <tr>
                  <td>
                    <b>Синхронізація даних</b>
                    <small>data-sync: пн і чт, у гоночні вихідні — щогодини</small>
                  </td>
                  <td className="ad-mono">{gh?.dataSync ? when(gh.dataSync.at) : "—"}</td>
                  <td>{gh ? <Chip level={runLevel(gh.dataSync)}>{runLabel(gh.dataSync)}</Chip> : <Chip level="one">невідомо</Chip>}</td>
                </tr>
                <tr>
                  <td>
                    <b>Перевірки main</b>
                    <small>CI: unit, формат історій, e2e</small>
                  </td>
                  <td className="ad-mono">{gh?.ciMain ? `${gh.ciMain.sha.slice(0, 7)} · ${when(gh.ciMain.at)}` : "—"}</td>
                  <td>
                    {gh ? <Chip level={runLevel(gh.ciMain)}>{runLabel(gh.ciMain)}</Chip> : <Chip level="one">невідомо</Chip>}
                    {gh?.ciMain && gh.ciMain.sha !== gh.main.sha && <small>Останній коміт main перевірено лише в PR</small>}
                  </td>
                </tr>
                <tr>
                  <td>
                    <b>Сайт (прод)</b>
                    <small>Vercel збирає кожен коміт main</small>
                  </td>
                  <td className="ad-mono">{gh ? `${gh.main.sha.slice(0, 7)} · ${when(gh.main.at)}` : "—"}</td>
                  <td>
                    {gh ? <Chip level={gh.main.deploy.level}>{gh.main.deploy.label}</Chip> : <Chip level="one">невідомо</Chip>}
                    {canDeploy && (
                      <form action={deployAction} className="ad-inline">
                        <button type="submit" className="ad-btn ad-btn-sm ad-btn-primary">
                          Викласти
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="ad-panel" aria-labelledby="ad-att">
          <h2 id="ad-att">Потребує уваги</h2>
          {o.attention.length === 0 ? (
            <p className="ad-empty">Усе гаразд.</p>
          ) : (
            <ul className="ad-att">
              {o.attention.map((a) => (
                <li key={a.title} className={`is-${a.level}`}>
                  <b>{a.href ? <a href={a.href}>{a.title}</a> : a.title}</b>
                  <span>{a.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ad-panel" aria-labelledby="ad-cov">
          <h2 id="ad-cov">Наповнення</h2>
          {o.coverage.map((c) => (
            <div key={c.label} className="ad-cov">
              <div className="ad-cov-h">
                <span>{c.label}</span>
                <b className="ad-mono">
                  {c.have} / {c.total}
                </b>
              </div>
              <span className="ad-pbar" role="img" aria-label={`${c.label}: ${c.have} з ${c.total}`}>
                <i style={{ width: `${c.total ? Math.round((c.have / c.total) * 100) : 0}%` }} />
              </span>
            </div>
          ))}
        </section>

        <section className="ad-panel ad-span2" aria-labelledby="ad-log">
          <h2 id="ad-log">Журнал правок</h2>
          {!gh ? (
            <p className="ad-empty">Журнал — з GitHub; GitHub {o.githubError ? "зараз не відповідає" : "не підключено"}.</p>
          ) : gh.journal.length === 0 && gh.open.length === 0 ? (
            <p className="ad-empty">Правок з адмінки ще не було.</p>
          ) : (
            <ul className="ad-log">
              {gh.open.map((p) => (
                <li key={p.number}>
                  <span className="ad-mono">{p.draft ? "чернетка" : "перевірка"}</span>
                  <b>
                    <a href={p.url} target="_blank" rel="noopener">
                      {p.title}
                    </a>
                  </b>
                  <span className="ad-mono">#{p.number}</span>
                </li>
              ))}
              {gh.journal.map((p) => (
                <li key={p.number}>
                  <span className="ad-mono">{when(p.mergedAt)}</span>
                  <b>
                    <a href={p.url} target="_blank" rel="noopener">
                      {p.title}
                    </a>
                  </b>
                  <form action={rollbackAction}>
                    <input type="hidden" name="pr" value={p.number} />
                    <button type="submit" className="ad-btn ad-btn-sm ad-btn-ghost">
                      Відкотити
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
