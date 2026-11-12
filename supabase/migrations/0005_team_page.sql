-- Похідні дані сторінки команди (фаза 3b, docs/plans/2026-11-12-phase3b-team-page.md).
-- Правила ті самі, що в f1.team_index (0002): команда = родина конструкторів (f1.team_families);
-- Гран-прі — лише зі стартом (f1.result_started); перемоги — за гонками; Кубок / титул поточного сезону —
-- лише коли математично вирішено.
-- Додатково:
--   * подіуми — фініші машин на 1–3 місці (обидві машини окремо; спільна машина 1950-х — один подіум, як у Вікіпедії:
--     Ferrari 861 рядків → 844 машини, замір 12.11);
--   * поули — гонки, де машина команди стартувала першою (grid = 1);
--   * дублі — гонки, де команда посіла 1-ше і 2-ге місця;
--   * титул пілота зараховується команді, за яку чемпіон того сезону стартував у найбільшій кількості гонок
--     (рівність — команда його останньої гонки сезону);
--   * місце сезону — найкраще серед записів родини в Кубку конструкторів (до 1958 Кубка не було — null);
--     виключена з заліку (is_eligible = false, напр. McLaren 2007) — excluded, без місця.
-- Службові подання v_* — не публічні (0004: select лише явно), публічні — матеріалізовані нижче.

create or replace view f1.v_team_race as
select tf.family_id, t.name as team_name, ro.id as round_id, ro.season_year, ro.number as round_number,
       ro.name as round_name, ro.date as round_date, s.type as session_type,
       r.driver_id, r.position, r.is_classified, r.grid, r.points,
       f1.result_started(r.detail, r.position, r.laps_completed, r.grid) as started
from f1.results r
join f1.sessions s on s.id = r.session_id and s.type in ('R', 'SR') and not s.is_cancelled
join f1.rounds ro on ro.id = s.round_id
join f1.teams t on t.id = r.team_id
join f1.team_families tf on tf.ref = t.ref;

-- Поточний сезон = сезон останньої гонки з результатами; скільки очок ще можна набрати (для «вирішено»).
create or replace view f1.v_current_season as
with cs as (select max(season_year) as year from f1.v_team_race where session_type = 'R'),
left_rounds as (
  select ro.id,
         exists (select 1 from f1.sessions sr where sr.round_id = ro.id and sr.type = 'SR' and not sr.is_cancelled) as has_sprint
  from f1.rounds ro, cs
  where ro.season_year = cs.year and ro.number is not null and not ro.is_cancelled
    and not exists (select 1 from f1.sessions s join f1.results r on r.session_id = s.id
                    where s.round_id = ro.id and s.type = 'R')
)
select cs.year,
       coalesce((select sum(43 + case when has_sprint then 15 else 0 end) from left_rounds), 0) as team_points_left,
       coalesce((select sum(26 + case when has_sprint then 8 else 0 end) from left_rounds), 0) as driver_points_left
from cs;

-- Остаточні заліки сезонів (останній етап, остання сесія) з ознакою «остаточний».
create or replace view f1.v_team_final as
with last as (
  select season_year, max(round_number * 100 + session_number) as k from f1.team_standings group by season_year
),
fin as (
  select ts.season_year, ts.team_id, ts.position, ts.points, coalesce(ts.is_eligible, true) as eligible
  from f1.team_standings ts join last on last.season_year = ts.season_year
   and ts.round_number * 100 + ts.session_number = last.k
),
lead as (
  select f.season_year, f.points - coalesce((select max(f2.points) from fin f2
                                              where f2.season_year = f.season_year and f2.position > 1), 0) as margin
  from fin f where f.position = 1
)
select fin.*, (fin.season_year < cs.year or l.margin > cs.team_points_left) as decided
from fin cross join f1.v_current_season cs left join lead l on l.season_year = fin.season_year;

create or replace view f1.v_driver_champion as
with last as (
  select season_year, max(round_number * 100 + session_number) as k from f1.driver_standings group by season_year
),
fin as (
  select ds.season_year, ds.driver_id, ds.position, ds.points
  from f1.driver_standings ds join last on last.season_year = ds.season_year
   and ds.round_number * 100 + ds.session_number = last.k
),
champ as (
  select f.season_year, f.driver_id,
         f.points - coalesce((select max(f2.points) from fin f2
                              where f2.season_year = f.season_year and f2.position > 1), 0) as margin
  from fin f where f.position = 1
)
select c.season_year, c.driver_id
from champ c cross join f1.v_current_season cs
where c.season_year < cs.year or c.margin > cs.driver_points_left;

-- 1. Сезони команди: заявки, Гран-прі, перемоги, подіуми, місце й очки в Кубку.
drop materialized view if exists f1.team_pairing;
drop materialized view if exists f1.team_totals;
drop materialized view if exists f1.team_seasons;
create materialized view f1.team_seasons as
with races as (
  select family_id, season_year,
         array_agg(distinct team_name order by team_name) as entries,
         count(distinct round_id) filter (where started and session_type = 'R') as grands_prix,
         count(distinct round_id) filter (where started and session_type = 'R' and is_classified and position = 1) as wins,
         count(distinct (round_id, position)) filter (where started and session_type = 'R' and is_classified and position <= 3) as podiums
  from f1.v_team_race group by family_id, season_year
),
standing as (
  select distinct on (tf.family_id, f.season_year)
         tf.family_id, f.season_year, f.position, f.points, f.eligible, f.decided
  from f1.v_team_final f
  join f1.teams t on t.id = f.team_id
  join f1.team_families tf on tf.ref = t.ref
  order by tf.family_id, f.season_year, f.eligible desc, f.position
)
select r.family_id as id, r.season_year::int as year, r.entries,
       r.grands_prix::int, r.wins::int, r.podiums::int,
       case when s.eligible then s.position end::int as position,
       round(s.points)::int as points,
       coalesce(not s.eligible, false) as excluded,
       coalesce(s.eligible and s.position = 1 and s.decided, false) as champion,
       coalesce(not s.decided, false) as in_progress
from races r left join standing s on s.family_id = r.family_id and s.season_year = r.season_year
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

-- 4. Підсумки команди.
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

-- 5. Пара пілотів поточного сезону (склад останньої гонки, як у team_index): очки, гонки, хто попереду.
create materialized view f1.team_pairing as
with cs as (select year from f1.v_current_season),
crew as (
  select ti.id as family_id, d.id as driver_id, d.ref, d.forename, d.surname, x.ord
  from f1.team_index ti
  cross join lateral jsonb_array_elements_text(ti.current_drivers) with ordinality as x(ref, ord)
  join f1.drivers d on d.ref = x.ref
),
season as (
  select v.* from f1.v_team_race v, cs where v.season_year = cs.year
),
race as (select * from season where session_type = 'R' and started),
quali as (
  -- Місце в кваліфікації: найдальша частина (Q3 > Q2 > Q1), потім місце в ній.
  select distinct on (ro.id, r.driver_id) ro.id as round_id, r.driver_id,
         substr(s.type, 2)::int as part, r.position
  from f1.results r
  join f1.sessions s on s.id = r.session_id and s.type in ('Q1', 'Q2', 'Q3')
  join f1.rounds ro on ro.id = s.round_id, cs
  where ro.season_year = cs.year
  order by ro.id, r.driver_id, s.type desc
)
select c.family_id as id, c.ref as driver, c.forename, c.surname, c.ord::int as ord,
       (select count(distinct round_id) from race r where r.family_id = c.family_id and r.driver_id = c.driver_id)::int as races,
       (select coalesce(round(sum(points)), 0) from season s where s.family_id = c.family_id and s.driver_id = c.driver_id)::int as points,
       (select count(*) from race a join race b on b.round_id = a.round_id and b.family_id = a.family_id
         join crew c2 on c2.family_id = c.family_id and c2.driver_id = b.driver_id and c2.driver_id <> c.driver_id
        where a.family_id = c.family_id and a.driver_id = c.driver_id
          and coalesce(a.position, 999) < coalesce(b.position, 999))::int as race_ahead,
       (select count(*) from quali a join quali b on b.round_id = a.round_id
         join crew c2 on c2.family_id = c.family_id and c2.driver_id = b.driver_id and c2.driver_id <> c.driver_id
        where a.driver_id = c.driver_id
          and (a.part > b.part or (a.part = b.part and a.position < b.position)))::int as quali_ahead
from crew c;
create unique index if not exists team_pairing_pk on f1.team_pairing(id, driver);
grant select on f1.team_pairing to anon, authenticated;

-- Оновлення: залежні подання — після тих, від яких залежать.
create or replace function f1.refresh_derived() returns void language sql as $$
  refresh materialized view f1.team_index;
  refresh materialized view f1.site_meta;
  refresh materialized view f1.team_seasons;
  refresh materialized view f1.team_champions;
  refresh materialized view f1.team_wins;
  refresh materialized view f1.team_totals;
  refresh materialized view f1.team_pairing;
$$;
revoke all on function f1.refresh_derived() from public, anon, authenticated;
