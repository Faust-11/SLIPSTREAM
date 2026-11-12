-- Правило старту: заявка зі статусом «не стартував» (status = 30) — не старт (рішення користувача 12.11: Марімон загинув
-- на тренуванні Гран-прі Німеччини 1954 — брав участь у вікенді, але не в гонці).
-- Замір db.yml 12.11: правило 0002 (текст причини, кола, місце на старті) зараховувало як старт 68 таких заявок у гонках —
-- усі з 0 кіл (аварія чи відмова до старту: Марімон 1954; Шумахер, Франція 1996 — двигун на прогрівальному колі).
-- Сход на першому колі (status 10 / 11, 0 кіл — 825 заявок) лишається стартом.
-- Нова функція з п'ятим параметром; стара (0002) лишається для сумісності, але подання її більше не використовують.
create or replace function f1.result_started(p_detail text, p_position smallint, p_laps smallint, p_grid smallint, p_status smallint)
returns boolean language sql immutable as $$
  select f1.result_started(p_detail, p_position, p_laps, p_grid) and coalesce(p_status, 0) <> 30
$$;

-- Подання з правилом старту — ті самі визначення (0006, 0008) з новим викликом.
create or replace view f1.v_team_race as
select tf.family_id, t.name as team_name, ro.id as round_id, ro.season_year, ro.number as round_number,
       ro.name as round_name, ro.date as round_date, s.type as session_type,
       r.driver_id, r.position, r.is_classified, r.grid, r.points,
       f1.result_started(r.detail, r.position, r.laps_completed, r.grid, r.status) as started
from f1.results r
join f1.sessions s on s.id = r.session_id and s.type in ('R', 'SR') and not s.is_cancelled
join f1.rounds ro on ro.id = s.round_id
join f1.teams t on t.id = r.team_id
join f1.team_families tf on tf.ref = t.ref and ro.season_year between tf.from_year and tf.to_year;

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
  where f1.result_started(r.detail, r.position, r.laps_completed, r.grid, r.status)
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

drop materialized view if exists f1.team_index;
create materialized view f1.team_index as
with race as (
  select tf.family_id, ro.id as round_id, ro.season_year, ro.number as round_number,
         r.driver_id, r.position, r.is_classified, r.detail, r.laps_completed, r.grid, r.status
  from f1.results r
  join f1.sessions s on s.id = r.session_id and s.type = 'R' and not s.is_cancelled
  join f1.rounds ro on ro.id = s.round_id
  join f1.teams t on t.id = r.team_id
  join f1.team_families tf on tf.ref = t.ref and ro.season_year between tf.from_year and tf.to_year
),
started as (
  select * from race where f1.result_started(detail, position, laps_completed, grid, status)
),
current_season as (
  select max(season_year) as year from race
),
-- Роки участі → діапазони [a, b] (суміжні роки зливаються).
years as (
  select distinct family_id, season_year from race
),
islands as (
  select family_id, season_year, season_year - row_number() over (partition by family_id order by season_year) as grp
  from years
),
seasons as (
  select family_id, jsonb_agg(jsonb_build_array(a, b) order by a) as seasons
  from (select family_id, min(season_year) a, max(season_year) b from islands group by family_id, grp) x
  group by family_id
),
counts as (
  select family_id,
         count(distinct round_id) as grands_prix,
         count(distinct round_id) filter (where is_classified and position = 1) as wins
  from started
  group by family_id
),
-- Остаточний залік кожного сезону: останній етап, остання сесія.
final_standings as (
  select ts.season_year, ts.team_id, ts.position, ts.points, ts.is_eligible
  from f1.team_standings ts
  join (
    select season_year, max(round_number * 100 + session_number) as k
    from f1.team_standings group by season_year
  ) last on last.season_year = ts.season_year and ts.round_number * 100 + ts.session_number = last.k
),
-- Етапи поточного сезону, що лишились (без результатів гонки, не скасовані) і їхній максимум очок.
remaining as (
  select coalesce(sum(43 + case when exists (
           select 1 from f1.sessions sr where sr.round_id = ro.id and sr.type = 'SR' and not sr.is_cancelled
         ) then 15 else 0 end), 0) as max_points
  from f1.rounds ro, current_season cs
  where ro.season_year = cs.year and ro.number is not null and not ro.is_cancelled
    and not exists (
      select 1 from f1.sessions s join f1.results r on r.session_id = s.id
      where s.round_id = ro.id and s.type = 'R'
    )
),
current_leader as (
  select fs.team_id,
         fs.points - coalesce((select max(f2.points) from final_standings f2
                               where f2.season_year = fs.season_year and f2.position > 1), 0) as lead
  from final_standings fs, current_season cs
  where fs.season_year = cs.year and fs.position = 1
),
titles as (
  select tf.family_id, count(*) as titles
  from final_standings fs
  join f1.teams t on t.id = fs.team_id
  join f1.team_families tf on tf.ref = t.ref and fs.season_year between tf.from_year and tf.to_year
  cross join current_season cs
  where fs.position = 1 and coalesce(fs.is_eligible, true)
    and (fs.season_year < cs.year
         or (fs.season_year = cs.year
             and (select lead from current_leader where current_leader.team_id = fs.team_id) > (select max_points from remaining)))
  group by tf.family_id
),
current_position as (
  select tf.family_id, min(fs.position) as position
  from final_standings fs
  join f1.teams t on t.id = fs.team_id
  join f1.team_families tf on tf.ref = t.ref and fs.season_year between tf.from_year and tf.to_year
  cross join current_season cs
  where fs.season_year = cs.year
  group by tf.family_id
),
last_round as (
  select r.round_id from race r, current_season cs
  where r.season_year = cs.year
  order by r.round_number desc limit 1
),
driver_rank as (
  select ds.driver_id, ds.position
  from f1.driver_standings ds
  join (
    select season_year, max(round_number * 100 + session_number) as k
    from f1.driver_standings group by season_year
  ) last on last.season_year = ds.season_year and ds.round_number * 100 + ds.session_number = last.k
  cross join current_season cs
  where ds.season_year = cs.year
),
crew as (
  select r.family_id, jsonb_agg(d.ref order by coalesce(dr.position, 999), d.ref) as drivers
  from race r
  join last_round lr on lr.round_id = r.round_id
  join f1.drivers d on d.id = r.driver_id
  left join driver_rank dr on dr.driver_id = r.driver_id
  group by r.family_id
)
select f.family_id as id,
       s.seasons,
       coalesce(c.grands_prix, 0)::int as grands_prix,
       coalesce(c.wins, 0)::int as wins,
       coalesce(ti.titles, 0)::int as titles,
       cp.position::int as current_position,
       coalesce(cr.drivers, '[]'::jsonb) as current_drivers
from (select distinct family_id from f1.team_families) f
join seasons s on s.family_id = f.family_id
left join counts c on c.family_id = f.family_id
left join titles ti on ti.family_id = f.family_id
left join current_position cp on cp.family_id = f.family_id
left join crew cr on cr.family_id = f.family_id;

create unique index if not exists team_index_id_idx on f1.team_index(id);
grant select on f1.team_index to anon, authenticated;

-- Решту матеріалізованих подань (читають v_team_race / v_driver_round) перераховує f1.refresh_derived():
-- на бою — check_live.py --publish у data-sync, у db.yml — завантажувачі.
