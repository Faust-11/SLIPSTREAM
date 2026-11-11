# Знімки даних (до фази 2)

Поки бази `f1` немає, довідник читає знімки з репозиторію через типізований шар `src/lib/data/*.ts`. У фазі 2 реалізацію шару замінимо запитами до Supabase; сигнатури не змінюються.

| Знімок | Скрипт | Стан на | Вміст |
|---|---|---|---|
| `src/data/snapshot/teams.json` | `python3 -I scripts/snapshot/teams.py ~/Desktop/F1/data` | 08.11.2026 (після 20-го етапу) | 164 команди (92 КБ), 131 фото `public/img/cars` (480×300, 4,3 МБ), 22 аватари `public/img/drivers` (112×112, 156 КБ) |

- Джерело — локальні дані макетів (`index_mockup/index_data.json`, `teams_cards/data/*.json`, `avatars.json`, `driver_photos/`), тобто ті самі числа, що в затвердженому макеті. Звірка з Jolpica — `docs/audits/phase3a-data.md`.
- Фото — лише вільні ліцензії з Wikimedia Commons; автори й ліцензії — у знімку (`credit`, `avatarCredits`) і на сторінці.
- Оновлення: перезапустити скрипт → `npm run test` (інваріанти знімка) → закомітити JSON і фото.
