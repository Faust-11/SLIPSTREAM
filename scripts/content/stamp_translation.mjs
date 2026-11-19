#!/usr/bin/env node
// Відмітка «переклад English звірено з українським оригіналом» (7c, задача 4; формат — content/stories/README.md).
//   node scripts/content/stamp_translation.mjs --all             — усі історії
//   node scripts/content/stamp_translation.mjs --missing         — лише ті, у яких ще немає `translated`
//   node scripts/content/stamp_translation.mjs slug-1 slug-2     — вказані
// Пише хеші поточного uk.md/заголовка/ліда/kicker у story.json (поле `translated`); решта файла — байт-у-байт як було.
// Алгоритм — src/lib/admin/stories/translation.ts (Node читає .ts напряму).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStoryJson, serializeStoryJson } from "../../src/lib/admin/stories/format.ts";
import { stampTranslation } from "../../src/lib/admin/stories/translation.ts";

const root = process.env.STORIES_ROOT || join(dirname(fileURLToPath(import.meta.url)), "../../content/stories");
const args = process.argv.slice(2);
const all = args.includes("--all");
const missing = args.includes("--missing");
const named = args.filter((a) => !a.startsWith("--"));
if (!all && !missing && named.length === 0) {
  console.error("Вкажіть --all, --missing або адреси історій.");
  process.exit(2);
}

const slugs = named.length
  ? named
  : readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);

let changed = 0;
for (const slug of slugs) {
  const p = join(root, slug, "story.json");
  if (!existsSync(p)) {
    console.error(`${slug}: немає story.json`);
    process.exit(1);
  }
  const { story, trailingNewline } = parseStoryJson(readFileSync(p, "utf8"));
  if (missing && !named.length && story.translated) continue;
  story.translated = stampTranslation(story, readFileSync(join(root, slug, "uk.md"), "utf8"));
  const out = serializeStoryJson(story, trailingNewline);
  if (out !== readFileSync(p, "utf8")) {
    writeFileSync(p, out);
    changed += 1;
  }
}
console.log(`Відмічено: ${changed} з ${slugs.length}.`);
