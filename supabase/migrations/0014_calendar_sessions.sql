-- Календар поточного сезону (фаза 3i, docs/plans/2026-11-14-phase3i-calendar.md). f1.race_page (0012) має сесії лише
-- проведених гонок; календарю потрібен розклад і майбутніх етапів. Рядок на нескасований етап поточного сезону (найбільший
-- рік з нумерованими етапами); sessions — як у race_page: k — вид, n — номер, at — початок, real — справжній час
-- (не північ дати), той самий порядок (день, вид, час). Етапи, переможці, поули — з f1.season_rounds (0011).
drop materialized view if exists f1.calendar_sessions;
create materialized view f1.calendar_sessions as
with season as (
  select max(season_year) as year from f1.rounds where number is not null and not is_cancelled
),
rnd as (
  select ro.id, ro.season_year, ro.number
  from f1.rounds ro join season on ro.season_year = season.year
  where ro.number is not null and not ro.is_cancelled
)
select rnd.season_year::int as year, rnd.number::int as round,
       coalesce((
         select jsonb_agg(jsonb_build_object(
                  'k', s.type, 'n', s.number, 'at', s.starts_at,
                  'real', s.starts_at is not null and (s.starts_at at time zone 'UTC')::time <> '00:00')
                  order by (s.starts_at at time zone 'UTC')::date nulls last,
                           array_position(array['FP1', 'FP2', 'FP3', 'SQ1', 'SR', 'Q1', 'QB', 'QA', 'R'], s.type),
                           s.starts_at, s.number)
         from f1.sessions s
         where s.round_id = rnd.id and not s.is_cancelled and s.type in ('FP1', 'FP2', 'FP3', 'Q1', 'QB', 'QA', 'SQ1', 'SR', 'R')
       ), '[]'::jsonb) as sessions
from rnd;
create unique index if not exists calendar_sessions_pk on f1.calendar_sessions(year, round);
grant select on f1.calendar_sessions to anon, authenticated;

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
  refresh materialized view f1.season_rules;
  refresh materialized view f1.season_rounds;
  refresh materialized view f1.season_points;
  refresh materialized view f1.race_page;
  refresh materialized view f1.circuit_index;
  refresh materialized view f1.calendar_sessions;
$$;
revoke all on function f1.refresh_derived() from public, anon, authenticated;
