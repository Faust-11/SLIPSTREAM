-- Список сезонів (фаза 3e, docs/plans/2026-11-12-phase3e-seasons-index.md). Один рядок на чемпіонат:
--   * гонок — етапи з результатами гонки; етапів — календар сезону без скасованих;
--   * чемпіон — перший у підсумковому заліку пілотів (виключених із заліку не враховуємо: 1997 — Вільньов);
--     у поточному сезоні це лідер, driver_decided — титул математично вирішено (f1.v_driver_champion);
--   * команди чемпіона — за які він стартував у сезоні, від більшої кількості гонок; перемоги — за гонками;
--   * Кубок конструкторів — з 1958: перший у заліку команд (родина), cup_decided — вирішено (f1.v_team_final).
drop materialized view if exists f1.season_index;
create materialized view f1.season_index as
with cs as (select * from f1.v_current_season),
races as (
  select ro.season_year, count(distinct ro.id) as races
  from f1.rounds ro
  join f1.sessions s on s.round_id = ro.id and s.type = 'R' and not s.is_cancelled
  where exists (select 1 from f1.results r where r.session_id = s.id)
  group by ro.season_year
),
calendar as (
  select season_year, count(*) as rounds from f1.rounds where number is not null and not is_cancelled group by season_year
),
leader as (
  select distinct on (f.season_year) f.season_year, f.driver_id, f.points
  from f1.v_driver_final f
  where f.position = 1 and f.eligible and not f.excluded
  order by f.season_year, f.points desc, f.driver_id
),
dteams as (
  select driver_id, season_year,
         jsonb_agg(jsonb_build_object('id', family_id, 'races', n) order by n desc, last_round desc) as teams,
         sum(wins)::int as wins
  from (select driver_id, season_year, family_id, count(*)::int as n, max(round_number) as last_round,
               (count(*) filter (where position = 1))::int as wins
        from f1.v_driver_round group by driver_id, season_year, family_id) x
  group by driver_id, season_year
),
cup as (
  select distinct on (f.season_year) f.season_year, tf.family_id, f.decided
  from f1.v_team_final f
  join f1.teams t on t.id = f.team_id
  join f1.team_families tf on tf.ref = t.ref and f.season_year between tf.from_year and tf.to_year
  where f.position = 1 and f.eligible and not f.excluded and f.season_year >= 1958
  order by f.season_year, f.points desc, tf.family_id
)
select r.season_year::int as year, r.races::int as races, greatest(c.rounds, r.races)::int as rounds,
       (r.season_year = cs.year and cs.driver_points_left > 0) as in_progress,
       d.ref as driver, d.forename, d.surname, l.points::float8 as points,
       exists (select 1 from f1.v_driver_champion ch
               where ch.season_year = r.season_year and ch.driver_id = l.driver_id) as driver_decided,
       coalesce(dt.teams, '[]'::jsonb) as teams, coalesce(dt.wins, 0)::int as wins,
       cup.family_id as cup_team, coalesce(cup.decided, false) as cup_decided
from races r
cross join cs
left join calendar c on c.season_year = r.season_year
left join leader l on l.season_year = r.season_year
left join f1.drivers d on d.id = l.driver_id
left join dteams dt on dt.driver_id = l.driver_id and dt.season_year = r.season_year
left join cup on cup.season_year = r.season_year;
create unique index if not exists season_index_pk on f1.season_index(year);
grant select on f1.season_index to anon, authenticated;

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
  refresh materialized view f1.season_index;
$$;
revoke all on function f1.refresh_derived() from public, anon, authenticated;
