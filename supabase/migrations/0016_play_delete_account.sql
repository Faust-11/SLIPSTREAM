-- Фаза 9a: повне видалення акаунта гравця на його запит. play.delete_my_profile() (0015) прибирає лише дані гри — користувач
-- у auth.users (з поштою) лишався б. Адміністративне видалення в Supabase потребує service-ключа, якого на сайті немає
-- (рішення: ключів сервісу не тримаємо), тому — функція security definer (власник — роль міграцій), що видаляє СВОГО
-- користувача: каскадом зникають профіль, прогнози, очки, титули (FK на auth.users) і сесії/токени самого Supabase Auth.
--
-- Заблокований модератором: видаляємо лише дані гри (право на видалення ніка/прогнозів збережено), а рядок auth.users
-- ЗАЛИШАЄМО — разом з поштою він єдина прив'язка блокування (play.blocked_users тримає лише uid). Інакше «видалити акаунт →
-- зареєструватись тією ж поштою» давало б новий uid і знімало блокування. Відповідь 'data_only_blocked' сайт показує
-- чесно: «дані гри видалено; службовий запис блокування лишається». Знімає блокування лише модератор.
create or replace function play.delete_my_account() returns text
language plpgsql security definer set search_path = pg_catalog, auth, play as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from play.blocked_users where user_id = v_uid) then
    delete from play.profiles where user_id = v_uid;
    return 'data_only_blocked';
  end if;
  delete from auth.users where id = v_uid;
  return 'deleted';
end;
$$;
revoke all on function play.delete_my_account() from public, anon;
grant execute on function play.delete_my_account() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Нік: allowlist + NFKC + унікальність за «скелетом» (рішення 20.11; правила — src/lib/play/nick-rules.mjs, тест паритету
-- scripts/db/fixtures/nick_parity.json). 0015 забороняв лише ASCII/C1 керуючі та «@» — нік «Max» і «Max»+U+200B були різними за
-- lower(nick), а виглядали однаково (підміна імені в публічній таблиці).
--  • play.nick_valid: нік уже в NFKC; 3–24 символи; лише A–Z, 0–9, кирилиця (лише U+0400–U+045F та Ґ/ґ — без Ӏ U+04C0 та інших двійників латиниці) та роздільники «. _ -»
--    і ОДИН пробіл; літери лише з ОДНОГО скрипту (латиниця АБО кирилиця; цифри й роздільники — з будь-яким, UTS #39);
--    перший/останній символ — літера чи цифра; без подвійних пробілів; префікс «Гравець» (за скелетом) зарезервовано
--    під приховані ніки. Явні діапазони, а не [[:alpha:]]/\p{L}: у Postgres ці класи залежать від локалі БД (на хмарному Supabase,
--    ймовірно, C.UTF-8 — не перевірено), а правило має бути однаковим у JS і SQL.
--  • play.nick_skeleton: NFKC → мала кирилиця (явна таблиця) → мала ASCII → схожі кириличні літери стають латинськими
--    (а/a в/b е/e к/k м/m н/h о/o р/p с/c т/t у/y х/x і/i ј/j ѕ/s г/r п/n; цифро-подібні з/3 б/6 ч/4) → i, 1 → l (I/l/1/і — один символ), 0 → o (O/0/о — один)
--    → без роздільників. IMMUTABLE (генерована колонка й індекс). Свідомий компроміс: «Alex1» і «Alexl» — дубль.
create or replace function play.nick_skeleton(p text) returns text
language sql immutable parallel safe set search_path = pg_catalog as $$
  select translate(
           translate(
             translate(
               translate(
                 translate(normalize(p, NFKC), 'ЀЁЂЃЄЅІЇЈЉЊЋЌЍЎЏАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯҐ', 'ѐёђѓєѕіїјљњћќѝўџабвгдежзийклмнопрстуфхцчшщъыьэюяґ'),
               'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'),
             'авекмнорстухіјѕзбчгп', 'abekmhopctyxijs364rn'),
           'i10', 'llo'),
           '_.- ', '')
$$;

create or replace function play.nick_valid(p text) returns boolean
language sql immutable parallel safe set search_path = pg_catalog as $$
  select p is not null
     and p = normalize(p, NFKC)
     and char_length(p) between 3 and 24
     and p ~ '^[A-Za-z0-9\u0400-\u045F\u0490\u0491]([A-Za-z0-9\u0400-\u045F\u0490\u0491_. -]*[A-Za-z0-9\u0400-\u045F\u0490\u0491])?$'
     and p !~ '  '
     and not (p ~ '[A-Za-z]' and p ~ '[\u0400-\u045F\u0490\u0491]')
     and play.nick_skeleton(p) not like play.nick_skeleton('Гравець') || '%'
$$;
revoke all on function play.nick_skeleton(text), play.nick_valid(text) from public, anon, authenticated;
grant execute on function play.nick_skeleton(text), play.nick_valid(text) to service_role;
-- Виклик усередині CHECK/генерованої колонки/індексу — з правами власника таблиці; гравцям прямий виклик не потрібен.

-- Ідемпотентно (повторне виконання не падає; перевіряє db.yml, крок «Міграція 0016 повторно»): constraint — drop if exists + add,
-- колонка й індекс — if not exists. Повтор перевіряє CHECK наново на наявних рядках — на бою профілів, що не проходять
-- play.nick_valid, немає (перед застосуванням див. чек-лист у docs/decisions.md, «Фаза 9a»).
alter table play.profiles drop constraint if exists profiles_nick_chk;
alter table play.profiles add constraint profiles_nick_chk check (play.nick_valid(nick));
alter table play.profiles add column if not exists nick_key text generated always as (play.nick_skeleton(nick)) stored;
drop index if exists play.profiles_nick_lower_idx;
create unique index if not exists profiles_nick_key_idx on play.profiles (nick_key);

-- set_nick: нік нормалізуємо NFKC на боці бази (прямий виклик RPC з публічним ключем обходить сайт); решта — як у 0015
-- (блокування, upsert). Порушення формату — 23514 (profiles_nick_chk), зайнятий/надто схожий — 23505 (profiles_nick_key_idx).
create or replace function play.set_nick(p_nick text) returns void
language plpgsql security definer set search_path = pg_catalog, f1, play as $$
declare
  v_uid uuid := auth.uid();
  v_nick text := normalize(p_nick, NFKC);
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from play.blocked_users where user_id = v_uid) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;
  insert into play.profiles (user_id, nick) values (v_uid, v_nick)
  on conflict (user_id) do update set nick = excluded.nick;
end;
$$;
