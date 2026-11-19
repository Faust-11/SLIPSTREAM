import type { StoryJson } from "./types";

/**
 * Запис story.json. Замір 19.11: усі 33 файли збігаються байт-у-байт з `JSON.stringify(json, null, 2)`; кінцевий `\n`
 * є у 20 з 33 — його стан зберігаємо, щоб правка однієї історії не перетворювалась на diff усього файла.
 */
export function parseStoryJson(raw: string): { story: StoryJson; trailingNewline: boolean } {
  const story = JSON.parse(raw) as unknown;
  if (typeof story !== "object" || story === null || Array.isArray(story)) throw new Error("story.json — не об'єкт");
  return { story: story as StoryJson, trailingNewline: raw.endsWith("\n") };
}

export function serializeStoryJson(story: StoryJson, trailingNewline: boolean): string {
  return JSON.stringify(story, null, 2) + (trailingNewline ? "\n" : "");
}

/** Python `repr` списку рядків — так друкує check_stories.py (`['c1', 'c2']`); потрібно, щоб тексти помилок збігались. */
export function pyList(items: readonly string[]): string {
  return `[${items.map((x) => `'${x}'`).join(", ")}]`;
}
