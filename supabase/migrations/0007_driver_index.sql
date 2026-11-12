-- Список пілотів (фаза 3c, docs/plans/2026-11-12-phase3c-drivers-index.md). Правила — як у командах:
--   * старти — гонки, де пілот стартував (f1.result_started); спільна машина 1950-х — старт кожному з пілотів;
--   * перемоги, подіуми — за гонками (у пілота одна машина на гонку; спільна — зараховується кожному);
--   * поули — старт з першого місця (grid = 1), як у командах (McLaren 181 = Вікіпедія);
--   * титули — f1.v_driver_champion (поточний сезон — лише коли математично вирішено);
--   * основна команда — команда (родина) з найбільшою кількістю стартів; рівність — пізніша;
--   * поточний сезон: місце й очки — останній залік пілотів сезону; команда й номер — з останньої гонки пілота.
-- Лише пілоти з хоча б одним стартом (як у макеті: «усі, хто хоч раз стартував у Гран-прі»).

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
       a.starts::int, a.wins::int, a.podiums::int, a.poles::int,
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

create or replace function f1.refresh_derived() returns void language sql as $$
  refresh materialized view f1.team_index;
  refresh materialized view f1.site_meta;
  refresh materialized view f1.team_seasons;
  refresh materialized view f1.team_champions;
  refresh materialized view f1.team_wins;
  refresh materialized view f1.team_totals;
  refresh materialized view f1.team_pairing;
  refresh materialized view f1.driver_index;
$$;
revoke all on function f1.refresh_derived() from public, anon, authenticated;
