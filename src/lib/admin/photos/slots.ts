import type { Credit } from "@/lib/data/types";
import type { FileChange } from "../github";
import { focusString, type Focus } from "./crop";
import type { FormatKind, Variant } from "./formats";

/**
 * «Слоти» фото сайту: що саме замінюємо і які файли змінюються (план 7b). Чисті функції: на вході — поточний вміст
 * JSON і нарізані файли, на виході — зміни для PR. Формат JSON — як у scripts/curated (json.dumps indent=1, без
 * \u-екранування; замір 17.11: JSON.stringify(…, null, 1) + "\n" дає ті самі байти для всіх 8 файлів), тож diff —
 * лише в змінених рядках.
 *
 * Пари (рішення користувача 17.11): за замовчуванням одне фото на обидва місця (part "both"); можна лише одне — тоді
 * автор іншого зберігається окремим полем (heroCredit / hero.credit), щоб підписи лишились правильними.
 */
export type Part = "both" | "card" | "hero";
export type Target =
  | { kind: "driver"; ref: string; part: Part }
  | { kind: "team"; id: string; part: Part }
  | { kind: "season"; year: string; part: Part }
  | { kind: "circuit"; ref: string }
  | { kind: "race"; key: string };

export const CURATED = {
  portraits: "src/data/curated/driver-portraits.json",
  heroes: "src/data/curated/driver-heroes.json",
  drivers: "src/data/curated/drivers.json",
  teams: "src/data/curated/teams.json",
  seasons: "src/data/curated/seasons.json",
  circuits: "src/data/curated/circuits.json",
  racePhotos: "src/data/curated/race-photos.json",
} as const;

const SLUG = /^[a-z0-9_-]{1,64}$/;

/** Які формати нарізати і з якою основою імені файлу. Чужі ідентифікатори (не slug) — помилка. */
export function formatsFor(t: Target): { format: FormatKind; base: string; role: "card" | "hero" }[] {
  const both = (card: { format: FormatKind; base: string }, hero: { format: FormatKind; base: string }, part: Part) => [
    ...(part !== "hero" ? [{ ...card, role: "card" as const }] : []),
    ...(part !== "card" ? [{ ...hero, role: "hero" as const }] : []),
  ];
  switch (t.kind) {
    case "driver":
      if (!SLUG.test(t.ref)) throw new Error("пілот");
      return both({ format: "avatar", base: `/img/drivers/${t.ref}` }, { format: "driverHero", base: `/img/drivers/${t.ref}` }, t.part);
    case "team":
      if (!SLUG.test(t.id)) throw new Error("команда");
      return both({ format: "teamCard", base: `/img/cars/${t.id}` }, { format: "wideHero", base: `/img/cars/${t.id}` }, t.part);
    case "season":
      if (!/^(19[5-9]\d|20\d\d)$/.test(t.year)) throw new Error("сезон");
      return both({ format: "seasonCard", base: `/img/seasons/${t.year}` }, { format: "wideHero", base: `/img/seasons/${t.year}` }, t.part);
    case "circuit":
      if (!SLUG.test(t.ref)) throw new Error("траса");
      return [{ format: "wideHero", base: `/img/circuits/${t.ref}`, role: "hero" }];
    case "race": {
      const m = /^(\d{4})\/(\d{1,2})$/.exec(t.key);
      if (!m) throw new Error("гонка");
      return [{ format: "wideHero", base: `/img/races/${m[1]}-${m[2]}`, role: "hero" }];
    }
  }
}

export type RenderedSet = { role: "card" | "hero"; format: FormatKind; variants: (Variant & { data: Uint8Array })[] };

const parse = <T>(text: string | undefined, path: string): T => {
  if (text === undefined) throw new Error(`немає ${path}`);
  return JSON.parse(text) as T;
};
const dump = (v: unknown) => `${JSON.stringify(v, null, 1)}\n`;
const filePath = (url: string) => `public${url}`;
const srcSet = (vs: Variant[]) => vs.map((v) => `${v.name} ${v.width}w`).join(", ");

type PhotoRec = { src: string; srcSet: string; width: number; height: number; focusY?: number; credit?: Credit };
const heroRecord = (vs: Variant[], focus: Focus, credit?: Credit): PhotoRec => ({
  src: vs[0]!.name,
  srcSet: srcSet(vs),
  width: vs[0]!.width,
  height: vs[0]!.height,
  focusY: Math.round(focus.y * 100),
  ...(credit ? { credit } : {}),
});

/** Зміни для PR: файли зображень + JSON. current — поточний вміст потрібних JSON (шлях → текст). */
export function applySlot(t: Target, sets: RenderedSet[], credit: Credit, focus: Focus, current: Record<string, string>): FileChange[] {
  const images: FileChange[] = sets.flatMap((s) => s.variants.map((v) => ({ path: filePath(v.name), content: v.data })));
  const card = sets.find((s) => s.role === "card")?.variants;
  const hero = sets.find((s) => s.role === "hero")?.variants;
  const json: FileChange[] = [];

  switch (t.kind) {
    case "driver": {
      type Portraits = { drivers: Record<string, { avatar?: string; credit?: Credit; manual?: { avatar: string; credit: Credit }; heroCredit?: Credit }> };
      type Drivers = { drivers: Record<string, { avatar?: string | null; credit?: Credit | null }> };
      const portraits = parse<Portraits>(current[CURATED.portraits], CURATED.portraits);
      const drivers = parse<Drivers>(current[CURATED.drivers], CURATED.drivers);
      const entry = (portraits.drivers[t.ref] ??= {});
      const cur = drivers.drivers[t.ref];
      // Нинішній автор (як driverPortrait): ручний → кураторський → власний.
      const oldCredit = entry.manual?.credit ?? (cur?.avatar && cur.credit ? cur.credit : undefined) ?? entry.credit;
      if (card) {
        entry.manual = { avatar: card[0]!.name, credit };
        // Банер лишається старим — і його автор теж (інакше підпис банера змінився б разом з аватаром).
        if (!hero && !entry.heroCredit && oldCredit) entry.heroCredit = oldCredit;
        if (hero) delete entry.heroCredit;
      }
      if (hero) {
        type Heroes = { drivers: Record<string, number[]> };
        const heroes = parse<Heroes>(current[CURATED.heroes], CURATED.heroes);
        // driver_hero.py: [фактична 420, фактична 640?] у порядку номінальних ширин.
        heroes.drivers[t.ref] = hero.map((v) => v.width);
        heroes.drivers = Object.fromEntries(Object.entries(heroes.drivers).sort(([a], [b]) => a.localeCompare(b)));
        json.push({ path: CURATED.heroes, content: dump(heroes) });
        if (!card) entry.heroCredit = credit;
      }
      // Поточний пілот: той самий файл аватара записано й у drivers.json — там теж новий автор (сторінки команд беруть звідти).
      if (card && cur?.avatar === card[0]!.name && cur.credit) {
        cur.credit = credit;
        json.push({ path: CURATED.drivers, content: dump(drivers) });
      }
      json.push({ path: CURATED.portraits, content: dump(portraits) });
      break;
    }
    case "team": {
      type Teams = { teams: { id: string; photo?: PhotoRec & { credit: Credit }; hero?: PhotoRec }[] };
      const teams = parse<Teams>(current[CURATED.teams], CURATED.teams);
      const team = teams.teams.find((x) => x.id === t.id);
      if (!team) throw new Error(`немає команди ${t.id}`);
      const oldCredit = team.photo?.credit;
      if (card) {
        team.photo = { src: card[0]!.name, srcSet: [...card].reverse().map((v) => `${v.name} ${v.width}w`).join(", "), width: card[0]!.width, height: card[0]!.height, credit };
        if (!hero && team.hero && !team.hero.credit && oldCredit) team.hero.credit = oldCredit;
      }
      if (hero) team.hero = heroRecord(hero, focus, card ? undefined : credit);
      json.push({ path: CURATED.teams, content: dump(teams) });
      break;
    }
    case "season": {
      type Seasons = { seasons: Record<string, { credit?: Credit; photo?: PhotoRec; hero?: PhotoRec }> };
      const seasons = parse<Seasons>(current[CURATED.seasons], CURATED.seasons);
      const s = seasons.seasons[t.year];
      if (!s) throw new Error(`немає сезону ${t.year}`);
      if (card) {
        if (!hero && s.hero && !s.hero.credit && s.credit) s.hero.credit = s.credit;
        s.photo = { src: card[0]!.name, srcSet: card.map((v) => `${v.name} ${v.width}w`).join(", "), width: card[0]!.width, height: card[0]!.height };
        s.credit = credit;
      }
      if (hero) s.hero = heroRecord(hero, focus, card ? undefined : credit);
      json.push({ path: CURATED.seasons, content: dump(seasons) });
      break;
    }
    case "circuit": {
      type Circuits = { places: Record<string, { credit?: Credit; hero?: PhotoRec }> };
      const circuits = parse<Circuits>(current[CURATED.circuits], CURATED.circuits);
      const p = circuits.places[t.ref];
      if (!p) throw new Error(`немає траси ${t.ref}`);
      p.hero = heroRecord(hero!, focus);
      p.credit = credit;
      json.push({ path: CURATED.circuits, content: dump(circuits) });
      break;
    }
    case "race": {
      type Photos = { _about: string; photos: Record<string, PhotoRec> };
      const photos = parse<Photos>(current[CURATED.racePhotos], CURATED.racePhotos);
      photos.photos[t.key] = heroRecord(hero!, focus, credit);
      photos.photos = Object.fromEntries(Object.entries(photos.photos).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
      json.push({ path: CURATED.racePhotos, content: dump(photos) });
      break;
    }
  }
  return [...images, ...json];
}

/** Які JSON потрібні слоту (адмінка читає їх з main перед applySlot). */
export function jsonFor(t: Target): string[] {
  switch (t.kind) {
    case "driver":
      // heroes — і для «лише аватар»: removeSlot/applySlot читають його лише за потреби, а зайвий запит дешевий.
      return [CURATED.portraits, CURATED.drivers, CURATED.heroes];
    case "team":
      return [CURATED.teams];
    case "season":
      return [CURATED.seasons];
    case "circuit":
      return [CURATED.circuits];
    case "race":
      return [CURATED.racePhotos];
  }
}

export { focusString };

// ---------------------------------------------------------------------------------------------------------------
// Зняти за запитом автора (макет v2): фото зникає з сайту (файли видаляються, посилання в JSON прибираються), заміну
// шукаємо потім. Видаляємо лише наявні файли (GitHub відкидає видалення неіснуючого шляху): банер пілота — 420 і, якщо
// є, 640 (driver-heroes.json); широкі банери — завжди 3 файли (hero_photos.py пише всі ширини). Команда — завжди обидва:
// без картки сторінка команди банер не показує.

const WIDE = (base: string) => [1280, 800, 480].map((w) => `${base}-hero-${w}.webp`);
const del = (url: string): FileChange => ({ path: filePath(url), content: null });

export function removeSlot(t: Target, current: Record<string, string>): FileChange[] {
  const out: FileChange[] = [];
  switch (t.kind) {
    case "driver": {
      type Portraits = { drivers: Record<string, { avatar?: string; credit?: Credit; manual?: { avatar: string; credit: Credit }; heroCredit?: Credit }> };
      type Drivers = { drivers: Record<string, { avatar?: string | null; credit?: Credit | null }> };
      type Heroes = { drivers: Record<string, number[]> };
      const portraits = parse<Portraits>(current[CURATED.portraits], CURATED.portraits);
      const drivers = parse<Drivers>(current[CURATED.drivers], CURATED.drivers);
      const entry = portraits.drivers[t.ref];
      const cur = drivers.drivers[t.ref];
      const avatar = `/img/drivers/${t.ref}-96.webp`;
      const oldCredit = entry?.manual?.credit ?? (cur?.avatar && cur.credit ? cur.credit : undefined) ?? entry?.credit;
      if (t.part !== "hero" && (entry?.manual || entry?.avatar || cur?.avatar)) {
        if (entry) {
          // Банер лишається — зберегти його автора, поки аватар прибираємо.
          if (t.part === "card" && !entry.heroCredit && oldCredit) entry.heroCredit = oldCredit;
          delete entry.manual;
          delete entry.avatar;
          delete entry.credit;
        }
        if (cur?.avatar) {
          cur.avatar = null;
          cur.credit = null;
          out.push({ path: CURATED.drivers, content: dump(drivers) });
        }
        out.push(del(avatar));
      }
      if (t.part !== "card") {
        const heroes = parse<Heroes>(current[CURATED.heroes], CURATED.heroes);
        const widths = heroes.drivers[t.ref];
        if (widths?.length) {
          out.push(del(`/img/drivers/${t.ref}-420.webp`));
          if (widths.length > 1) out.push(del(`/img/drivers/${t.ref}-640.webp`));
          delete heroes.drivers[t.ref];
          out.push({ path: CURATED.heroes, content: dump(heroes) });
        }
        if (entry) delete entry.heroCredit;
      }
      if (entry && Object.keys(entry).length === 0) delete portraits.drivers[t.ref];
      out.push({ path: CURATED.portraits, content: dump(portraits) });
      break;
    }
    case "team": {
      type Teams = { teams: { id: string; photo?: PhotoRec; hero?: PhotoRec }[] };
      const teams = parse<Teams>(current[CURATED.teams], CURATED.teams);
      const team = teams.teams.find((x) => x.id === t.id);
      if (!team) throw new Error(`немає команди ${t.id}`);
      if (team.photo) out.push(del(`/img/cars/${t.id}-480.webp`), del(`/img/cars/${t.id}-256.webp`));
      if (team.hero) out.push(...WIDE(`/img/cars/${t.id}`).map(del));
      delete team.photo;
      delete team.hero;
      out.push({ path: CURATED.teams, content: dump(teams) });
      break;
    }
    case "season": {
      type Seasons = { seasons: Record<string, { credit?: Credit; photo?: PhotoRec; hero?: PhotoRec }> };
      const seasons = parse<Seasons>(current[CURATED.seasons], CURATED.seasons);
      const s = seasons.seasons[t.year];
      if (!s) throw new Error(`немає сезону ${t.year}`);
      if (t.part !== "hero" && s.photo) {
        out.push(del(`/img/seasons/${t.year}-full.webp`), del(`/img/seasons/${t.year}-small.webp`));
        if (t.part === "card" && s.hero && !s.hero.credit && s.credit) s.hero.credit = s.credit;
        delete s.photo;
        delete s.credit;
      }
      if (t.part !== "card" && s.hero) {
        out.push(...WIDE(`/img/seasons/${t.year}`).map(del));
        delete s.hero;
      }
      out.push({ path: CURATED.seasons, content: dump(seasons) });
      break;
    }
    case "circuit": {
      type Circuits = { places: Record<string, { credit?: Credit; hero?: PhotoRec }> };
      const circuits = parse<Circuits>(current[CURATED.circuits], CURATED.circuits);
      const p = circuits.places[t.ref];
      if (!p?.hero) throw new Error(`у траси ${t.ref} немає фото`);
      out.push(...WIDE(`/img/circuits/${t.ref}`).map(del));
      delete p.hero;
      delete p.credit;
      out.push({ path: CURATED.circuits, content: dump(circuits) });
      break;
    }
    case "race": {
      type Photos = { _about: string; photos: Record<string, PhotoRec> };
      const photos = parse<Photos>(current[CURATED.racePhotos], CURATED.racePhotos);
      const p = photos.photos[t.key];
      if (!p) throw new Error(`у гонки ${t.key} немає свого банера`);
      out.push(...WIDE(p.src.replace(/-hero-\d+\.webp$/, "")).map(del));
      delete photos.photos[t.key];
      out.push({ path: CURATED.racePhotos, content: dump(photos) });
      break;
    }
  }
  return out;
}
