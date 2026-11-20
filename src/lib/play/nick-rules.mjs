/**
 * Правила ніка — ЄДИНЕ джерело для сайту (валідація), e2e-фейку Supabase і тесту паритету зі схемою БД (play.nick_valid /
 * play.nick_skeleton у міграції 0016). Звичайний .mjs без залежностей: його читає й Node без збірки (scripts/dev/*.mjs).
 *
 * Нік публічний (таблиця, чемпіони), тож його не можна підмінити невидимими чи схожими символами (рішення 20.11):
 *  1. нормалізація NFKC (повна ширина → звичайна, nbsp → пробіл, лігатури тощо) ПЕРЕД перевіркою;
 *  2. allowlist, а не чорний список: латиниця A–Z, цифри, кирилиця — лише U+0400–U+045F та Ґ/ґ (U+0490/0491): повні пари
 *     велика/мала, які згортає таблиця нижче, без історичних/додаткових літер (Ӏ U+04C0, ѡ, ҁ, Ҋ…: латинські двійники й комбівні знаки) —
 *     і роздільники «. _ -» та ОДИН звичайний пробіл між словами; перший і останній символ — літера
 *     чи цифра; без подвійних пробілів. Жодних знаків форматування, комбівних, emoji, грецької/іншого письма — свідомо вужче за
 *     \p{L}\p{N}: ці класи в Postgres залежать від локалі БД (на хмарному Supabase, ймовірно, C.UTF-8 — не перевірено), а
 *     правило має діяти однаково в JS і SQL. Діакритична латиниця (é, ü, ö) поки НЕ дозволена — розширювати лише разом із
 *     таблицями згортки регістру без локалі;
 *  2а. ОДИН СКРИПТ (UTS #39, «mixed-script»): літери ніка — або лише латиниця, або лише кирилиця; цифри й роздільники — з будь-яким.
 *     Мішаний нік («Аdmin» з кириличною А) відхиляється одразу — це прибирає основний клас підміни; лишається повноскриптова
 *     (весь нік кирилицею, що виглядає як латинський), її покриває скелет нижче. Повний набір UTS #39 (confusables.txt) НЕ
 *     підключали — повністю виключити підміну неможливо; запасний механізм — модерація ніків (задача 9e).
 *  3. унікальність — за «скелетом»: NFKC → регістр (ASCII і кирилиця явними таблицями, без залежності від локалі) →
 *     схожі літери кирилиці стають латинськими (а/a, в/b, е/e, к/k, м/m, н/h, о/o, р/p, с/c, т/t, у/y, х/x, і/i, ј/j, ѕ/s,
 *     г/r, п/n) і цифро-подібними (з/3, б/6, ч/4) →
 *     I, l, 1 (і кириличне — через і→i) → один символ «l»; O, 0 (о кириличне — через о→o) → один «o» → прибрані роздільники.
 *     Тому «Аdmin» (кирилична А), «ADMIN» і «Ad_min» — один нік, а «Alex1», «Alexl», «AIex», «Аlех» — теж.
 *     КОМПРОМІС (свідомий): законні близькі ніки на кшталт «Alex1» і «Alexl» (або «Boris» і «B0ris») рахуються дублем — це ціна
 *     захисту від підміни; гравцю лишається додати символ.
 * Довжина — у символах (code points); оскільки комбівних знаків немає, це збігається з графемами.
 */
export const NICK_MIN = 3;
export const NICK_MAX = 24;

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i));

/** Велика кирилиця U+0400–U+042F і Ґ → мала (явна таблиця: у SQL без залежності від локалі). */
export const CYR_UPPER = [...range(0x400, 0x42f), "Ґ"].join("");
export const CYR_LOWER = [...range(0x450, 0x45f), ...range(0x430, 0x44f), "ґ"].join("");
/** Малі кириличні літери, схожі на латинські, → латинські (після згортки регістру). */
export const HOMOGLYPH_FROM = "авекмнорстухіјѕзбчгп";
export const HOMOGLYPH_TO = "abekmhopctyxijs364rn";
const UPPER_ASCII = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER_ASCII = "abcdefghijklmnopqrstuvwxyz";
/** Після згортки кирилиці в латиницю: i, 1 → l (I/l/1/і/І — один символ), 0 → o (O/0/о/О). */
const CONFUSABLE_FROM = "i10";
const CONFUSABLE_TO = "llo";
const SEPARATORS = "_.- ";

const CLASS = "A-Za-z0-9\\u0400-\\u045F\\u0490\\u0491";
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
  s = translate(s, CONFUSABLE_FROM, CONFUSABLE_TO);
  return translate(s, SEPARATORS, "");
}

const RESERVED_SKELETON = nickSkeleton("Гравець"); // «Гравець» — префікс прихованих ніків

/** Дзеркало play.nick_valid: null — нік придатний (очікується вже NFKC-нормалізований рядок). */
export function nickProblem(nick) {
  const len = [...nick].length;
  if (len < NICK_MIN) return "short";
  if (len > NICK_MAX) return "long";
  if (nick !== nick.normalize("NFKC") || !ALLOWED.test(nick) || nick.includes("  ")) return "chars";
  if (/[A-Za-z]/.test(nick) && /[\u0400-\u045F\u0490\u0491]/.test(nick)) return "mixed";
  if (nickSkeleton(nick).startsWith(RESERVED_SKELETON)) return "reserved";
  return null;
}
