// JS-чанки Next: локально `/_next/static/chunks/…`, на Vercel — `/_next/static/immutable/chunks/…?dpl=…`
// (замір 12.11 на продакшні). Старий шаблон без `immutable/` на Vercel нічого не блокував: тести «до гідратації»
// перевіряли гідратовану сторінку (один падав, другий проходив упусту).
export const NEXT_CHUNKS = /\/_next\/static\/(immutable\/)?chunks\/.+\.js(\?.*)?$/;
