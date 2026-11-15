import "server-only";
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
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

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
    const url = path.startsWith("/graphql") ? `${this.env.api}${path}` : `${this.env.api}/repos/${this.env.repo}${path}`;
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

export type FileChange = { path: string; content: string | Uint8Array | null };
export type Draft = { section: string; title: string; body: string; files: FileChange[]; draft: boolean };
export type Published = { number: number; url: string; branch: string };

const toBase64 = (c: string | Uint8Array) => Buffer.from(typeof c === "string" ? new TextEncoder().encode(c) : c).toString("base64");

/** Мітка часу гілки: 20261115-142233 (UTC). */
export function branchName(section: string, now = new Date()): string {
  if (!/^[a-z0-9-]{1,32}$/.test(section)) throw new Error(`розділ: ${section}`);
  const t = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `admin/${section}-${t}`;
}

/** Гілка від свіжого main + коміт + PR. Будь-який шлях поза дозволеними — помилка ДО першого запиту. */
export async function publish(gh: GitHub, change: Draft, now = new Date()): Promise<Published> {
  if (change.files.length === 0) throw new Error("немає змін");
  for (const f of change.files) if (!isAdminPath(f.path)) throw new Error(`шлях поза контентом: ${f.path}`);
  if (new Set(change.files.map((f) => f.path)).size !== change.files.length) throw new Error("один файл двічі");

  const main = await gh.request<{ object: { sha: string } }>("GET", "/git/ref/heads/main");
  const base = await gh.request<{ tree: { sha: string } }>("GET", `/git/commits/${main.object.sha}`);
  const tree = [];
  for (const f of change.files) {
    if (f.content === null) {
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
    parents: [main.object.sha],
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
  await gh.request("POST", `/issues/${pr.number}/labels`, { labels: [ADMIN_LABEL] });
  return { number: pr.number, url: pr.html_url, branch };
}
