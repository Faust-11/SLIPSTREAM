-- Фаза 9d — таблиця лідерів «Гарячого кола» (docs/decisions.md, розділ «Таблиця лідерів гри»).
--
-- Довіра. Час кола рахує фізика гри (src/lib/game/physics.ts — JS), база її повторити не може. Тому писати коло можна лише
-- через play.save_lap, а ту, окрім JWT гравця (auth.uid() — хто), вимагає ще й СЕКРЕТ, який знає лише наш сервер: він
-- повторює заїзд за записаним вводом (simulate) і лише тоді викликає функцію з секретом. Без секрету гравець із чинним JWT, що
-- викликає PostgREST напряму, коло не запише. Секрет лежить у play.secrets (прав для anon/authenticated немає), а не в ключі
-- сервісу: рішення «ключів сервісу не тримаємо» (0016) лишається в силі. Секрет не задано — функція відмовляє (fail closed).
--
-- Таблиця одна на гравця й трасу: найкраще коло (перезаписується лише швидшим). Публічне — подання lap_board (нік, час, дата;
-- без user_id і пошти; заблоковані не показуються; прихований нік — «Гравець XXXX»). Видалення профілю чи акаунта (0015/0016)
-- каскадом прибирає кола (FK на play.profiles).
--
-- Ідемпотентно: create … if not exists / or replace, політики drop + create.

create schema if not exists play;

create table if not exists play.secrets (
  name    text primary key,
  value   text not null,
  set_at  timestamptz not null default now()
);
alter table play.secrets enable row level security;
revoke all on play.secrets from public, anon, authenticated;

create table if not exists play.laps (
  user_id  uuid not null references play.profiles(user_id) on delete cascade,
  track    text not null check (track in ('lyman', 'port', 'plateau', 'forest')),
  -- Час у тіках 1/120 с разом зі штрафами й фальстартом (як total() у physics.ts). 200000 тіків ≈ 27 хв — верхня межа форми,
  -- реальна межа (≤ 10 хв + штрафи) — у перевірці сервера.
  ticks    integer not null check (ticks between 1 and 200000),
  jump     boolean not null default false,
  -- Ввід у RLE («біт.кількість,…»): за ним коло можна повторити й перевірити.
  inputs   text not null check (char_length(inputs) between 1 and 30000),
  set_at   timestamptz not null default now(),
  primary key (user_id, track)
);
create index if not exists laps_track_ticks_idx on play.laps (track, ticks, set_at);
alter table play.laps enable row level security;
drop policy if exists laps_own_select on play.laps;
create policy laps_own_select on play.laps for select to authenticated using (user_id = auth.uid());
grant select on play.laps to authenticated;

-- Публічна таблиця: однаковий час — однакове місце (1, 1, 3). Заблоковані модератором не показуються.
create or replace view play.lap_board as
select l.track, pr.public_name as player, l.ticks, l.jump, l.set_at,
       (rank() over (partition by l.track order by l.ticks))::int as place
from play.laps l
join play.profiles pr on pr.user_id = l.user_id and not exists (select 1 from play.blocked_users b where b.user_id = pr.user_id);
grant select on play.lap_board to anon, authenticated;

-- Запис кола. Повертає { saved, ticks, jump, place }: saved = false, якщо наявне коло гравця на трасі не гірше (тоді в
-- відповіді воно ж). Помилки: 28000 — без входу; 55000 not_configured — секрет не задано; 42501 forbidden — секрет не збігся;
-- P0001 no_profile / blocked; 23514 — траса поза списком чи час/ввід поза межами форми.
create or replace function play.save_lap(p_secret text, p_track text, p_ticks integer, p_jump boolean, p_inputs text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, play as $$
declare
  v_uid     uuid := auth.uid();
  v_secret  text;
  v_ticks   integer;
  v_jump    boolean;
  v_n       integer;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select value into v_secret from play.secrets where name = 'lap_secret';
  if v_secret is null or char_length(v_secret) < 16 then raise exception 'not_configured' using errcode = '55000'; end if;
  if p_secret is distinct from v_secret then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from play.blocked_users where user_id = v_uid) then raise exception 'blocked' using errcode = 'P0001'; end if;
  if not exists (select 1 from play.profiles where user_id = v_uid) then raise exception 'no_profile' using errcode = 'P0001'; end if;

  insert into play.laps (user_id, track, ticks, jump, inputs) values (v_uid, p_track, p_ticks, coalesce(p_jump, false), p_inputs)
  on conflict (user_id, track) do update
    set ticks = excluded.ticks, jump = excluded.jump, inputs = excluded.inputs, set_at = now()
    where excluded.ticks < play.laps.ticks;
  -- Рядків 1 — вставлено чи покращено; 0 — наявне коло не гірше (on conflict … where не виконався).
  get diagnostics v_n = row_count;
  select l.ticks, l.jump into v_ticks, v_jump from play.laps l where l.user_id = v_uid and l.track = p_track;
  return jsonb_build_object(
    'saved', v_n = 1,
    'ticks', v_ticks,
    'jump', v_jump,
    'place', 1 + (select count(*) from play.lap_board b where b.track = p_track and b.ticks < v_ticks)
  );
end;
$$;
revoke all on function play.save_lap(text, text, integer, boolean, text) from public, anon;
grant execute on function play.save_lap(text, text, integer, boolean, text) to authenticated, service_role;

-- Моє коло на трасі і місце (для сторінки гри); null — кола ще немає. Лише для себе: auth.uid().
create or replace function play.my_lap(p_track text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, play as $$
declare
  v_uid  uuid := auth.uid();
  v_row  play.laps;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_row from play.laps where user_id = v_uid and track = p_track;
  if not found then return null; end if;
  if exists (select 1 from play.blocked_users where user_id = v_uid) then return null; end if;
  return jsonb_build_object('ticks', v_row.ticks, 'jump', v_row.jump,
                            'place', 1 + (select count(*) from play.lap_board b where b.track = p_track and b.ticks < v_row.ticks));
end;
$$;
revoke all on function play.my_lap(text) from public, anon;
grant execute on function play.my_lap(text) to authenticated, service_role;
