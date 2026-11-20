/**
 * Правила ніка — ЄДИНЕ джерело для сайту (валідація), e2e-фейку Supabase і тесту паритету зі схемою БД (play.nick_valid /
 * play.nick_skeleton у міграції 0016). Звичайний .mjs без залежностей: його читає й Node без збірки (scripts/dev/*.mjs).
 *
 * Нік публічний (таблиця, чемпіони), тож його не можна підмінити невидимими чи схожими символами (рішення 20.11):
 *  1. нормалізація NFKC (повна ширина → звичайна, nbsp → пробіл, лігатури тощо) ПЕРЕД перевіркою;
 *  2. allowlist, а не чорний список: латиниця A–Z, цифри, кирилиця (U+0400–U+0481, U+048A–U+04FF — без U+0482–0489: це
 *     комбівні знаки/символи) і роздільники «. _ -» та ОДИН звичайний пробіл між словами; перший і останній символ — літера
 *     чи цифра; без подвійних пробілів. Жодних знаків форматування, комбівних, emoji, грецької/іншого письма — свідомо вужче за
 *     \p{L}\p{N}: ці класи в Postgres залежать від локалі БД (на хмарному Supabase, ймовірно, C.UTF-8 — не перевірено), а
 *     правило має діяти однаково в JS і SQL. Діакритична латиниця (é, ü, ö) поки НЕ дозволена — розширювати лише разом із
 *     таблицями згортки регістру без локалі;
 *  3. унікальність — за «скелетом»: NFKC → регістр (ASCII і основна кирилиця явними таблицями, без залежності від локалі) →
 *     схожі літери кирилиці стають латинськими (а/a, в/b, е/e, к/k, м/m, н/h, о/o, р/p, с/c, т/t, у/y, х/x, і/i, ј/j, ѕ/s) →
 *     прибрані роздільники. Тому «Аdmin» (кирилична А), «ADMIN», «admin» і «Ad_min» — один нік.
 * Довжина — у символах (code points); оскільки комбівних знаків немає, це збігається з графемами.
 */
export const NICK_MIN = 3;
export const NICK_MAX = 24;

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i));

/** Велика кирилиця U+0400–U+042F і Ґ → мала (явна таблиця: у SQL без залежності від локалі). */
export const CYR_UPPER = [...range(0x400, 0x42f), "Ґ"].join("");
export const CYR_LOWER = [...range(0x450, 0x45f), ...range(0x430, 0x44f), "ґ"].join("");
/** Малі кириличні літери, схожі на латинські, → латинські (після згортки регістру). */
export const HOMOGLYPH_FROM = "авекмнорстухіјѕ";
export const HOMOGLYPH_TO = "abekmhopctyxijs";
const UPPER_ASCII = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER_ASCII = "abcdefghijklmnopqrstuvwxyz";
const SEPARATORS = "_.- ";

const CLASS = "A-Za-z0-9\\u0400-\\u0481\\u048A-\\u04FF";
const ALLOWED = new RegExp(`^[${CLASS}]([${CLASS}_. -]*[${CLASS}])?$`);

function translate(s, from, to) {
  const map = new Map([...from].map((c, i) => [c, [...to][i] ?? ""]));
  return [...s].map((c) => (map.has(c) ? map.get(c) : c)).join("");
}

/** Вхід користувача → те, що перевіряємо й зберігаємо: NFKC і обрізані краї. */
export function normalizeNick(raw) {
  return String(raw).normalize("NFKC").trim();
}

/** Скелет для порівняння ників (див. шапку). Дзеркало play.nick_skeleton. */
export function nickSkeleton(nick) {
  let s = String(nick).normalize("NFKC");
  s = translate(s, CYR_UPPER, CYR_LOWER);
  s = translate(s, UPPER_ASCII, LOWER_ASCII);
  s = translate(s, HOMOGLYPH_FROM, HOMOGLYPH_TO);
  return translate(s, SEPARATORS, "");
}

const RESERVED_SKELETON = nickSkeleton("Гравець"); // «Гравець» — префікс прихованих ніків

/** Дзеркало play.nick_valid: null — нік придатний (очікується вже NFKC-нормалізований рядок). */
export function nickProblem(nick) {
  const len = [...nick].length;
  if (len < NICK_MIN) return "short";
  if (len > NICK_MAX) return "long";
  if (nick !== nick.normalize("NFKC") || !ALLOWED.test(nick) || nick.includes("  ")) return "chars";
  if (nickSkeleton(nick).startsWith(RESERVED_SKELETON)) return "reserved";
  return null;
}
