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

-- Поули не залежать від старту: пілот, що виграв кваліфікацію, але не стартував (Шумахер, Франція 1996; Леклер, Монако
-- 2021; Жар'є, Аргентина 1975; Піроні, Німеччина 1982 — замір db.yml 12.11), зберігає поул, як в офіційній статистиці.
-- Поул = перше місце на решітці (grid = 1) у заявці, яку правило 0002 вважало заявкою на гонку — тобто числа поулів
-- лишаються такими, як до цієї міграції (McLaren 181, Шумахер 68).
create or replace view f1.v_pole as
select distinct ro.id as round_id, ro.season_year, ro.number as round_number, ro.name as round_name, ro.date as round_date,
       r.driver_id, tf.family_id
from f1.results r
join f1.sessions s on s.id = r.session_id and s.type = 'R' and not s.is_cancelled
join f1.rounds ro on ro.id = s.round_id
join f1.teams t on t.id = r.team_id
join f1.team_families tf on tf.ref = t.ref and ro.season_year between tf.from_year and tf.to_year
where r.grid = 1 and f1.result_started(r.detail, r.position, r.laps_completed, r.grid);

-- Ті самі визначення (0006, 0007, 0008), поули — з v_pole.
drop materialized view if exists f1.driver_index;
create materialized view f1.driver_index as
with race as (
  select * from f1.v_team_race where session_type = 'R' and started
),
agg as (
  select driver_id,
         count(distinct round_id) as starts,
         count(distinct round_id) filter (where is_classified and position = 1) as wins,
         count(distinct round_id) filter (where is_classified and position <= 3) as podiums,
         count(distinct round_id) filter (where grid = 1) as poles,
         min(season_year) as y0, max(season_year) as y1,
         count(distinct season_year) as seasons
  from race group by driver_id
),
main_team as (
  select distinct on (driver_id) driver_id, family_id
  from (select driver_id, family_id, count(distinct round_id) as n, max(round_date) as last
        from race group by driver_id, family_id) x
  order by driver_id, n desc, last desc
),
titles as (
  select driver_id, array_agg(season_year::int order by season_year) as years from f1.v_driver_champion group by driver_id
),
cs as (select year from f1.v_current_season),
cur_last as (
  -- Остання гонка пілота в поточному сезоні: команда й номер машини.
  select distinct on (r.driver_id) r.driver_id, r.family_id, res.car_number
  from race r
  join f1.results res on res.driver_id = r.driver_id
  join f1.sessions s on s.id = res.session_id and s.type = 'R' and s.round_id = r.round_id, cs
  where r.season_year = cs.year
  order by r.driver_id, r.round_number desc
),
cur_standing as (
  select ds.driver_id, ds.position, ds.points
  from f1.driver_standings ds
  join (select season_year, max(round_number * 100 + session_number) as k from f1.driver_standings group by season_year) last
    on last.season_year = ds.season_year and ds.round_number * 100 + ds.session_number = last.k
  cross join cs
  where ds.season_year = cs.year
)
select d.ref as id, d.forename, d.surname, d.code, d.country_code, d.nationality, d.wikipedia_en,
       a.starts::int, a.wins::int, a.podiums::int, (select count(distinct p.round_id) from f1.v_pole p where p.driver_id = a.driver_id)::int as poles,
       coalesce(cardinality(t.years), 0)::int as titles, coalesce(t.years, '{}') as title_years,
       a.y0::int, a.y1::int, a.seasons::int,
       mt.family_id as main_team,
       cl.family_id as current_team, cl.car_number::int as current_number,
       cst.position::int as current_position, cst.points::float8 as current_points
from agg a
join f1.drivers d on d.id = a.driver_id
left join main_team mt on mt.driver_id = a.driver_id
left join titles t on t.driver_id = a.driver_id
left join cur_last cl on cl.driver_id = a.driver_id
left join cur_standing cst on cst.driver_id = a.driver_id
where a.starts > 0;
create unique index if not exists driver_index_pk on f1.driver_index(id);
grant select on f1.driver_index to anon, authenticated;

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
       a.races::int, a.wins::int, a.podiums::int, (select count(distinct p.round_id) from f1.v_pole p where p.driver_id = a.driver_id and p.season_year = a.season_year)::int as poles,
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
-- Поточний сезон не враховуємо: одна гонка без даних серед перших етапів сховала б число в усіх пілотів.
fl_from as (
  select coalesce(max(season_year) + 1, 0) as year
  from fl_season where share < 0.9 and season_year < (select year from f1.v_current_season)
),
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
  from f1.v_pole order by driver_id, round_date, round_id
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

drop materialized view if exists f1.team_totals;
create materialized view f1.team_totals as
with race as (select * from f1.v_team_race where session_type = 'R' and started),
agg as (
  select family_id,
         count(distinct round_id) as grands_prix,
         count(distinct round_id) filter (where is_classified and position = 1) as wins,
         count(distinct (round_id, position)) filter (where is_classified and position <= 3) as podiums
  from race group by family_id
),
per_round as (
  select family_id, round_id, bool_or(grid = 1) as pole,
         bool_or(is_classified and position = 1) and bool_or(is_classified and position = 2) as one_two
  from race group by family_id, round_id
),
round_agg as (
  select family_id, count(*) filter (where pole) as poles, count(*) filter (where one_two) as one_twos
  from per_round group by family_id
),
ctitles as (select id, count(*) filter (where champion) as n from f1.team_seasons group by id),
dtitles as (select id, sum(cardinality(years)) as n from f1.team_champions group by id),
first_race as (
  select distinct on (family_id) family_id, season_year as y, round_name as n, round_date as d
  from race order by family_id, round_date, round_id
),
last_race as (
  select distinct on (family_id) family_id, season_year as y, round_name as n, round_date as d
  from race order by family_id, round_date desc, round_id desc
)
select a.family_id as id, a.grands_prix::int, a.wins::int, a.podiums::int,
       (select count(distinct p.round_id) from f1.v_pole p where p.family_id = a.family_id)::int as poles, ra.one_twos::int,
       coalesce(ct.n, 0)::int as constructors_titles, coalesce(dt.n, 0)::int as drivers_titles,
       fr.y::int as debut_year, fr.n as debut_name, fr.d as debut_date,
       lr.y::int as last_year, lr.n as last_name, lr.d as last_date
from agg a
join round_agg ra on ra.family_id = a.family_id
join first_race fr on fr.family_id = a.family_id
join last_race lr on lr.family_id = a.family_id
left join ctitles ct on ct.id = a.family_id
left join dtitles dt on dt.id = a.family_id;
create unique index if not exists team_totals_pk on f1.team_totals(id);
grant select on f1.team_totals to anon, authenticated;

-- Решту матеріалізованих подань (читають v_team_race / v_driver_round) перераховує f1.refresh_derived():
-- на бою — check_live.py --publish у data-sync, у db.yml — завантажувачі.
