-- Похідні дані розділу «Команди» (фаза 2). Правила підрахунку — перевірені у фазі 3a
-- (docs/audits/phase3a-data.md):
--   * команда = родина конструкторів Jolpica (пари «шасі-двигун» злиті; склад — src/data/curated/teams.json,
--     таблиця f1.team_families, заповнює scripts/db/seed_curated.py);
--   * Гран-прі — гонки, де стартувала хоча б одна машина команди: без DNQ/DNPQ/DNS/зняття (за detail)
--     і без записів «grid 0 і 0 кіл» (аварія на тренуванні, виключення до старту);
--   * перемоги — за гонками, а не за заявками (спільна машина 1950-х — одна перемога);
--   * Кубки — 1-ше місце в остаточному Кубку конструкторів; поточного сезону — лише коли математично
--     вирішено (відрив лідера > максимум очок, що лишились: 25+18 за гонку, 8+7 за спринт);
--   * склад — пілоти останньої гонки поточного сезону, порядок — за заліком пілотів.

create table if not exists f1.team_families (
  ref        text primary key,   -- f1.teams.ref (Jolpica)
  family_id  text not null       -- id команди на сайті ("mclaren", "lotus-racing")
);
create index if not exists team_families_family_idx on f1.team_families(family_id);
alter table f1.team_families enable row level security;
drop policy if exists "public_read" on f1.team_families;
create policy "public_read" on f1.team_families for select to anon, authenticated using (true);
grant select on f1.team_families to anon, authenticated;

-- Чи почала машина гонку (правило фази 3a, scripts/snapshot/teams.py: NOSTART + «grid 0 і 0 кіл»).
-- Параметри з префіксом p_: «position» — зарезервоване слово, як ім'я параметра — синтаксична помилка.
create or replace function f1.result_started(p_detail text, p_position smallint, p_laps smallint, p_grid smallint)
returns boolean language sql immutable as $$
  select coalesce(p_detail, '') !~* '(did not (start|qualify|pre)|withdr|not classified.*dns|^dn[sq])'
     and (p_laps is not null or p_position is not null)
     and not (coalesce(p_grid, 0) = 0 and coalesce(p_laps, 0) = 0)
$$;

drop materialized view if exists f1.team_index;
create materialized view f1.team_index as
with race as (
  select tf.family_id, ro.id as round_id, ro.season_year, ro.number as round_number,
         r.driver_id, r.position, r.is_classified, r.detail, r.laps_completed, r.grid
  from f1.results r
  join f1.sessions s on s.id = r.session_id and s.type = 'R' and not s.is_cancelled
  join f1.rounds ro on ro.id = s.round_id
  join f1.teams t on t.id = r.team_id
  join f1.team_families tf on tf.ref = t.ref
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
  join f1.team_families tf on tf.ref = t.ref
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
  join f1.team_families tf on tf.ref = t.ref
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

-- Стан даних для сайту: поточний сезон і остання гонка з результатами (рядок «2026 · P1», «Пілоти 2026»).
drop materialized view if exists f1.site_meta;
create materialized view f1.site_meta as
select ro.season_year as current_season, ro.number as last_round, ro.date as last_race_date
from f1.rounds ro
where exists (
  select 1 from f1.sessions s join f1.results r on r.session_id = s.id
  where s.round_id = ro.id and s.type = 'R' and not s.is_cancelled
)
order by ro.season_year desc, ro.number desc
limit 1;
grant select on f1.site_meta to anon, authenticated;

-- Оновлення похідних даних — наприкінці кожного завантаження (load_dump.py, topup_api.py, seed_curated.py).
create or replace function f1.refresh_derived() returns void language sql as $$
  refresh materialized view f1.team_index;
  refresh materialized view f1.site_meta;
$$;
revoke all on function f1.refresh_derived() from public, anon, authenticated;
