// Общее окружение фронтенда.
// Данные идут только через СОБСТВЕННЫЙ API (см. src/api/index.ts → /api/*,
// сервер server/index.mjs); STRATZ GraphQL больше не используется.

/** Режим демо-данных (VITE_DEMO=1): работает вообще без ключа. */
export const DEMO_MODE = import.meta.env.VITE_DEMO === '1'
