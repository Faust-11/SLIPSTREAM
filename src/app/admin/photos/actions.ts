"use server";

import { redirect } from "next/navigation";
import { GitHub, githubEnv, publish, readMain } from "@/lib/admin/github";
import { commonsFile, downloadThumb } from "@/lib/admin/photos/commons";
import { findItem, targetOf, type Kind } from "@/lib/admin/photos/catalog";
import { classifyLicense } from "@/lib/admin/photos/license";
import { PhotoError, renderFormat } from "@/lib/admin/photos/render";
import { NothingToRemove, applySlot, formatsFor, jsonFor, removeSlot, type Part, type RenderedSet } from "@/lib/admin/photos/slots";
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
/** Ліцензії власного фото — рівно ті, що у формі (вільний текст не приймаємо: «Attribution-NoDerivatives» класифікатор
 *  пропустив би як «вільну» — рев'ю 7b). */
const UPLOAD_LICENSES = ["CC BY 4.0", "CC BY-SA 4.0", "CC0", "CC BY-NC 4.0"] as const;

const str = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

export async function publishPhotoAction(form: FormData): Promise<void> {
  await requireAdmin();
  const kind = str(form, "kind") as Kind;
  const id = str(form, "id", 64);
  const back = (r: string, extra = "") => redirect(`/admin/photos/${kind}/${encodeURIComponent(id)}?r=${r}${extra}`);
  if (!KINDS.has(kind)) redirect("/admin/photos");
  const part = (PARTS.has(str(form, "part") as Part) ? str(form, "part") : "both") as Part;
  const item = await findItem(kind, id);
  // Банер пілота сайт показує лише з аватаром (driver-page: portraitSrc && widths): без аватара — лише «обидва».
  const effective: Part = kind === "driver" && !item?.card && part === "hero" ? "both" : part;
  const target = item && targetOf(kind, id, item.paired ? effective : "hero");
  const env = githubEnv();
  if (!item || !target) back("bad");
  if (!env) back("no-github");
  // Порожнє чи відсутнє поле — центр (Number("") = 0 дав би лівий верхній кут — code-review 7b).
  const pct = (k: string) => {
    const raw = str(form, k, 6);
    const n = raw === "" ? NaN : Number(raw);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) / 100 : 0.5;
  };
  const focus = { x: pct("fx"), y: pct("fy") };

  let bytes: Uint8Array;
  let credit: Credit;
  let nc = false;
  if (str(form, "source") === "upload") {
    const file = form.get("file");
    const author = str(form, "author", 200);
    const license = str(form, "license", 100);
    const page = str(form, "page", 500);
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD || !UPLOAD_TYPES.has(file.type)) back("upload-file");
    if (!author || !(UPLOAD_LICENSES as readonly string[]).includes(license) || form.get("rights") !== "on" || !/^https:\/\/[^\s]+$/.test(page)) back("upload-fields");
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
    const main = await readMain(gh, jsonFor(target!));
    const files = applySlot(target!, sets!, credit, focus, main.files);
    const where = item!.paired ? { both: "картка й банер", card: "лише картка", hero: "лише банер" }[effective] : "банер";
    const res = await publish(gh, {
      section: "photos",
      title: `Фото · ${item!.name} (${where})`,
      body: [
        `Нове фото: ${credit.page}`,
        `Автор: ${credit.author} · ліцензія: ${credit.license}${nc ? " — ⚠️ лише некомерційно (NC): замінити, якщо з'явиться реклама, підписка чи спонсор" : ""}.`,
      ].join("\n"),
      files,
      draft: str(form, "mode") === "draft",
    }, undefined, main.sha);
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
  // Команда й пілот — завжди обидва: без картки/аватара банер на сайті не показується (code-review 7b).
  const part = kind === "team" || kind === "driver" ? "both" : ((PARTS.has(str(form, "part") as Part) ? str(form, "part") : "both") as Part);
  const target = item && targetOf(kind, id, item.paired ? part : "hero");
  const env = githubEnv();
  if (!item || !target || form.get("confirm") !== "on") back("bad");
  if (!env) back("no-github");
  let number = 0;
  try {
    const gh = new GitHub(env!);
    const main = await readMain(gh, jsonFor(target!));
    const files = removeSlot(target!, main.files);
    const reason = str(form, "reason", 300);
    const res = await publish(gh, {
      section: "takedown",
      title: `Знято за запитом автора · ${item!.name}`,
      body: `Фото знято з сайту за запитом автора${reason ? `: ${reason}` : ""}. Заміну шукаємо окремо.`,
      files,
      draft: false,
    }, undefined, main.sha);
    number = res.number;
  } catch (e) {
    back(e instanceof NothingToRemove ? "nothing" : "github");
  }
  back("removed", `&pr=${number}`);
}
