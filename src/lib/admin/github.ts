import "server-only";
import { LOCAL_HOSTS } from "./local";
import { isAdminPath } from "./paths";

/**
 * Публікація правок адмінки = PR у GitHub (рішення користувача 15.11: контент у репозиторії, автозлиття після
 * зеленого CI — .github/workflows/admin-merge.yml). Git Data API: blobs → tree → commit → гілка `admin/<розділ>-<час>`
 * → PR з міткою `admin`. Чернетка = draft PR (CI на чернетках не запускається).
 *
 * ADMIN_GITHUB_TOKEN — fine-grained токен лише на цей репозиторій (Contents: RW, Pull requests: RW) — тільки сервер.
 * ADMIN_GITHUB_REPO  — owner/name (за замовчуванням Faust-11/SLIPSTREAM).
 * ADMIN_GITHUB_API   — лише фейковий GitHub для e2e на localhost, ніколи на Vercel.
 */

export const ADMIN_LABEL = "admin";
const AUTHOR = { name: "Faust-11", email: "195572242+Faust-11@users.noreply.github.com" };

export type GitHubEnv = { api: string; repo: string; token: string };

export function parseGitHubEnv(env: Record<string, string | undefined>): GitHubEnv | null {
  const token = env.ADMIN_GITHUB_TOKEN ?? "";
  const repo = env.ADMIN_GITHUB_REPO || "Faust-11/SLIPSTREAM";
  if (!token || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) return null;
  let api = "https://api.github.com";
  if (env.ADMIN_GITHUB_API) {
    try {
      const url = new URL(env.ADMIN_GITHUB_API);
      if (env.VERCEL === "1" || !LOCAL_HOSTS.has(url.hostname)) return null;
      api = url.href.replace(/\/$/, "");
    } catch {
      return null;
    }
  }
  return { api, repo, token };
}

export function githubEnv(): GitHubEnv | null {
  return parseGitHubEnv(process.env);
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

export class GitHub {
  constructor(
    private readonly env: GitHubEnv,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.env.api}/repos/${this.env.repo}${path}`;
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.env.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "slipstream-admin",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw new GitHubError(res.status, `GitHub ${method} ${path}: ${res.status}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
}

/** content — новий вміст (null — видалити файл); sha — повернути наявний blob (відкат, без завантаження файлу). */
export type FileChange = { path: string; content: string | Uint8Array | null } | { path: string; sha: string };
export type Draft = { section: string; title: string; body: string; files: FileChange[]; draft: boolean };
export type Published = { number: number; url: string; branch: string };

const toBase64 = (c: string | Uint8Array) => Buffer.from(typeof c === "string" ? new TextEncoder().encode(c) : c).toString("base64");

/** Мітка часу гілки: 20261115-142233 (UTC). */
export function branchName(section: string, now = new Date()): string {
  if (!/^[a-z0-9-]{1,64}$/.test(section)) throw new Error(`розділ: ${section}`);
  const t = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `admin/${section}-${t}`;
}

/** Гілка від свіжого main + коміт + PR. Будь-який шлях поза дозволеними — помилка ДО першого запиту. */
/** parent — коміт main, від якого рахували зміни (відкат): гілка від нього, і якщо main пішов далі, конфлікт побачить злиття. */
export async function publish(gh: GitHub, change: Draft, now = new Date(), parent?: string): Promise<Published> {
  if (change.files.length === 0) throw new Error("немає змін");
  for (const f of change.files) if (!isAdminPath(f.path)) throw new Error(`шлях поза контентом: ${f.path}`);
  if (new Set(change.files.map((f) => f.path)).size !== change.files.length) throw new Error("один файл двічі");

  const mainSha = parent ?? (await gh.request<{ object: { sha: string } }>("GET", "/git/ref/heads/main")).object.sha;
  const base = await gh.request<{ tree: { sha: string } }>("GET", `/git/commits/${mainSha}`);
  const tree = [];
  for (const f of change.files) {
    if ("sha" in f) {
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: f.sha });
    } else if (f.content === null) {
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: null });
    } else {
      const blob = await gh.request<{ sha: string }>("POST", "/git/blobs", { content: toBase64(f.content), encoding: "base64" });
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
  }
  const newTree = await gh.request<{ sha: string }>("POST", "/git/trees", { base_tree: base.tree.sha, tree });
  const stamp = now.toISOString();
  const commit = await gh.request<{ sha: string }>("POST", "/git/commits", {
    message: `${change.title}\n\nАдмінка: ${change.section}.`,
    tree: newTree.sha,
    parents: [mainSha],
    author: { ...AUTHOR, date: stamp },
    committer: { ...AUTHOR, date: stamp },
  });
  const branch = branchName(change.section, now);
  await gh.request("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha: commit.sha });
  const pr = await gh.request<{ number: number; html_url: string }>("POST", "/pulls", {
    title: change.title,
    head: branch,
    base: "main",
    body: `${change.body}\n\n— Адмінка Slipstream. Автозлиття після зеленого CI: .github/workflows/admin-merge.yml.`,
    draft: change.draft,
  });
  try {
    await gh.request("POST", `/issues/${pr.number}/labels`, { labels: [ADMIN_LABEL] });
  } catch (e) {
    // PR без мітки не зіллється й не видно в Огляді — прибираємо його, щоб повторна спроба не плодила дублікати.
    await gh.request("PATCH", `/pulls/${pr.number}`, { state: "closed" }).catch(() => {});
    await gh.request("DELETE", `/git/refs/heads/${branch}`).catch(() => {});
    throw e;
  }
  return { number: pr.number, url: pr.html_url, branch };
}

// ---------------------------------------------------------------------------------------------------------------

export class RevertRefused extends Error {}

const contentsPath = (path: string) => `/contents/${path.split("/").map(encodeURIComponent).join("/")}`;

async function blobSha(gh: GitHub, path: string, ref: string): Promise<string | null> {
  try {
    return (await gh.request<{ sha: string }>("GET", `${contentsPath(path)}?ref=${encodeURIComponent(ref)}`)).sha;
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Відкат злитої правки адмінки = новий PR, що повертає файли до стану перед нею (той самий конвеєр: CI → автозлиття).
 * Відмова, якщо PR не з адмінки, не злитий, з кількох комітів або якийсь файл змінився після нього (відкат стер би
 * пізнішу правку — таке робимо вручну).
 */
export async function revertPublished(gh: GitHub, number: number, now = new Date()): Promise<Published> {
  const pr = await gh.request<{
    title: string;
    merged_at: string | null;
    merge_commit_sha: string | null;
    commits: number;
    labels: { name: string }[];
    base: { ref: string };
    head: { ref: string };
  }>("GET", `/pulls/${number}`);
  if (!pr.labels.some((l) => l.name === ADMIN_LABEL) || pr.base.ref !== "main" || !pr.head.ref.startsWith("admin/")) {
    throw new RevertRefused("це не правка адмінки");
  }
  if (!pr.merged_at || !pr.merge_commit_sha) throw new RevertRefused("правку ще не злито");
  if (pr.commits !== 1) throw new RevertRefused("правка з кількох комітів — відкат вручну");
  const merged = pr.merge_commit_sha;
  const commit = await gh.request<{ parents: { sha: string }[] }>("GET", `/git/commits/${merged}`);
  const before = commit.parents[0]?.sha;
  if (!before) throw new RevertRefused("немає попереднього коміту");
  const title = `Відкат: ${pr.title}`;
  const open = await gh.request<{ title: string; head: { ref: string } }[]>("GET", "/pulls?state=open&per_page=100");
  if (open.some((p) => p.title === title && p.head.ref.startsWith("admin/revert-"))) throw new RevertRefused("відкат уже створено");
  const files = await gh.request<{ filename: string; status: string; previous_filename?: string }[]>("GET", `/pulls/${number}/files?per_page=100`);
  if (files.length >= 100) throw new RevertRefused("забагато файлів — відкат вручну");

  // Стан main фіксуємо один раз: перевірка «не змінився» і новий коміт — від того самого коміту (рев'ю 7a: інакше
  // правка, що встигла між ними, тихо перезаписувалась).
  const main = (await gh.request<{ object: { sha: string } }>("GET", "/git/ref/heads/main")).object.sha;
  const paths = files.flatMap((f) => (f.previous_filename ? [f.filename, f.previous_filename] : [f.filename]));
  for (const path of paths) if (!isAdminPath(path)) throw new RevertRefused(`файл поза контентом: ${path}`);
  const changes: FileChange[] = [];
  // Пачками по 8 файлів (3 запити на файл): швидше за послідовно і без сплеску, що впирається в ліміти GitHub.
  for (let i = 0; i < paths.length; i += 8) {
    const batch = await Promise.all(
      paths.slice(i, i + 8).map(async (path) => {
        const [onMain, afterEdit, beforeEdit] = await Promise.all([blobSha(gh, path, main), blobSha(gh, path, merged), blobSha(gh, path, before)]);
        if (onMain !== afterEdit) throw new RevertRefused(`файл змінився після цієї правки: ${path}`);
        return beforeEdit ? { path, sha: beforeEdit } : { path, content: null };
      }),
    );
    changes.push(...batch);
  }
  return publish(
    gh,
    { section: "revert", title, body: `Відкат правки #${number} (файли — як до неї, коміт ${before.slice(0, 7)}).`, files: changes, draft: false },
    now,
    main,
  );
}

/** Vercel Deploy Hook — лише адреса Vercel (ADMIN_VERCEL_DEPLOY_HOOK, сервер). */
export function deployHookUrl(env: Record<string, string | undefined> = process.env): string | null {
  const url = env.ADMIN_VERCEL_DEPLOY_HOOK ?? "";
  return url.startsWith("https://api.vercel.com/v1/integrations/deploy/") ? url : null;
}

/** Поточний вміст текстових файлів з main (Contents API, ≤ 1 МБ кожен — curated JSON до ~120 КБ, замір 17.11). */
/**
 * Читання від зафіксованого коміту main: його sha — parent для publish(), тож якщо main пішов далі (інша правка злилась
 * між читанням і комітом), конфлікт побачить злиття, а не тихий відкат чужої правки (code-review 7b).
 */
export async function readMain(gh: GitHub, paths: string[]): Promise<{ sha: string; files: Record<string, string> }> {
  const sha = (await gh.request<{ object: { sha: string } }>("GET", "/git/ref/heads/main")).object.sha;
  const out: Record<string, string> = {};
  for (const path of paths) {
    if (!isAdminPath(path)) throw new Error(`шлях поза контентом: ${path}`);
    const f = await gh.request<{ content?: string; encoding?: string; size: number }>("GET", `${contentsPath(path)}?ref=${sha}`);
    if (f.encoding !== "base64" || f.content === undefined) throw new Error(`${path}: завеликий для Contents API`);
    out[path] = Buffer.from(f.content, "base64").toString("utf8");
  }
  return { sha, files: out };
}
