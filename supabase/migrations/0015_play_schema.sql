-- Фаза 9b — схема play: профілі гравців, прогнози, очки, чемпіони сезону (docs/plans/2026-11-19-phase9-predictions.md).
--
-- Принципи:
--   * play живе окремо від f1: завантажувач Jolpica перезавантажує f1.sessions/results/laps цілком (truncate), тому
--     жодних зовнішніх ключів на ці таблиці; прогнози посилаються на стабільні f1.rounds / f1.drivers / f1.teams
--     (upsert) і на auth.users (Supabase Auth).
--   * Писати можна лише через функції (security definer): таблицями authenticated лише читає свої рядки (RLS).
--   * Дедлайн один на вікенд: старт сесії Q1 − 5 хв (play.deadline); тримає база — функція запису й тригер.
--   * Очки рахує play.score_round (ідемпотентна), її викликає data-sync після завантаження результатів.
--   * Публічне (anon): лише подання зі списку нижче — таблиця сезону/етапу, чемпіони, прогнози ПІСЛЯ дедлайну.
--   * Права — явно (0004): ні таблиці, ні функції не стають публічними мовчки; перевірка — scripts/db/rls_smoke.py.

create schema if not exists play;
grant usage on schema play to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Допоміжні чисті функції
-- ---------------------------------------------------------------------------

-- 10 слотів (P1–P10); P1–P3 обов'язкові, P4–P10 можуть бути порожніми (null); без повторів пілота.
create or replace function play.picks_valid(p bigint[]) returns boolean
language sql immutable parallel safe as $$
  select p is not null and array_ndims(p) = 1 and cardinality(p) = 10
     and p[1] is not null and p[2] is not null and p[3] is not null
     and (select count(d) = count(distinct d) from unnest(p) as d)
$$;
revoke all on function play.picks_valid(bigint[]) from public;
grant execute on function play.picks_valid(bigint[]) to service_role;

-- Дедлайн вікенду: початок Q1 (головної кваліфікації; в спринт-вікенд спринт-кваліфікація — SQ1) − 5 хвилин.
-- null — час сесії невідомий або «не справжній» (північ UTC = лише дата, як real у calendar_sessions): тоді закрито.
create or replace function play.deadline(p_year int, p_round int) returns timestamptz
language sql stable security definer set search_path = pg_catalog, f1 as $$
  select min(s.starts_at) - interval '5 minutes'
  from f1.sessions s join f1.rounds r on r.id = s.round_id
  where r.season_year = p_year and r.number = p_round and s.type = 'Q1' and not s.is_cancelled
    and s.starts_at is not null and (s.starts_at at time zone 'UTC')::time <> '00:00'
$$;
revoke all on function play.deadline(int, int) from public;
-- anon/authenticated: функції в поданні виконуються з правами того, хто читає (на відміну від таблиць, що читаються з правами
-- власника подання), тож revealed_predictions потребує execute. Сам дедлайн не таємниця — він виводиться з публічного календаря.
grant execute on function play.deadline(int, int) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Таблиці
-- ---------------------------------------------------------------------------

create table if not exists play.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  nick         text not null,
  nick_hidden  boolean not null default false,   -- модерація: образливий нік замінюється на «Гравець XXXX», результати лишаються
  created_at   timestamptz not null default now(),
  -- email у ніку заборонено (приватність), керуючі символи теж; «Гравець …» — зарезервовано під приховані ніки.
  constraint profiles_nick_chk check (nick = btrim(nick) and char_length(nick) between 3 and 24
                                      and nick !~ '[[:cntrl:]@]' and nick !~ '^[Гг]равець '),
  public_name  text generated always as (
    case when nick_hidden then 'Гравець ' || upper(substr(md5(user_id::text), 1, 4)) else nick end) stored
);
create unique index if not exists profiles_nick_lower_idx on play.profiles (lower(nick));

-- Блокування модератором — окремо від профілю й БЕЗ зовнішнього ключа: видалення профілю (право гравця на видалення даних)
-- не знімає блокування, інакше заблокований обійшов би його «видалити профіль → set_nick → новий чистий профіль».
-- Запис не містить персональних даних (лише службовий uid); ніка, прогнозів і очок після видалення профілю немає.
-- Заблокований не пише, не потрапляє в публічні подання й титули. Знімає блокування лише модератор (delete з таблиці).
create table if not exists play.blocked_users (
  user_id     uuid primary key,
  blocked_at  timestamptz not null default now()
);

-- kind: Q — кваліфікація (топ-10), R — гонка (топ-10 + «яка команда не фінішує» або «усі фінішують»).
create table if not exists play.predictions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references play.profiles(user_id) on delete cascade,
  season_year  smallint not null,
  round        smallint not null,
  kind         text not null check (kind in ('Q', 'R')),
  picks        bigint[] not null,                -- f1.drivers.id за слотами P1…P10 (null — слот порожній)
  dnf_team_id  bigint references f1.teams(id),
  all_finish   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, season_year, round, kind),
  foreign key (season_year, round) references f1.rounds(season_year, number),
  constraint predictions_picks_chk check (play.picks_valid(picks)),
  constraint predictions_dnf_only_race_chk check (kind = 'R' or (dnf_team_id is null and not all_finish)),
  constraint predictions_dnf_exclusive_chk check (not (all_finish and dnf_team_id is not null))
);
create index if not exists predictions_round_idx on play.predictions (season_year, round);

create table if not exists play.scores (
  prediction_id  bigint primary key references play.predictions(id) on delete cascade,
  points         integer not null,
  breakdown      jsonb not null,                 -- слоти, влучання, бонуси (для сторінки «мій прогноз»)
  scored_at      timestamptz not null default now()
);

create table if not exists play.season_champions (
  season_year    smallint not null,
  user_id        uuid not null references play.profiles(user_id) on delete cascade,
  points         integer not null,
  rounds_played  integer not null,
  rounds_counted integer not null,
  awarded_at     timestamptz not null default now(),
  primary key (season_year, user_id)
);

create table if not exists play.season_closures (
  season_year     smallint primary key,
  closed_at       timestamptz not null default now(),
  rounds_counted  integer not null,              -- етапи, на які були оцінені прогнози
  min_rounds      integer not null,              -- мінімум участі для титулу: ceil(rounds_counted / 2)
  champions       integer not null
);

-- ---------------------------------------------------------------------------
-- Фактичні результати для підрахунку (службові подання, без доступу ззовні)
-- ---------------------------------------------------------------------------

-- Фінальна класифікація кваліфікації P1…Pn одним списком. У f1 вона лежить трьома сесіями Q1/Q2/Q3, кожна ранжована
-- за часом своєї частини (topup_api.insert_qualifying; так само в дампі). Пілот потрапляє в найвищу частину, де має час;
-- далі — за місцем у цій частині (Q3 → P1–10, Q2 → наступні, Q1 → решта; без жодного часу — позаду всіх).
create or replace view play.qualifying_classification as
with q as (
  select r.season_year, r.number as round, x.driver_id, x.team_id, x.position,
         case when coalesce(x.is_classified, false) then (case s.type when 'Q3' then 3 when 'Q2' then 2 else 1 end) else 0 end as stage
  from f1.results x
  join f1.sessions s on s.id = x.session_id and s.type in ('Q1', 'Q2', 'Q3') and not s.is_cancelled
  join f1.rounds r on r.id = s.round_id and r.number is not null
  where x.position is not null
),
best as (
  select distinct on (season_year, round, driver_id) season_year, round, driver_id, team_id, stage, position
  from q order by season_year, round, driver_id, stage desc, position
)
select season_year, round, driver_id, team_id,
       (row_number() over (partition by season_year, round order by stage desc, position, driver_id))::int as position
from best;

-- Фінішна класифікація гонки: лише класифіковані (в Ergast/Jolpica — числова позиція; зійшов до 90 % дистанції,
-- дискваліфікований, не стартував — ні).
create or replace view play.race_classification as
select r.season_year, r.number as round, x.driver_id, x.team_id, x.position::int as position
from f1.results x
join f1.sessions s on s.id = x.session_id and s.type = 'R' and not s.is_cancelled
join f1.rounds r on r.id = s.round_id and r.number is not null
where x.position is not null and coalesce(x.is_classified, x.status in (0, 1), false);

-- ---------------------------------------------------------------------------
-- Підрахунок очків
-- ---------------------------------------------------------------------------
-- Схема (рішення користувача 19.11): точний слот P1 10, P2 8, P3 6, P4–P10 по 3; +10 весь подіум (P1–P3 точно);
-- +30 вся десятка (усі 10 слотів заповнені й точні); +1 за пілота, який у фактичному топ-10, але не на своєму слоті;
-- гонка: +10 за «яка команда не фінішує» (команда мала хоч один некласифікований болід) або за «усі фінішують»
-- (жоден болід не залишився некласифікованим). «Не фінішував» = не класифікований: однакове поле і в дампі, і в доливці
-- API (is_classified); зійшов після 90 % дистанції = класифікований = фінішував.
-- Ідемпотентна: повторний виклик з тими самими результатами нічого не змінює (scored_at оновлюється лише при зміні).
-- Повертає кількість оцінених прогнозів (тих, для яких результат уже є).
create or replace function play.score_round(p_year int, p_round int) returns int
language plpgsql security definer set search_path = pg_catalog, f1, play as $$
declare
  v_count int;
begin
  with act as (
    select 'Q'::text as kind, position, driver_id from play.qualifying_classification where season_year = p_year and round = p_round
    union all
    select 'R', position, driver_id from play.race_classification where season_year = p_year and round = p_round
  ),
  has as (select distinct kind from act),
  race_end as (
    select coalesce(array_agg(distinct x.team_id) filter (where not coalesce(x.is_classified, x.status in (0, 1), false)), '{}') as dnf_teams
    from f1.results x
    join f1.sessions s on s.id = x.session_id and s.type = 'R' and not s.is_cancelled
    join f1.rounds r on r.id = s.round_id
    where r.season_year = p_year and r.number = p_round
  ),
  preds as (
    select p.id, p.kind, p.picks, p.dnf_team_id, p.all_finish
    from play.predictions p where p.season_year = p_year and p.round = p_round and p.kind in (select kind from has)
  ),
  slots as (
    select pr.id, pr.kind, s.slot::int as slot, s.driver_id, a.position as actual,
           (a.position = s.slot) as exact,
           (a.position <> s.slot and a.position <= 10) as near
    from preds pr
    cross join lateral unnest(pr.picks) with ordinality as s(driver_id, slot)
    left join act a on a.kind = pr.kind and a.driver_id = s.driver_id
  ),
  slot_pts as (
    select *, case when exact then (case slot when 1 then 10 when 2 then 8 when 3 then 6 else 3 end)
                   when near then 1 else 0 end as pts
    from slots
  ),
  per as (
    select pr.id, pr.kind, pr.dnf_team_id, pr.all_finish,
           coalesce(sum(sp.pts) filter (where sp.exact), 0)::int as exact_points,
           coalesce(sum(sp.pts) filter (where sp.near), 0)::int as near_points,
           count(*) filter (where sp.exact)::int as exact_n,
           count(*) filter (where sp.exact and sp.slot <= 3)::int as podium_exact,
           count(*) filter (where sp.near)::int as near_n,
           jsonb_agg(jsonb_build_object('slot', sp.slot, 'driver', sp.driver_id, 'actual', sp.actual, 'points', sp.pts)
                     order by sp.slot) as slot_detail
    from preds pr join slot_pts sp on sp.id = pr.id
    group by pr.id, pr.kind, pr.dnf_team_id, pr.all_finish
  ),
  fin as (
    select per.*, (case when exact_n >= 0 and podium_exact = 3 then 10 else 0 end) as podium_bonus,
           (case when exact_n = 10 then 30 else 0 end) as top10_bonus,
           (case when kind = 'R' and ((all_finish and cardinality(re.dnf_teams) = 0)
                                      or (dnf_team_id is not null and dnf_team_id = any (re.dnf_teams))) then 10 else 0 end) as dnf_bonus
    from per cross join race_end re
  ),
  ins as (
    insert into play.scores (prediction_id, points, breakdown)
    select id, exact_points + near_points + podium_bonus + top10_bonus + dnf_bonus,
           jsonb_build_object('exact', exact_n, 'near', near_n, 'exact_points', exact_points, 'near_points', near_points,
                              'podium_bonus', podium_bonus, 'top10_bonus', top10_bonus, 'dnf_bonus', dnf_bonus,
                              'slots', slot_detail)
    from fin
    on conflict (prediction_id) do update
      set points = excluded.points, breakdown = excluded.breakdown, scored_at = now()
      where play.scores.points is distinct from excluded.points or play.scores.breakdown is distinct from excluded.breakdown
    returning 1
  )
  select count(*) into v_count from fin;
  return v_count;
end;
$$;
revoke all on function play.score_round(int, int) from public;
grant execute on function play.score_round(int, int) to service_role;

-- Усі етапи, де є прогнози: повний перерахунок (цього достатньо й після пізніх змін результатів — штрафи, дискваліфікації).
create or replace function play.score_all() returns int
language plpgsql security definer set search_path = pg_catalog, f1, play as $$
declare
  r record;
  n int := 0;
begin
  for r in select distinct season_year, round from play.predictions order by 1, 2 loop
    n := n + play.score_round(r.season_year, r.round);
  end loop;
  return n;
end;
$$;
revoke all on function play.score_all() from public;
grant execute on function play.score_all() to service_role;

-- Закриття сезону: чемпіони — усі, хто має однакову найбільшу суму серед тих, хто спрогнозував не менше половини етапів
-- (ceil(N / 2), N — етапи сезону, на які оцінено прогнози; тож для сезону, що почався посеред року, N — лише етапи гри).
-- Заблоковані не отримують титул. Повторний виклик замінює результат попереднього. Відмовляє, якщо є неоцінені прогнози
-- на етапи, результати яких уже в базі (спершу score_all).
create or replace function play.close_season(p_year int) returns int
language plpgsql security definer set search_path = pg_catalog, f1, play as $$
declare
  v_counted int;
  v_min int;
  v_champs int;
begin
  if exists (
    select 1 from play.predictions p
    where p.season_year = p_year and not exists (select 1 from play.scores s where s.prediction_id = p.id)
      and ((p.kind = 'Q' and exists (select 1 from play.qualifying_classification c where c.season_year = p.season_year and c.round = p.round))
        or (p.kind = 'R' and exists (select 1 from play.race_classification c where c.season_year = p.season_year and c.round = p.round)))
  ) then
    raise exception 'season_not_scored' using errcode = 'P0001', hint = 'спершу play.score_all()';
  end if;
  select count(distinct p.round) into v_counted
  from play.predictions p join play.scores s on s.prediction_id = p.id where p.season_year = p_year;
  if v_counted = 0 then
    raise exception 'no_scored_rounds' using errcode = 'P0001';
  end if;
  v_min := ceil(v_counted / 2.0)::int;

  delete from play.season_champions where season_year = p_year;
  with per_user as (
    select p.user_id, sum(s.points)::int as points, count(distinct p.round)::int as rounds
    from play.predictions p join play.scores s on s.prediction_id = p.id
    join play.profiles pr on pr.user_id = p.user_id and not exists (select 1 from play.blocked_users b where b.user_id = pr.user_id)
    where p.season_year = p_year group by p.user_id
  ),
  eligible as (select * from per_user where rounds >= v_min),
  top as (select max(points) as points from eligible)
  insert into play.season_champions (season_year, user_id, points, rounds_played, rounds_counted)
  select p_year, e.user_id, e.points, e.rounds, v_counted from eligible e join top t on t.points = e.points;
  get diagnostics v_champs = row_count;

  insert into play.season_closures (season_year, rounds_counted, min_rounds, champions)
  values (p_year, v_counted, v_min, v_champs)
  on conflict (season_year) do update
    set closed_at = now(), rounds_counted = excluded.rounds_counted, min_rounds = excluded.min_rounds, champions = excluded.champions;
  return v_champs;
end;
$$;
revoke all on function play.close_season(int) from public;
grant execute on function play.close_season(int) to service_role;

-- ---------------------------------------------------------------------------
-- Дедлайн у базі: жодного запису прогнозу після дедлайну вікенду, ким би він не був зроблений
-- ---------------------------------------------------------------------------
create or replace function play.predictions_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, f1, play as $$
declare
  dl timestamptz := play.deadline(new.season_year, new.round);
begin
  -- clock_timestamp(), не now(): now() — початок транзакції, довга транзакція записала б пізніше дедлайну.
  if dl is null or clock_timestamp() >= dl then
    raise exception 'prediction_closed' using errcode = 'P0001', hint = 'дедлайн вікенду: ' || coalesce(dl::text, 'невідомий');
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function play.predictions_guard() from public;
drop trigger if exists predictions_guard on play.predictions;
create trigger predictions_guard before insert or update of picks, dnf_team_id, all_finish, kind, season_year, round
  on play.predictions for each row execute function play.predictions_guard();

-- ---------------------------------------------------------------------------
-- Функції для гравця (authenticated): єдине місце запису
-- ---------------------------------------------------------------------------

create or replace function play.set_nick(p_nick text) returns void
language plpgsql security definer set search_path = pg_catalog, f1, play as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from play.blocked_users where user_id = v_uid) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;
  -- Порушення формату (check) і зайнятий нік (унікальний індекс) — звичайні помилки 23514 / 23505.
  insert into play.profiles (user_id, nick) values (v_uid, p_nick)
  on conflict (user_id) do update set nick = excluded.nick;
end;
$$;
revoke all on function play.set_nick(text) from public;
grant execute on function play.set_nick(text) to authenticated, service_role;

create or replace function play.save_prediction(p_year int, p_round int, p_kind text, p_picks bigint[],
                                                p_dnf_team bigint default null, p_all_finish boolean default false)
returns void language plpgsql security definer set search_path = pg_catalog, f1, play as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from play.blocked_users where user_id = v_uid) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;
  if not exists (select 1 from play.profiles where user_id = v_uid) then
    raise exception 'no_profile' using errcode = 'P0001';
  end if;
  if p_kind is null or p_kind not in ('Q', 'R') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if not exists (select 1 from f1.rounds where season_year = p_year and number = p_round and not is_cancelled) then
    raise exception 'unknown_round' using errcode = 'P0001';
  end if;
  if not play.picks_valid(p_picks) then raise exception 'bad_picks' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(p_picks) as d where d is not null and not exists (select 1 from f1.drivers x where x.id = d)) then
    raise exception 'unknown_driver' using errcode = 'P0001';
  end if;
  if p_kind = 'Q' and (p_dnf_team is not null or coalesce(p_all_finish, false)) then
    raise exception 'bad_extras' using errcode = 'P0001';
  end if;
  if p_dnf_team is not null and not exists (select 1 from f1.teams where id = p_dnf_team) then
    raise exception 'unknown_team' using errcode = 'P0001';
  end if;
  -- Дедлайн перевіряє тригер predictions_guard (і на insert, і на update).
  insert into play.predictions (user_id, season_year, round, kind, picks, dnf_team_id, all_finish)
  values (v_uid, p_year, p_round, p_kind, p_picks, p_dnf_team, coalesce(p_all_finish, false))
  on conflict (user_id, season_year, round, kind) do update
    set picks = excluded.picks, dnf_team_id = excluded.dnf_team_id, all_finish = excluded.all_finish;
end;
$$;
revoke all on function play.save_prediction(int, int, text, bigint[], bigint, boolean) from public;
grant execute on function play.save_prediction(int, int, text, bigint[], bigint, boolean) to authenticated, service_role;

-- Видалення своїх даних (профіль → прогнози → очки → титули каскадом); користувача в auth видаляє сервер (admin API).
-- Дозволено й заблокованому: блокування живе в play.blocked_users і видалення не знімає.
create or replace function play.delete_my_profile() returns void
language plpgsql security definer set search_path = pg_catalog, f1, play as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from play.profiles where user_id = auth.uid();
end;
$$;
revoke all on function play.delete_my_profile() from public;
grant execute on function play.delete_my_profile() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Подання (публічні: власник — роль міграції, тож вони читають таблиці повз RLS; саме це й задумано)
-- ---------------------------------------------------------------------------

-- Етап сезону, на який оцінено хоч один прогноз, і очки гравця за етап.
create or replace view play.round_points as
select p.user_id, p.season_year, p.round, sum(s.points)::int as points
from play.predictions p join play.scores s on s.prediction_id = p.id
group by p.user_id, p.season_year, p.round;

-- Таблиця сезону: однакова сума — однакове місце (1, 1, 3). rounds — етапів, де гравець мав оцінений прогноз;
-- eligible — чи досяг мінімуму участі для титулу (половина етапів гри, угору). Заблоковані не показуються.
create or replace view play.season_standings as
with counted as (select season_year, count(distinct round)::int as n from play.round_points group by season_year),
tot as (
  select rp.season_year, rp.user_id, sum(rp.points)::int as points, count(*)::int as rounds
  from play.round_points rp group by rp.season_year, rp.user_id
)
select t.season_year, pr.public_name as player, t.points, t.rounds,
       (rank() over (partition by t.season_year order by t.points desc))::int as place,
       c.n as rounds_counted, (t.rounds >= ceil(c.n / 2.0)) as eligible
from tot t
join play.profiles pr on pr.user_id = t.user_id and not exists (select 1 from play.blocked_users b where b.user_id = pr.user_id)
join counted c on c.season_year = t.season_year;

create or replace view play.round_standings as
select rp.season_year, rp.round, pr.public_name as player, rp.points,
       (rank() over (partition by rp.season_year, rp.round order by rp.points desc))::int as place
from play.round_points rp
join play.profiles pr on pr.user_id = rp.user_id and not exists (select 1 from play.blocked_users b where b.user_id = pr.user_id);

create or replace view play.champions as
select c.season_year, pr.public_name as player, c.points, c.rounds_played, c.rounds_counted
from play.season_champions c
join play.profiles pr on pr.user_id = c.user_id and not exists (select 1 from play.blocked_users b where b.user_id = pr.user_id);

-- Прогнози всіх гравців — лише після дедлайну вікенду (до того — тільки свої, через RLS таблиці predictions).
create or replace view play.revealed_predictions as
select p.id, p.season_year, p.round, p.kind, pr.public_name as player, p.picks, p.dnf_team_id, p.all_finish, s.points
from play.predictions p
join play.profiles pr on pr.user_id = p.user_id and not exists (select 1 from play.blocked_users b where b.user_id = pr.user_id)
left join play.scores s on s.prediction_id = p.id
where play.deadline(p.season_year, p.round) is not null and clock_timestamp() >= play.deadline(p.season_year, p.round);

-- ---------------------------------------------------------------------------
-- Права і RLS
-- ---------------------------------------------------------------------------
alter table play.profiles        enable row level security;
alter table play.predictions     enable row level security;
alter table play.scores          enable row level security;
alter table play.season_champions enable row level security;
alter table play.season_closures enable row level security;
alter table play.blocked_users   enable row level security;

drop policy if exists profiles_own_select on play.profiles;
create policy profiles_own_select on play.profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists predictions_own_select on play.predictions;
create policy predictions_own_select on play.predictions for select to authenticated using (user_id = auth.uid());
drop policy if exists scores_own_select on play.scores;
create policy scores_own_select on play.scores for select to authenticated
  using (exists (select 1 from play.predictions p where p.id = prediction_id and p.user_id = auth.uid()));

-- Права — явно й остаточно (0004): спершу знімаємо все (на випадок «глобальних» прав за замовчуванням у проєкті Supabase),
-- потім видаємо лише потрібне. Перевірка — scripts/db/rls_smoke.py (структурні перевірки схеми play).
revoke all on all tables in schema play from public, anon, authenticated;
revoke all on all sequences in schema play from public, anon, authenticated;
revoke all on all functions in schema play from public, anon, authenticated;

grant select on play.profiles, play.predictions, play.scores to authenticated;
grant select on play.season_standings, play.round_standings, play.champions, play.revealed_predictions to anon, authenticated;
grant execute on function play.deadline(int, int) to anon, authenticated;
grant execute on function play.set_nick(text), play.save_prediction(int, int, text, bigint[], bigint, boolean),
                          play.delete_my_profile() to authenticated;
grant all on all tables in schema play to service_role;
grant usage, select on all sequences in schema play to service_role;
grant execute on all functions in schema play to service_role;
