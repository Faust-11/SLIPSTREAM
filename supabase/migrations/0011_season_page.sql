-- Сторінка сезону (фаза 3f, docs/plans/2026-11-13-phase3f-season-page.md). Три подання; решту (вирішальний етап,
-- половина очок, тексти «Битви за титул») рахує сайт чистими функціями з тестами (src/lib/data/season-page.ts).

-- 1. Правило заліку пілотів сезону — з Jolpica (formula_one_championshipsystem: driver_best_results, driver_season_split;
--    у базі — лише назва системи, f1.seasons.championship_system). Перелік скопійовано з дампу 3154f289f6e8 (27.10.2026):
--    best = -1 — усі результати; > 0 — кращі N; split > 0 — сезон ділиться навпіл (кращі best у кожній половині;
--    best = -2 — кількість половини мінус 1). Замір 13.11: правило відтворює підсумкові очки всіх пілотів, крім 1955,
--    1956 (спільні машини), 1967 і 1977 (межа половин) — для них сайт виводить правило з даних або не робить висновків.
--    Нова система Jolpica без рядка тут — best і split = null (сайт так само виводить правило з даних); тест db.yml
--    вимагає правило для кожного сезону.
drop materialized view if exists f1.season_rules;
create materialized view f1.season_rules as
select s.year::int as year, r.best::int as driver_best_results, r.split::int as driver_season_split
from f1.seasons s
left join (values
  ('1950 - 1953 Championship', 4, 0),
  ('1954 - 1957 Championship', 5, 0),
  (E'1958, 1960, 1963-1965\tChampionship', 6, 0),
  ('1959, 1961, 1962, 1966 Championship', 5, 0),
  ('1967 - 1978 Championship', -2, 2),
  ('1979 Championship', 4, 3),
  ('1980 Championship', 5, 3),
  ('1981-1990 Championship', 11, 0),
  ('1991 - 2001 Championship', -1, 0),
  ('2002 - 2025 Championship', -1, 0),
  ('2026 - Present Championship', -1, 0)
) as r(name, best, split) on r.name = s.championship_system;
create unique index if not exists season_rules_pk on f1.season_rules(year);
grant select on f1.season_rules to anon, authenticated;

-- 2. Календар сезону: етап, дата, Гран-прі, траса, спринт; переможці гонки (спільна машина 1950-х — кілька),
--    поул (f1.v_pole, не залежить від старту), переможці спринту; очки переможця гонки (для «половини очок» на сайті);
--    дискваліфіковані в гонці (status 20). Скасовані етапи без номера — з round = null.
drop materialized view if exists f1.season_rounds;
create materialized view f1.season_rounds as
with race as (
  select s.round_id, s.id as session_id, s.type from f1.sessions s where s.type in ('R', 'SR') and not s.is_cancelled
),
win as (
  select ra.round_id, ra.type,
         jsonb_agg(jsonb_build_object('driver', d.ref, 'team', tf.family_id) order by r.id) as who,
         max(r.points)::float8 as points
  from race ra
  join f1.results r on r.session_id = ra.session_id and r.position = 1 and coalesce(r.is_classified, true)
  join f1.rounds ro on ro.id = ra.round_id
  join f1.drivers d on d.id = r.driver_id
  join f1.teams t on t.id = r.team_id
  join f1.team_families tf on tf.ref = t.ref and ro.season_year between tf.from_year and tf.to_year
  group by ra.round_id, ra.type
),
pole as (
  select p.round_id, jsonb_agg(jsonb_build_object('driver', d.ref, 'team', p.family_id) order by d.ref) as who
  from f1.v_pole p join f1.drivers d on d.id = p.driver_id
  group by p.round_id
),
dsq as (
  select ra.round_id, array_agg(distinct d.ref order by d.ref) as who
  from race ra
  join f1.results r on r.session_id = ra.session_id and r.status = 20
  join f1.drivers d on d.id = r.driver_id
  where ra.type = 'R'
  group by ra.round_id
)
select ro.season_year::int as year, ro.number::int as round, ro.name, ro.date, ro.is_cancelled as cancelled,
       c.ref as circuit, c.locality, c.country,
       exists (select 1 from race where race.round_id = ro.id and race.type = 'SR') as sprint,
       wr.who as winners, wr.points as winner_points, pole.who as poles, ws.who as sprint_winners,
       coalesce(dsq.who, '{}') as disqualified
from f1.rounds ro
left join f1.circuits c on c.id = ro.circuit_id
left join win wr on wr.round_id = ro.id and wr.type = 'R'
left join win ws on ws.round_id = ro.id and ws.type = 'SR'
left join pole on pole.round_id = ro.id
left join dsq on dsq.round_id = ro.id
where ro.number is not null or ro.is_cancelled;
create unique index if not exists season_rounds_pk on f1.season_rounds(year, round, name);
grant select on f1.season_rounds to anon, authenticated;

-- 3. Очки по етапах — для графіка «Битва за титул», смуги лідерів і вирішального етапу. Лише пілоти, що набрали очки
--    в сезоні (за гонками або в заліку): решта не впливає ні на графік, ні на те, чи можна ще наздогнати лідера.
--    race_points / sprint_points — нараховані на етапі (усі, до відкидання гірших результатів); place — місце в гонці
--    (класифікований); standing / standing_points — залік після етапу (остання сесія етапу: після гонки, а не спринту).
drop materialized view if exists f1.season_points;
create materialized view f1.season_points as
with per as (
  select ro.season_year, ro.number as round_number, r.driver_id,
         sum(r.points) filter (where s.type = 'R') as race_points,
         sum(r.points) filter (where s.type = 'SR') as sprint_points,
         min(r.position) filter (where s.type = 'R' and coalesce(r.is_classified, true)) as place
  from f1.results r
  join f1.sessions s on s.id = r.session_id and s.type in ('R', 'SR') and not s.is_cancelled
  join f1.rounds ro on ro.id = s.round_id
  where ro.number is not null
  group by ro.season_year, ro.number, r.driver_id
),
last_session as (
  select season_year, round_number, max(session_number) as session_number from f1.driver_standings group by 1, 2
),
st as (
  select ds.season_year, ds.round_number, ds.driver_id, ds.position, ds.points
  from f1.driver_standings ds join last_session l using (season_year, round_number, session_number)
),
scorers as (
  select season_year, driver_id from per group by 1, 2 having sum(coalesce(race_points, 0) + coalesce(sprint_points, 0)) > 0
  union
  select season_year, driver_id from st group by 1, 2 having max(points) > 0
)
select coalesce(per.season_year, st.season_year)::int as year, coalesce(per.round_number, st.round_number)::int as round,
       d.ref as driver,
       coalesce(per.race_points, 0)::float8 as race_points, coalesce(per.sprint_points, 0)::float8 as sprint_points,
       per.place::int as place, st.position::int as standing, st.points::float8 as standing_points
from per
full join st on st.season_year = per.season_year and st.round_number = per.round_number and st.driver_id = per.driver_id
join scorers sc on sc.season_year = coalesce(per.season_year, st.season_year) and sc.driver_id = coalesce(per.driver_id, st.driver_id)
join f1.drivers d on d.id = coalesce(per.driver_id, st.driver_id)
-- Порожні рядки (без очок, місця й ненульового заліку) нічого не додають ні графіку, ні розрахунку — не зберігаємо.
where coalesce(per.race_points, 0) + coalesce(per.sprint_points, 0) > 0 or per.place is not null or coalesce(st.points, 0) > 0;
create unique index if not exists season_points_pk on f1.season_points(year, round, driver);
grant select on f1.season_points to anon, authenticated;

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
$$;
revoke all on function f1.refresh_derived() from public, anon, authenticated;
