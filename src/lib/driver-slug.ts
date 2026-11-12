/**
 * Адреса сторінки пілота з id бази (Jolpica ref): нижній регістр, «_» → «-» (`max_verstappen` → `max-verstappen`,
 * `Cannoc` → `cannoc`). Замір 12.11: 793 id → 793 унікальні slug (тест тримає інваріант на фікстурі).
 * Окремий модуль без `server-only`: потрібен і клієнтській таблиці пілотів.
 */
export function driverSlug(id: string): string {
  return id.toLowerCase().replace(/_/g, "-");
}

export function driverPath(id: string): string {
  return `/drivers/${driverSlug(id)}`;
}
