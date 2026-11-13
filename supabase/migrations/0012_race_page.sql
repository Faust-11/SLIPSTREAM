-- Сторінка гонки (фаза 3g, docs/plans/2026-11-13-phase3g-race-page.md). Один рядок на гонку (етап з результатами
-- гонки): 740 тис. кіл не віддаємо по рядку — сайт читає ~1 170 рядків одним запитом на збірку.
-- Ключі jsonb короткі (розмір фікстури): d — пілот (ref), t — команда (родина), c — номер машини, p — класифіковане
-- місце (null — не класифікований), o — порядок у протоколі, g — старт, l — кола, ms — час, s — статус (0001),
-- x — текст статусу Jolpica, pts — очки, fl — місце за найшвидшим колом, fms — найшвидше коло пілота (мс), ps — піт-стопів.
-- Ключі зі значенням null не зберігаємо (jsonb_strip_nulls): відсутній ключ = null.
-- Заміри покриття (дамп 3154f289f6e8): кваліфікація — 1994+ (QB до 2005, Q1–Q3 з 2006), кола — 1994+, піт-стопи — 2011+,
-- тренування — 2025+, справжній час сесій — з 2022 (гонки — з 2005).
drop materialized view if exists f1.race_page;
create materialized view f1.race_page as
with rnd as (
  select ro.id, ro.season_year, ro.number
  from f1.rounds ro
  where ro.number is not null and not ro.is_cancelled
    and exists (select 1 from f1.sessions s join f1.results r on r.session_id = s.id where s.round_id = ro.id and s.type = 'R')
),
res as (
  select r.*, s.round_id, s.type, d.ref as dref, tf.family_id as fam,
         (select l.time_ms from f1.laps l where l.result_id = r.id and l.is_fastest order by l.time_ms limit 1) as best_ms
  from f1.results r
  join f1.sessions s on s.id = r.session_id and not s.is_cancelled
  join rnd on rnd.id = s.round_id
  join f1.drivers d on d.id = r.driver_id
  join f1.teams t on t.id = r.team_id
  join f1.team_families tf on tf.ref = t.ref and rnd.season_year between tf.from_year and tf.to_year
),
classif as (
  -- Протокол гонки чи спринту: класифіковані за місцем, далі за пройденими колами.
  select round_id, type,
         jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     -- Дискваліфікований (status 20) — без місця, хоч Jolpica й дає позицію (рев'ю 13.11: 2023/18 Гамілтон «P19»).
                     'p', case when coalesce(is_classified, true) and coalesce(status, 0) <> 20 then position end, 'o', position,
                     'd', dref, 't', fam, 'c', car_number, 'g', grid, 'l', laps_completed, 'ms', time_ms,
                     's', status, 'x', detail, 'pts', points::float8, 'fl', fastest_lap_rank,
                     'fms', case when fastest_lap_rank = 1 then best_ms end,
                     'ps', (select nullif(count(*), 0) from f1.pit_stops ps where ps.result_id = res.id)))
                   order by position nulls last, laps_completed desc nulls last, id) as rows
  from res where type in ('R', 'SR')
  group by round_id, type
),
quali as (
  -- Кваліфікація: підсумкове місце. Jolpica зберігає місце В КОЖНІЙ частині (Q1/Q2/Q3); при дискваліфікації чи
  -- пониженні місце в Q1 уже підсумкове, а в пізніших частинах лишається старе (замір 13.11 на дампі: Албон, Зандворт
  -- 2024 — Q1 19, Q3 «10»; Гюлькенберг і Магнуссен, Монако 2024 — Q1 20/19, Q2 «14/15»; Алонсо там — Q1 14 після їх
  -- виключення). Правило: місце з Q1, якщо пілот далі не пройшов або його місце в Q1 поза числом учасників Q2; так само
  -- Q2 щодо Q3; інакше Q3. Наприкінці — row_number (місця 1..N без дублів; без часу — в кінці). QB/QA (1994–2005) —
  -- одна сесія. Спринт-кваліфікація SQ1–SQ3 — так само, окремим полем. Рев'ю 13.11: було coalesce(Q3, Q2, Q1) → дублі
  -- місць у 6 етапах (2023/10, 2024/8, 2024/15, 2024/17, 2025/7, 2026/20).
  select round_id, sprint,
         jsonb_agg(jsonb_strip_nulls(jsonb_build_object('p', fin, 'd', dref, 't', fam, 'q1', q1, 'q2', q2, 'q3', q3))
                   order by fin) as rows
  from (
    select x.*, row_number() over (partition by round_id, sprint
                                   order by pos nulls last, coalesce(q3, q2, q1) nulls last, dref) as fin
    from (
      select y.*,
             case when p2 is null or p1 > n2 then p1
                  when p3 is null or p2 > n3 then p2
                  else p3 end as pos
      from (
        select z.*, count(p2) over w as n2, count(p3) over w as n3
        from (
          select round_id, dref, fam, left(type, 1) = 'S' as sprint,
                 min(position) filter (where type in ('Q1', 'SQ1', 'QB', 'QA')) as p1,
                 min(position) filter (where type in ('Q2', 'SQ2')) as p2,
                 min(position) filter (where type in ('Q3', 'SQ3')) as p3,
                 -- Час: найкраще коло (дамп), інакше результат сесії — доливка з API (topup_api.insert_qualifying) кіл
                 -- не пише, час лише в results.time_ms (рев'ю 13.11: 2026/19–20 були без часів кваліфікації).
                 min(coalesce(best_ms, time_ms)) filter (where type in ('Q1', 'SQ1', 'QB', 'QA')) as q1,
                 min(coalesce(best_ms, time_ms)) filter (where type in ('Q2', 'SQ2')) as q2,
                 min(coalesce(best_ms, time_ms)) filter (where type in ('Q3', 'SQ3')) as q3
          from res where type in ('Q1', 'Q2', 'Q3', 'QB', 'QA', 'SQ1', 'SQ2', 'SQ3')
          group by round_id, dref, fam, left(type, 1) = 'S'
        ) z
        window w as (partition by round_id, sprint)
      ) y
    ) x
  ) q
  group by round_id, sprint
),
sbest as (
  -- Найкращий у сесії (місце 1) — один прохід замість підзапиту на кожну сесію (рев'ю 13.11: продуктивність refresh).
  select distinct on (session_id) session_id, jsonb_build_object('d', dref, 'ms', coalesce(best_ms, time_ms)) as best
  from res where position = 1
  order by session_id, id
),
sess as (
  -- Сесії вікенду: час (real — справжній, а не північ дати, в UTC явно), найкращий (тренування — за колом).
  -- Порядок: день, потім вид сесії (без справжнього часу сортування за часом ставило кваліфікацію перед FP3 —
  -- рев'ю 13.11), потім час. Кваліфікація — одна сесія на вид (QB 1994–1995 — дві за вікенд; QA 2005).
  select s.round_id,
         jsonb_agg(jsonb_build_object(
           'k', s.type, 'n', s.number, 'at', s.starts_at,
           'real', s.starts_at is not null and (s.starts_at at time zone 'UTC')::time <> '00:00',
           'best', sb.best)
           order by (s.starts_at at time zone 'UTC')::date nulls last,
                    array_position(array['FP1', 'FP2', 'FP3', 'SQ1', 'SR', 'Q1', 'QB', 'QA', 'R'], s.type),
                    s.starts_at, s.number) as rows
  from f1.sessions s
  join rnd on rnd.id = s.round_id
  left join sbest sb on sb.session_id = s.id
  where not s.is_cancelled and s.type in ('FP1', 'FP2', 'FP3', 'Q1', 'QB', 'QA', 'SQ1', 'SR', 'R')
  group by s.round_id
),
chart as (
  -- Пілоти графіка «Коло за колом»: перша п'ятірка фінішу й усі, хто лідирував хоч одне коло (замір 13.11: позиції
  -- всіх пілотів на всіх колах — 1,75 МБ фікстури, графіку й текстам потрібні лише ці — 0,43 МБ).
  select r.id from res r where r.type = 'R' and coalesce(r.is_classified, true) and r.position <= 5
  union
  select r.id from res r where r.type = 'R' and exists (select 1 from f1.laps l where l.result_id = r.id and l.position = 1)
),
laps as (
  -- Позиції пілота по колах гонки (1994+): {"max_verstappen": [1, 1, …]}, кола від першого.
  select round_id, jsonb_object_agg(dref, pos) as rows
  from (
    select r.round_id, r.dref, jsonb_agg(l.position order by l.number) as pos
    from res r join chart c on c.id = r.id
    join f1.laps l on l.result_id = r.id and l.number is not null and l.number >= 1
    group by r.round_id, r.dref
  ) x
  group by round_id
),
stops as (
  -- Піт-стопи пілотів графіка (кількість для таблиці — поле ps протоколу).
  select r.round_id, jsonb_agg(jsonb_build_object('d', r.dref, 'lap', p.lap, 'n', p.number, 'ms', p.duration_ms) order by p.lap, r.dref) as rows
  from res r join chart c on c.id = r.id join f1.pit_stops p on p.result_id = r.id
  group by r.round_id
)
select rnd.season_year::int as year, rnd.number::int as round,
       coalesce(se.rows, '[]') as sessions,
       coalesce(rc.rows, '[]') as race,
       coalesce(sc.rows, '[]') as sprint,
       coalesce(q.rows, '[]') as quali,
       coalesce(sq.rows, '[]') as sprint_quali,
       coalesce(la.rows, '{}') as laps,
       coalesce(st.rows, '[]') as stops
from rnd
left join sess se on se.round_id = rnd.id
left join classif rc on rc.round_id = rnd.id and rc.type = 'R'
left join classif sc on sc.round_id = rnd.id and sc.type = 'SR'
left join quali q on q.round_id = rnd.id and not q.sprint
left join quali sq on sq.round_id = rnd.id and sq.sprint
left join laps la on la.round_id = rnd.id
left join stops st on st.round_id = rnd.id;
create unique index if not exists race_page_pk on f1.race_page(year, round);
grant select on f1.race_page to anon, authenticated;

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
$$;
revoke all on function f1.refresh_derived() from public, anon, authenticated;
