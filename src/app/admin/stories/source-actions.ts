"use server";

import { redirect } from "next/navigation";
import { GitHub, githubEnv, publish } from "@/lib/admin/github";
import { requireAdmin } from "@/lib/admin/session";
import { parseStoryJson } from "@/lib/admin/stories/format";
import { findCopy, savePage, type CopyResult, type SaveResult } from "@/lib/admin/stories/links/archive";
import { checkMany, type LinkResult } from "@/lib/admin/stories/links/check";
import { recordArchives } from "@/lib/admin/stories/links/record";
import { isSlug, openStoryPrs, readStory } from "@/lib/admin/stories/store";
import { validateStory } from "@/lib/admin/stories/validate";

/**
 * Здоров'я джерел (7c, задача 7). Кожна дія — публічний POST: requireAdmin() першим. З браузера приходять лише адреса
 * історії й id джерел; САМІ адреси джерел сервер бере зі story.json у main (клієнт не може підсунути довільний URL —
 * інакше це відкритий проксі в мережу з правами сервера). Перевірка адрес — links/ssrf.ts.
 */
const MAX_BATCH = 8;
const SOURCE_ID = /^[A-Za-z0-9_-]{1,16}$/;

async function sourceUrls(slug: string, ids: string[]): Promise<Map<string, string> | null> {
  const env = githubEnv();
  if (!env || !isSlug(slug) || !Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BATCH || !ids.every((i) => typeof i === "string" && SOURCE_ID.test(i))) return null;
  try {
    const story = parseStoryJson((await readStory(new GitHub(env), slug)).files.json).story;
    const byId = new Map((story.sources ?? []).map((s) => [s.id, String(s.url ?? "")]));
    const out = new Map<string, string>();
    for (const id of ids) if (byId.has(id)) out.set(id, byId.get(id)!);
    return out;
  } catch {
    return null;
  }
}

export type CheckReply = { ok: true; results: Record<string, LinkResult> } | { ok: false };

export async function checkLinksAction(slug: string, ids: string[]): Promise<CheckReply> {
  await requireAdmin();
  const urls = await sourceUrls(slug, ids);
  if (!urls) return { ok: false };
  const entries = [...urls];
  const results = await checkMany(entries.map(([, u]) => u));
  return { ok: true, results: Object.fromEntries(entries.map(([id], i) => [id, results[i]!])) };
}

export type CopiesReply = { ok: true; results: Record<string, CopyResult> } | { ok: false };

export async function findCopiesAction(slug: string, ids: string[]): Promise<CopiesReply> {
  await requireAdmin();
  const urls = await sourceUrls(slug, ids);
  if (!urls) return { ok: false };
  const entries = [...urls];
  const results = await Promise.all(entries.map(([, u]) => findCopy(u)));
  return { ok: true, results: Object.fromEntries(entries.map(([id], i) => [id, results[i]!])) };
}

export type SaveReply = { ok: true; result: SaveResult } | { ok: false };

/** Save Page Now — по одному джерелу: збереження триває секунди чи понад хвилину (замір 20.11). */
export async function saveCopyAction(slug: string, id: string): Promise<SaveReply> {
  await requireAdmin();
  const urls = await sourceUrls(slug, [id]);
  const url = urls?.get(id);
  if (!url) return { ok: false };
  return { ok: true, result: await savePage(url) };
}

/** Записати знайдені копії у story.json → PR (той самий конвеєр, що й редактор). Поля `a.<id>` = адреса знімка. */
export async function recordArchivesAction(form: FormData): Promise<void> {
  await requireAdmin();
  const slug = String(form.get("slug") ?? "");
  if (!isSlug(slug)) redirect("/admin/stories");
  const back = (r: string, extra = ""): never => redirect(`/admin/stories/${slug}/sources?r=${r}${extra}`);
  const copies: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    const m = /^a\.([A-Za-z0-9_-]{1,16})$/.exec(key);
    if (m && m[1] !== "__proto__" && typeof value === "string" && copies[m[1]!] === undefined && Object.keys(copies).length < 300) copies[m[1]!] = value.slice(0, 600);
  }
  if (Object.keys(copies).length === 0) back("none");
  const env = githubEnv();
  if (!env) back("no-github");
  const gh = new GitHub(env!);
  const main = await readStory(gh, slug).catch(() => null);
  if (!main) back("github");
  const open = await openStoryPrs(gh, slug).catch(() => null);
  if (!open) back("github");
  if (open!.length) back("open-pr");
  const rec = recordArchives(main!.files.json, copies);
  if (rec.added.length === 0) back("none");
  const v = validateStory(slug, parseStoryJson(rec.json).story, { uk: main!.files.uk, en: main!.files.en });
  if (v.errors.length) back("invalid");

  let number = 0;
  let failed = false;
  try {
    const res = await publish(
      gh,
      {
        section: `stories-${slug}`,
        title: `Історія · ${slug}: копії джерел у Web Archive (${rec.added.length})`,
        body: `Історія **${slug}**: записано адреси копій у Web Archive для джерел ${rec.added.join(", ")}.`,
        files: [{ path: `content/stories/${slug}/story.json`, content: rec.json }],
        draft: false,
      },
      undefined,
      main!.sha,
    );
    number = res.number;
  } catch {
    failed = true;
  }
  if (failed) back("github");
  back("published", `&pr=${number}&n=${rec.added.length}`);
}
