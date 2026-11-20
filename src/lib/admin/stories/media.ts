import type { Credit } from "@/lib/data/types";
import type { FileChange } from "../github";
import { parseStoryJson, serializeStoryJson } from "./format";
import type { StoryJson } from "./types";

/**
 * Фото історії (7c, задача 5): що змінюється в `story.json` і які файли в `public/img/stories/<slug>/`, коли hero або
 * inline-фото замінюють чи додають. Чисті функції (як photos/slots.ts для 7b): на вході — файл story.json і нарізані
 * варіанти, на виході — зміни для PR. Запис байт-у-байт (format.ts): diff — лише рядки фото.
 */
export type PhotoVariant = { name: string; width: number; height: number; data: Uint8Array };
export type L10nText = { uk: string; en: string };

export type PhotoChange = {
  /** `m<N>` — наявне фото (заміна); `new` — нове inline-фото з наступним вільним id. */
  id: string;
  variants: PhotoVariant[];
  credit: Credit;
  /** «55% 50%» — точка фокусу (CSS object-position). */
  focus: string;
  caption: L10nText;
  alt: L10nText;
};

type Media = NonNullable<StoryJson["media"]>[number];

export const MEDIA_ID = /^m\d+$/;
export const nextMediaId = (media: readonly { id: string }[]): string => `m${Math.max(0, ...media.map((m) => Number(/^m(\d+)$/.exec(m.id)?.[1] ?? 0))) + 1}`;

const filePath = (url: string) => `public${url}`;
const srcUrls = (m: Media): string[] => [String(m.src ?? ""), ...String(m.srcSet ?? "").split(",").map((p) => p.trim().split(/\s+/)[0] ?? "")].filter(Boolean);

/** Роль нового фото — завжди inline: hero в історії один і замінюється, а не додається. */
export function roleFor(story: StoryJson, id: string): "hero" | "inline" | null {
  if (id === "new") return "inline";
  const m = (story.media ?? []).find((x) => x.id === id);
  return m ? (m.role === "hero" ? "hero" : "inline") : null;
}

export function applyStoryPhoto(rawJson: string, slug: string, change: PhotoChange): { id: string; json: string; changes: FileChange[]; role: "hero" | "inline" } {
  const { story, trailingNewline } = parseStoryJson(rawJson);
  const media = [...(story.media ?? [])] as Media[];
  const isNew = change.id === "new";
  const id = isNew ? nextMediaId(media) : change.id;
  const index = media.findIndex((m) => m.id === id);
  if (!isNew && index < 0) throw new Error(`немає фото ${id}`);
  const role = roleFor(story, change.id);
  if (!role) throw new Error(`немає фото ${id}`);
  const first = change.variants[0];
  if (!first) throw new Error("немає варіантів фото");

  // Порядок ключів — як у наявних файлах (README): id, role, src, srcSet, width, height, focus, credit, caption, alt.
  const entry: Media = {
    id,
    role,
    src: first.name,
    srcSet: change.variants.map((v) => `${v.name} ${v.width}w`).join(", "),
    width: first.width,
    height: first.height,
    focus: change.focus,
    credit: { page: change.credit.page, author: change.credit.author, license: change.credit.license },
    caption: { uk: change.caption.uk, en: change.caption.en },
    alt: { uk: change.alt.uk, en: change.alt.en },
  };
  const old = isNew ? undefined : media[index];
  if (isNew) media.push(entry);
  else media[index] = entry;
  story.media = media;

  const keep = new Set(change.variants.map((v) => v.name));
  const dir = `/img/stories/${slug}/`;
  // Старі файли, яких нові варіанти не перезапишуть (інші ширини/імена), — прибираємо, щоб не лишились сиротами.
  const orphans = old ? [...new Set(srcUrls(old))].filter((u) => u.startsWith(dir) && u.endsWith(".webp") && !keep.has(u)) : [];

  const json = serializeStoryJson(story, trailingNewline);
  return {
    id,
    json,
    role,
    changes: [
      ...change.variants.map((v): FileChange => ({ path: filePath(v.name), content: v.data })),
      ...orphans.map((u): FileChange => ({ path: filePath(u), content: null })),
      { path: `content/stories/${slug}/story.json`, content: json },
    ],
  };
}
