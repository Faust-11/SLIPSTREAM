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

-- Нік: НЕвидимі символи форматування й «дивні» пробіли (рев'ю 20.11). 0015 забороняв лише ASCII/C1 керуючі та «@»; нік «Max» і
-- «Max» + U+200B вважалися різними за lower(nick), але на таблиці виглядали однаково (підміна імені). Той самий список у
-- src/lib/play/validate.ts (HIDDEN_OR_ODD). Назву обмеження лишаємо (`profiles_nick_chk`): її вже чекають тести й обробка помилок.
-- Рядків у play.profiles на момент застосування немає (0015 і 0016 застосовуються разом), тож перевірка наявних даних безпечна.
alter table play.profiles drop constraint profiles_nick_chk;
alter table play.profiles add constraint profiles_nick_chk check (
  nick = btrim(nick) and char_length(nick) between 3 and 24
  and nick !~ '[[:cntrl:]@]' and nick !~ '^[Гг]равець '
  and nick !~ E'[\u00a0\u00ad\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\ufeff]'
);
