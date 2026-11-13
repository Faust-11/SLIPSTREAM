-- Траси (фаза 3h, docs/plans/2026-11-13-phase3h-circuits.md). Сайт уже має гонки, переможців і поули (f1.season_rounds,
-- 0011) та протоколи (f1.race_page, 0012); бракує лише атрибутів самої траси: назва, місце, код країни (для назви країни
-- мовою сторінки, src/lib/countries.ts), координати. Траси — лише ті, де є хоч один нескасований етап із номером
-- (замір 13.11: 78 з 78 у дампі 3154f289f6e8). Решту (кількість гонок, лідери, титули тут) рахує сайт (src/lib/data/circuits.ts).
drop materialized view if exists f1.circuit_index;
create materialized view f1.circuit_index as
select c.ref, c.name, c.locality, c.country, c.country_code::text as country_code,
       c.latitude::float8 as lat, c.longitude::float8 as lng, c.wikipedia_en
from f1.circuits c
where exists (select 1 from f1.rounds ro where ro.circuit_id = c.id and ro.number is not null and not ro.is_cancelled);
create unique index if not exists circuit_index_pk on f1.circuit_index(ref);
grant select on f1.circuit_index to anon, authenticated;

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
$$;
revoke all on function f1.refresh_derived() from public, anon, authenticated;
