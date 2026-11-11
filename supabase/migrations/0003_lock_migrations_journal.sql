-- Журнал міграцій — службова таблиця, публічно не читається.
-- Його створює scripts/db/apply_migrations.py ДО 0001, тому цикл 0001 («усім таблицям f1 — select і політика
-- public_read») зачепив і його: на бою 11.11 anon/authenticated читали f1.schema_migrations (rls_smoke.py, data-sync).
revoke all on f1.schema_migrations from anon, authenticated;
drop policy if exists "public_read" on f1.schema_migrations;
