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
