"use server";

import { redirect } from "next/navigation";
import { GitHub, githubEnv, publish, readMain } from "@/lib/admin/github";
import { commonsFile, downloadThumb } from "@/lib/admin/photos/commons";
import { findItem, targetOf, type Kind } from "@/lib/admin/photos/catalog";
import { classifyLicense } from "@/lib/admin/photos/license";
import { PhotoError, renderFormat } from "@/lib/admin/photos/render";
import { applySlot, formatsFor, jsonFor, removeSlot, type Part, type RenderedSet } from "@/lib/admin/photos/slots";
import { requireAdmin } from "@/lib/admin/session";
import type { Credit } from "@/lib/data/types";

/**
 * Публікація фото (7b). Публічний POST — тож requireAdmin() першим; з форми — лише ідентифікатори й вибір, решта
 * (файл Commons, автор, ліцензія) — з Commons на сервері. Власне фото: ≤ 4 МБ (ліміт тіла функції Vercel 4,5 МБ —
 * браузер заздалегідь зменшує до 2560 px), автор, ліцензія, посилання й підтвердження прав — обов'язкові.
 */
const KINDS = new Set<Kind>(["driver", "team", "season", "circuit", "race"]);
const PARTS = new Set<Part>(["both", "card", "hero"]);
const MAX_UPLOAD = 4 * 1024 * 1024;
const UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const str = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

export async function publishPhotoAction(form: FormData): Promise<void> {
  await requireAdmin();
  const kind = str(form, "kind") as Kind;
  const id = str(form, "id", 64);
  const back = (r: string, extra = "") => redirect(`/admin/photos/${kind}/${encodeURIComponent(id)}?r=${r}${extra}`);
  if (!KINDS.has(kind)) redirect("/admin/photos");
  const part = (PARTS.has(str(form, "part") as Part) ? str(form, "part") : "both") as Part;
  const item = await findItem(kind, id);
  const target = item && targetOf(kind, id, item.paired ? part : "hero");
  const env = githubEnv();
  if (!item || !target) back("bad");
  if (!env) back("no-github");
  const fx = Number(str(form, "fx", 6));
  const fy = Number(str(form, "fy", 6));
  const focus = { x: Number.isFinite(fx) ? Math.min(100, Math.max(0, fx)) / 100 : 0.5, y: Number.isFinite(fy) ? Math.min(100, Math.max(0, fy)) / 100 : 0.5 };

  let bytes: Uint8Array;
  let credit: Credit;
  let nc = false;
  if (str(form, "source") === "upload") {
    const file = form.get("file");
    const author = str(form, "author", 200);
    const license = str(form, "license", 100);
    const page = str(form, "page", 500);
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD || !UPLOAD_TYPES.has(file.type)) back("upload-file");
    if (!author || !license || form.get("rights") !== "on" || !/^https:\/\/[^\s]+$/.test(page)) back("upload-fields");
    const verdict = classifyLicense(license);
    if (verdict.level === "no") back("license");
    nc = verdict.level === "nc";
    bytes = new Uint8Array(await (file as File).arrayBuffer());
    credit = { page, author, license };
  } else {
    const file = await commonsFile(str(form, "title", 240), 1280).catch(() => null);
    if (!file) back("commons");
    if (file!.verdict.level === "no") back("license");
    nc = file!.verdict.level === "nc";
    bytes = await downloadThumb(file!.thumb).catch(() => back("commons") as never);
    credit = { page: file!.page, author: file!.author, license: file!.license };
  }

  let sets: RenderedSet[];
  try {
    sets = await Promise.all(
      formatsFor(target!).map(async (f) => ({ role: f.role, format: f.format, variants: await renderFormat(bytes, f.format, f.base, focus) })),
    );
  } catch (e) {
    back(e instanceof PhotoError ? "too-small" : "render");
    return;
  }

  let number = 0;
  try {
    const gh = new GitHub(env!);
    const files = applySlot(target!, sets!, credit, focus, await readMain(gh, jsonFor(target!)));
    const where = item!.paired ? { both: "картка й банер", card: "лише картка", hero: "лише банер" }[part] : "банер";
    const res = await publish(gh, {
      section: "photos",
      title: `Фото · ${item!.name} (${where})`,
      body: [
        `Нове фото: ${credit.page}`,
        `Автор: ${credit.author} · ліцензія: ${credit.license}${nc ? " — ⚠️ лише некомерційно (NC): замінити, якщо з'явиться реклама, підписка чи спонсор" : ""}.`,
      ].join("\n"),
      files,
      draft: str(form, "mode") === "draft",
    });
    number = res.number;
  } catch {
    back("github");
  }
  back(str(form, "mode") === "draft" ? "draft" : "published", `&pr=${number}`);
}

/** Зняти за запитом автора: файли видаляються, посилання в JSON прибираються; заміну шукаємо потім. */
export async function takedownAction(form: FormData): Promise<void> {
  await requireAdmin();
  const kind = str(form, "kind") as Kind;
  const id = str(form, "id", 64);
  const back = (r: string, extra = "") => redirect(`/admin/photos/${kind}/${encodeURIComponent(id)}?r=${r}${extra}`);
  if (!KINDS.has(kind)) redirect("/admin/photos");
  const item = await findItem(kind, id);
  // Команда — завжди обидва (без картки банер на сторінці команди не показується).
  const part = kind === "team" ? "both" : ((PARTS.has(str(form, "part") as Part) ? str(form, "part") : "both") as Part);
  const target = item && targetOf(kind, id, item.paired ? part : "hero");
  const env = githubEnv();
  if (!item || !target || form.get("confirm") !== "on") back("bad");
  if (!env) back("no-github");
  let number = 0;
  try {
    const gh = new GitHub(env!);
    const files = removeSlot(target!, await readMain(gh, jsonFor(target!)));
    const reason = str(form, "reason", 300);
    const res = await publish(gh, {
      section: "takedown",
      title: `Знято за запитом автора · ${item!.name}`,
      body: `Фото знято з сайту за запитом автора${reason ? `: ${reason}` : ""}. Заміну шукаємо окремо.`,
      files,
      draft: false,
    });
    number = res.number;
  } catch {
    back("github");
  }
  back("removed", `&pr=${number}`);
}
