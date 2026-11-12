-- Похідні дані сторінки пілота (фаза 3d, docs/plans/2026-11-12-phase3d-driver-page.md).
-- Правила — як у f1.driver_index (0007): старт — f1.result_started; перемоги й подіуми — за гонками; поул — старт
-- з першого місця (grid = 1); титул поточного сезону — лише коли математично вирішено. Додатково:
--   * одна гонка пілота — один рядок (v_driver_round): у 1950-х пілот міг їхати двома машинами в одній гонці —
--     береться краща класифікація; команда, номер і місце на старті — з того самого (кращого) результату;
--   * очки за кар'єру — сума підсумкових очок чемпіонатів (зараховані, як у таблиці сезонів);
--   * найшвидші кола — повні дані Jolpica лише з 2004 року (замір API і дампу 12.11): fastest_laps_known = уся
--     кар'єра пілота не раніше першого сезону з повними даними; інакше число неповне й на сайті не показується;
--   * напарники — пілоти тієї самої команди (родини), з якими обидва стартували в одній гонці; «попереду» —
--     вище в протоколі гонки (як у f1.team_pairing); кваліфікація — з 1994 року (дані Jolpica), див. quali нижче;
--     у подання потрапляють пари від 5 спільних гонок (рішення користувача 12.11).
-- Службові подання v_* — не публічні (0004: select лише явно), публічні — матеріалізовані нижче.

create or replace view f1.v_driver_round as
with rows as (
  select r.driver_id, tf.family_id, ro.id as round_id, ro.season_year, ro.number as round_number,
         ro.name as round_name, ro.date as round_date,
         r.position, r.is_classified, r.grid, r.car_number, r.fastest_lap_rank
  from f1.results r
  join f1.sessions s on s.id = r.session_id and s.type = 'R' and not s.is_cancelled
  join f1.rounds ro on ro.id = s.round_id
  join f1.teams t on t.id = r.team_id
  join f1.team_families tf on tf.ref = t.ref and ro.season_year between tf.from_year and tf.to_year
  where f1.result_started(r.detail, r.position, r.laps_completed, r.grid)
)
select driver_id, round_id, season_year, round_number, round_name, round_date,
       (array_agg(family_id order by is_classified desc nulls last, position nulls last))[1] as family_id,
       (array_agg(car_number order by is_classified desc nulls last, position nulls last))[1] as car_number,
       (array_agg(grid order by is_classified desc nulls last, position nulls last))[1] as best_grid,
       min(position) filter (where is_classified) as position,
       min(position) as order_position,
       coalesce(bool_or(grid = 1), false) as pole,
       coalesce(bool_or(fastest_lap_rank = 1), false) as fastest_lap
from rows
group by driver_id, round_id, season_year, round_number, round_name, round_date;

-- Підсумковий залік пілотів кожного сезону (останній етап, остання сесія).
create or replace view f1.v_driver_final as
with last as (
  select season_year, max(round_number * 100 + session_number) as k from f1.driver_standings group by season_year
)
select ds.season_year, ds.driver_id, ds.position, ds.points, coalesce(ds.is_eligible, true) as eligible,
       coalesce(ds.adjustment_type = 102, false) as excluded
from f1.driver_standings ds join last on last.season_year = ds.season_year
 and ds.round_number * 100 + ds.session_number = last.k;

-- 1. Сезони пілота.
drop materialized view if exists f1.driver_seasons;
create materialized view f1.driver_seasons as
with dr as (select * from f1.v_driver_round),
agg as (
  select driver_id, season_year, count(*) as races,
         count(*) filter (where position = 1) as wins,
         count(*) filter (where position <= 3) as podiums,
         count(*) filter (where pole) as poles
  from dr group by driver_id, season_year
),
teams as (
  select driver_id, season_year, jsonb_agg(jsonb_build_object('id', family_id, 'races', n) order by first_round) as teams
  from (select driver_id, season_year, family_id, count(*)::int as n, min(round_number) as first_round
        from dr group by driver_id, season_year, family_id) x
  group by driver_id, season_year
),
nums as (
  select driver_id, season_year, array_agg(car_number::int order by first_round) as numbers
  from (select driver_id, season_year, car_number, min(round_number) as first_round
        from dr where car_number is not null group by driver_id, season_year, car_number) x
  group by driver_id, season_year
)
select d.ref as id, a.season_year::int as year, t.teams, coalesce(n.numbers, '{}') as numbers,
       a.races::int, a.wins::int, a.podiums::int, a.poles::int,
       -- Очки — як є (бувають половинні); float8, щоб JSON віддавав число.
       f.points::float8 as points,
       case when f.eligible and not f.excluded then f.position end::int as position,
       coalesce(f.excluded, false) as excluded,
       exists (select 1 from f1.v_driver_champion c where c.season_year = a.season_year and c.driver_id = a.driver_id) as champion,
       (a.season_year = cs.year and cs.driver_points_left > 0) as in_progress
from agg a
join f1.drivers d on d.id = a.driver_id
join teams t on t.driver_id = a.driver_id and t.season_year = a.season_year
left join nums n on n.driver_id = a.driver_id and n.season_year = a.season_year
left join f1.v_driver_final f on f.driver_id = a.driver_id and f.season_year = a.season_year
cross join f1.v_current_season cs;
create unique index if not exists driver_seasons_pk on f1.driver_seasons(id, year);
grant select on f1.driver_seasons to anon, authenticated;

-- 2. Усі перемоги пілота по порядку.
drop materialized view if exists f1.driver_wins;
create materialized view f1.driver_wins as
select d.ref as id,
       (row_number() over (partition by v.driver_id order by v.round_date, v.round_id))::int as n,
       v.season_year::int as year, v.round_number::int as round, v.round_name as name, v.round_date as date,
       v.family_id as team, v.best_grid::int as grid
from f1.v_driver_round v join f1.drivers d on d.id = v.driver_id
where v.position = 1;
create unique index if not exists driver_wins_pk on f1.driver_wins(id, n);
grant select on f1.driver_wins to anon, authenticated;

-- 3. Підсумки й віхи.
drop materialized view if exists f1.driver_totals;
create materialized view f1.driver_totals as
with dr as (select * from f1.v_driver_round),
-- Перший сезон, з якого найшвидші кола є майже в кожній гонці (≥ 90 %): у дампі є поодинокі записи з 1958 року,
-- повні — з 2004 (замір db.yml 12.11: Шумахер 21 замість 77, Сенна 0 замість 19).
fl_season as (
  select season_year, count(*) filter (where fl)::numeric / count(*) as share
  from (select season_year, round_id, bool_or(fastest_lap) as fl from dr group by season_year, round_id) x
  group by season_year
),
fl_from as (select coalesce(max(season_year) + 1, 0) as year from fl_season where share < 0.9),
agg as (
  select driver_id, count(*) filter (where fastest_lap) as fastest_laps, min(season_year) as y0
  from dr group by driver_id
),
pts as (
  select f.driver_id, sum(f.points) as points
  from f1.v_driver_final f
  where exists (select 1 from dr where dr.driver_id = f.driver_id and dr.season_year = f.season_year)
  group by f.driver_id
),
debut as (
  select distinct on (driver_id) driver_id,
         jsonb_build_object('year', season_year, 'round', round_number, 'name', round_name, 'date', round_date) as j
  from dr order by driver_id, round_date, round_id
),
last_race as (
  select distinct on (driver_id) driver_id,
         jsonb_build_object('year', season_year, 'round', round_number, 'name', round_name, 'date', round_date) as j
  from dr order by driver_id, round_date desc, round_id desc
),
first_podium as (
  select distinct on (driver_id) driver_id,
         jsonb_build_object('year', season_year, 'round', round_number, 'name', round_name, 'position', position) as j
  from dr where position <= 3 order by driver_id, round_date, round_id
),
first_pole as (
  select distinct on (driver_id) driver_id,
         jsonb_build_object('year', season_year, 'round', round_number, 'name', round_name) as j
  from dr where pole order by driver_id, round_date, round_id
)
select d.ref as id, d.date_of_birth, d.permanent_number::int as permanent_number,
       coalesce(p.points, 0)::float8 as points,
       a.fastest_laps::int as fastest_laps,
       coalesce(a.y0 >= fl.year, false) as fastest_laps_known,
       db.j as debut, lr.j as last_race, fp.j as first_podium, fpo.j as first_pole
from agg a
join f1.drivers d on d.id = a.driver_id
cross join fl_from fl
join debut db on db.driver_id = a.driver_id
join last_race lr on lr.driver_id = a.driver_id
left join pts p on p.driver_id = a.driver_id
left join first_podium fp on fp.driver_id = a.driver_id
left join first_pole fpo on fpo.driver_id = a.driver_id;
create unique index if not exists driver_totals_pk on f1.driver_totals(id);
grant select on f1.driver_totals to anon, authenticated;

-- 4. Напарники (від 5 спільних гонок за одну команду).
drop materialized view if exists f1.driver_teammates;
create materialized view f1.driver_teammates as
with dr as (select * from f1.v_driver_round),
quali as (
  -- Підсумок кваліфікації етапу: з 2006 — найдальша частина (Q3 > Q2 > Q1) і місце в ній; 1994–2005 — єдина
  -- класифікація (QA — за сумою двох спроб, 2005; QB — за найкращим часом). До 1994 даних немає.
  select distinct on (ro.id, r.driver_id) ro.id as round_id, r.driver_id, tf.family_id,
         case s.type when 'Q3' then 3 when 'Q2' then 2 when 'Q1' then 1 else 0 end as part, r.position
  from f1.results r
  join f1.sessions s on s.id = r.session_id and s.type in ('Q1', 'Q2', 'Q3', 'QA', 'QB') and not s.is_cancelled
  join f1.rounds ro on ro.id = s.round_id
  join f1.teams t on t.id = r.team_id
  join f1.team_families tf on tf.ref = t.ref and ro.season_year between tf.from_year and tf.to_year
  order by ro.id, r.driver_id, case s.type when 'Q3' then 5 when 'Q2' then 4 when 'Q1' then 3 when 'QA' then 2 else 1 end desc
),
pairs as (
  select a.driver_id, b.driver_id as mate_id, a.family_id, a.season_year,
         coalesce(a.order_position, 999) < coalesce(b.order_position, 999) as ahead,
         coalesce(a.order_position, 999) > coalesce(b.order_position, 999) as behind,
         (qa.round_id is not null and qb.round_id is not null) as has_q,
         coalesce(qa.part > qb.part or (qa.part = qb.part and qa.position < qb.position), false) as q_ahead,
         coalesce(qb.part > qa.part or (qa.part = qb.part and qb.position < qa.position), false) as q_behind
  from dr a
  join dr b on b.round_id = a.round_id and b.family_id = a.family_id and b.driver_id <> a.driver_id
  left join quali qa on qa.round_id = a.round_id and qa.driver_id = a.driver_id and qa.family_id = a.family_id
  left join quali qb on qb.round_id = b.round_id and qb.driver_id = b.driver_id and qb.family_id = b.family_id
)
select d.ref as id, p.family_id as team, m.ref as mate, m.forename, m.surname,
       array_agg(distinct p.season_year::int) as years,
       count(*)::int as races,
       (count(*) filter (where p.ahead))::int as race_ahead,
       (count(*) filter (where p.behind))::int as race_behind,
       (count(*) filter (where p.has_q))::int as quali_races,
       (count(*) filter (where p.has_q and p.q_ahead))::int as quali_ahead,
       (count(*) filter (where p.has_q and p.q_behind))::int as quali_behind
from pairs p
join f1.drivers d on d.id = p.driver_id
join f1.drivers m on m.id = p.mate_id
group by d.ref, p.family_id, m.ref, m.forename, m.surname
having count(*) >= 5;
create unique index if not exists driver_teammates_pk on f1.driver_teammates(id, team, mate);
grant select on f1.driver_teammates to anon, authenticated;

create or replace function f1.refresh_derived() returns void language sql as $$
  refresh materialized view f1.team_index;
  refresh materialized view f1.site_meta;
  refresh materialized view f1.team_seasons;
  refresh materialized view f1.team_champions;
  refresh materialized view f1.team_wins;
  refresh materialized view f1.team_totals;
  refresh materialized view f1.team_pairing;
  refresh materialized view f1.driver_index;
  refresh materialized view f1.driver_seasons;
  refresh materialized view f1.driver_wins;
  refresh materialized view f1.driver_totals;
  refresh materialized view f1.driver_teammates;
$$;
revoke all on function f1.refresh_derived() from public, anon, authenticated;
