-- Конструктор Jolpica може належати різним командам у різні роки (рішення користувача 12.11: ATS 1963 —
-- італійська Automobili Turismo e Sport, ATS 1978–84 — німецька команда Гюнтера Шміда; одна ref «ats»).
-- f1.team_families: (ref, роки) → команда; усі приєднання враховують рік сезону.
-- Плюс виправлення джерела: виключення з Кубка конструкторів, яких немає в Jolpica (curated «exclusions»).
-- Подання 0002/0005 перестворюються з тими самими колонками й правами (select — явно, правило 0004).

alter table f1.team_families add column if not exists from_year smallint not null default 0;
alter table f1.team_families add column if not exists to_year smallint not null default 9999;
alter table f1.team_families drop constraint if exists team_families_pkey;
alter table f1.team_families add primary key (ref, from_year);

create table if not exists f1.team_season_exclusions (
  family_id   text not null,
  season_year smallint not null,
  primary key (family_id, season_year)
);
alter table f1.team_season_exclusions enable row level security;
drop policy if exists "public_read" on f1.team_season_exclusions;
create policy "public_read" on f1.team_season_exclusions for select to anon, authenticated using (true);
grant select on f1.team_season_exclusions to anon, authenticated;

drop materialized view if exists f1.team_pairing;
drop materialized view if exists f1.team_totals;
drop materialized view if exists f1.team_seasons;
drop materialized view if exists f1.team_champions;
drop materialized view if exists f1.team_wins;

create or replace view f1.v_team_race as
select tf.family_id, t.name as team_name, ro.id as round_id, ro.season_year, ro.number as round_number,
       ro.name as round_name, ro.date as round_date, s.type as session_type,
       r.driver_id, r.position, r.is_classified, r.grid, r.points,
       f1.result_started(r.detail, r.position, r.laps_completed, r.grid) as started
from f1.results r
join f1.sessions s on s.id = r.session_id and s.type in ('R', 'SR') and not s.is_cancelled
join f1.rounds ro on ro.id = s.round_id
join f1.teams t on t.id = r.team_id
join f1.team_families tf on tf.ref = t.ref and ro.season_year between tf.from_year and tf.to_year;

drop materialized view if exists f1.team_index;
create materialized view f1.team_index as
with race as (
  select tf.family_id, ro.id as round_id, ro.season_year, ro.number as round_number,
         r.driver_id, r.position, r.is_classified, r.detail, r.laps_completed, r.grid
  from f1.results r
  join f1.sessions s on s.id = r.session_id and s.type = 'R' and not s.is_cancelled
  join f1.rounds ro on ro.id = s.round_id
  join f1.teams t on t.id = r.team_id
  join f1.team_families tf on tf.ref = t.ref and ro.season_year between tf.from_year and tf.to_year
),
started as (
  select * from race where f1.result_started(detail, position, laps_completed, grid)
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

create materialized view f1.team_seasons as
with races as (
  select family_id, season_year,
         array_agg(distinct team_name order by team_name) as entries,
         count(distinct round_id) filter (where started and session_type = 'R') as grands_prix,
         count(distinct round_id) filter (where started and session_type = 'R' and is_classified and position = 1) as wins,
         count(distinct (round_id, position)) filter (where started and session_type = 'R' and is_classified and position <= 3) as podiums
  from f1.v_team_race group by family_id, season_year
),
season_len as (
  -- Гонок у сезоні (з результатами) — для «15 перемог із 16 гонок».
  select season_year, count(distinct round_id) as n from f1.v_team_race where session_type = 'R' group by season_year
),
standing as (
  select distinct on (tf.family_id, f.season_year)
         tf.family_id, f.season_year, f.position, f.points, f.eligible, f.excluded, f.decided
  from f1.v_team_final f
  join f1.teams t on t.id = f.team_id
  join f1.team_families tf on tf.ref = t.ref and f.season_year between tf.from_year and tf.to_year
  order by tf.family_id, f.season_year, f.eligible desc, f.position
)
select r.family_id as id, r.season_year::int as year, r.entries,
       r.grands_prix::int, r.wins::int, r.podiums::int,
       case when s.eligible and not s.excluded and o.family_id is null then s.position end::int as position,
       -- Очки — як є (бувають половинні: Red Bull 2021 — 585,5); float8, щоб JSON віддавав число.
       s.points::float8 as points,
       (coalesce(s.excluded, false) or o.family_id is not null) as excluded,
       coalesce(s.eligible and s.position = 1 and s.decided, false) as champion,
       -- Сезон ще триває (лишились етапи) — незалежно від того, чи Кубок уже вирішено.
       (r.season_year = cs.year and cs.team_points_left > 0) as in_progress,
       sl.n::int as season_races
from races r left join standing s on s.family_id = r.family_id and s.season_year = r.season_year
-- Виправлення джерела (curated/teams.json «exclusions», з джерелами): напр. Larrousse 1990.
left join f1.team_season_exclusions o on o.family_id = r.family_id and o.season_year = r.season_year
join season_len sl on sl.season_year = r.season_year
cross join f1.v_current_season cs
where r.grands_prix > 0 or s.family_id is not null;
create unique index if not exists team_seasons_pk on f1.team_seasons(id, year);
grant select on f1.team_seasons to anon, authenticated;

-- 2. Чемпіони світу серед пілотів команди.
drop materialized view if exists f1.team_champions;
create materialized view f1.team_champions as
with starts as (
  select v.season_year, v.driver_id, v.family_id, count(distinct v.round_id) as n, max(v.round_number) as last_round
  from f1.v_team_race v where v.started and v.session_type = 'R'
  group by v.season_year, v.driver_id, v.family_id
),
champion_team as (
  select distinct on (c.season_year) c.season_year, c.driver_id, s.family_id
  from f1.v_driver_champion c join starts s on s.season_year = c.season_year and s.driver_id = c.driver_id
  order by c.season_year, s.n desc, s.last_round desc
)
select ct.family_id as id, d.ref as driver, d.forename, d.surname,
       array_agg(ct.season_year::int order by ct.season_year) as years
from champion_team ct join f1.drivers d on d.id = ct.driver_id
group by ct.family_id, d.ref, d.forename, d.surname;
create unique index if not exists team_champions_pk on f1.team_champions(id, driver);
grant select on f1.team_champions to anon, authenticated;

-- 3. Усі перемоги команди по порядку (спільна машина 1950-х — одна перемога з кількома пілотами).
drop materialized view if exists f1.team_wins;
create materialized view f1.team_wins as
select v.family_id as id,
       (row_number() over (partition by v.family_id order by v.round_date, v.round_id))::int as n,
       v.season_year::int as year, v.round_number::int as round, v.round_name as name, v.round_date as date,
       jsonb_agg(jsonb_build_object('ref', d.ref, 'forename', d.forename, 'surname', d.surname) order by d.ref) as drivers
from f1.v_team_race v join f1.drivers d on d.id = v.driver_id
where v.started and v.session_type = 'R' and v.is_classified and v.position = 1
group by v.family_id, v.round_id, v.season_year, v.round_number, v.round_name, v.round_date;
create unique index if not exists team_wins_pk on f1.team_wins(id, n);
grant select on f1.team_wins to anon, authenticated;

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
       ra.poles::int, ra.one_twos::int,
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

create materialized view f1.team_pairing as
with cs as (select year from f1.v_current_season),
season as (
  select v.* from f1.v_team_race v, cs where v.season_year = cs.year
),
race as (select * from season where session_type = 'R' and started),
last_round as (select family_id, max(round_number) as n from race group by family_id),
drivers as (
  select r.family_id, r.driver_id, count(distinct r.round_id) as races, max(r.round_number) as last_n
  from race r group by r.family_id, r.driver_id
),
ranked as (
  select d.*, row_number() over (partition by d.family_id order by d.races desc, d.last_n desc, d.driver_id) as ord
  from drivers d
),
quali as (
  -- Місце в кваліфікації: найдальша частина (Q3 > Q2 > Q1), потім місце в ній; з командою (родиною) машини.
  select distinct on (ro.id, r.driver_id) ro.id as round_id, r.driver_id, tf.family_id,
         substr(s.type, 2)::int as part, r.position
  from f1.results r
  join f1.sessions s on s.id = r.session_id and s.type in ('Q1', 'Q2', 'Q3')
  join f1.rounds ro on ro.id = s.round_id
  join f1.teams t on t.id = r.team_id
  join f1.team_families tf on tf.ref = t.ref and ro.season_year between tf.from_year and tf.to_year, cs
  where ro.season_year = cs.year
  order by ro.id, r.driver_id, s.type desc
),
pair as (select * from ranked where ord <= 2)
select k.family_id as id, d.ref as driver, d.forename, d.surname, k.ord::int as ord, k.races::int as races,
       (select coalesce(sum(points), 0) from season s where s.family_id = k.family_id and s.driver_id = k.driver_id)::float8 as points,
       (k.last_n = lr.n) as in_last_race,
       coalesce((select count(*) from race a
                 join race b on b.round_id = a.round_id and b.family_id = a.family_id
                 join pair o on o.family_id = k.family_id and o.driver_id = b.driver_id and o.driver_id <> k.driver_id
                 where k.ord <= 2 and a.family_id = k.family_id and a.driver_id = k.driver_id
                   and coalesce(a.position, 999) < coalesce(b.position, 999)), 0)::int as race_ahead,
       coalesce((select count(*) from quali a
                 join quali b on b.round_id = a.round_id and b.family_id = a.family_id
                 join pair o on o.family_id = k.family_id and o.driver_id = b.driver_id and o.driver_id <> k.driver_id
                 where k.ord <= 2 and a.family_id = k.family_id and a.driver_id = k.driver_id
                   and (a.part > b.part or (a.part = b.part and a.position < b.position))), 0)::int as quali_ahead
from ranked k
join f1.drivers d on d.id = k.driver_id
join last_round lr on lr.family_id = k.family_id;
create unique index if not exists team_pairing_pk on f1.team_pairing(id, driver);
grant select on f1.team_pairing to anon, authenticated;
