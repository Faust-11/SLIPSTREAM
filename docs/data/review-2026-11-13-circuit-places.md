# Місця етапів у календарі сезону — на перевірку (13.11.2026)

Файл: `src/data/curated/circuits.json` (78 трас, ключ — `f1.circuits.ref`). Місце — як його знають уболівальники: місто або,
якщо в Jolpica `locality` — регіон (Kent, Styria, New York State…), назва траси / містечка. Макет 2025 — «Мельбурн»,
«Сінгапур» (Marina Bay), «Монако» (Monte Carlo), «Мехіко», «Спа», «Шпільберг».

## Сумнівні написання — потрібне рішення

| ref | зараз (uk) | en | у Jolpica (locality) | варіанти / питання |
|---|---|---|---|---|
| buddh | Буддх | Buddh | Uttar Pradesh | «Буддх» (траса) чи «Великий Нойда» / «Грейтер-Нойда» (місто)? |
| yeongam | Йонам | Yeongam | Yeongam County | «Йонам» чи «Йонгам»? |
| kyalami | К'ялемі | Kyalami | Midrand | «К'ялемі» чи «Кьялемі»? |
| estoril | Ешторіл | Estoril | Estoril | «Ешторіл» (порт. вимова) чи «Есторил»? |
| jerez | Херес | Jerez | Jerez de la Frontera | «Херес» чи «Херес-де-ла-Фронтера»? |
| jarama | Харама | Jarama | Madrid | траса (Харама) чи місто (Мадрид)? |
| hockenheimring | Гоккенгайм | Hockenheim | Hockenheim | «Гоккенгайм» чи «Хоккенхайм»? |
| magny_cours | Маньї-Кур | Magny-Cours | Magny Cours | ок? |
| ricard | Ле-Кастелле | Le Castellet | Le Castellet | місто чи «Поль Рікар» (траса)? |
| mosport | Моспорт | Mosport | Ontario | ок? |
| george | Іст-Лондон | East London | Eastern Cape Province | ок? |
| tremblant | Мон-Тремблан | Mont-Tremblant | Quebec | ок? |
| okayama | Окаяма | Okayama | Okayama | траса TI Аїда; «Аїда»? |
| nurburgring | Нюрбургрінг | Nürburgring | Nürburg | траса, не село Нюрбург — ок? |
| montjuic, pedralbes, catalunya | Барселона | Barcelona | Barcelona | три траси — одне місто; лишити «Барселона»? |

Решта 63 — звичайні назви міст (Мельбурн, Монца, Сузука…), повний перелік — у JSON.

## Помилка даних Jolpica — на перевірку

| Сезон, етап | У даних | Як показано | Питання |
|---|---|---|---|
| 1952, 8 (Італія) | grid = 1 у двох різних машин: Аскарі (№12) і Мосс (№32) | «Поул: Аскарі, Мосс» | За Вікіпедією поул — Аскарі. Виправити кураторським записом із джерелом (як виключення Larrousse 1990) чи лишити як у Jolpica? |

