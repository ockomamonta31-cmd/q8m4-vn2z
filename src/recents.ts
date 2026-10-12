// Журнал поиска и сохранённая тема. Оба — localStorage в try/catch,
// чтобы приватный режим не ронял интерфейс.

export type RecentSearch = { id: number; name: string; kind: 'match' | 'player' }

const RECENTS_KEY = 'dota.recentSearches.v2'
const LEGACY_RECENTS_KEY = 'dota.recentProfiles.v1'
const THEME_KEY = 'matchlab.theme.v1'

function readRaw(): RecentSearch[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? 'null') as RecentSearch[] | null
    if (Array.isArray(stored)) return stored
    // журнал раньше хранил только профили — переносим, чтобы история не терялась
    const legacy = JSON.parse(localStorage.getItem(LEGACY_RECENTS_KEY) ?? '[]') as { id: number; name: string }[]
    return Array.isArray(legacy) ? legacy.map((x) => ({ ...x, kind: 'player' as const })) : []
  } catch {
    return []
  }
}

export function readRecentSearches(): RecentSearch[] {
  return readRaw().slice(0, 6)
}

export function addRecentSearch(id: number, name: string, kind: RecentSearch['kind']): RecentSearch[] {
  const next = [{ id, name, kind }, ...readRaw().filter((item) => !(item.id === id && item.kind === kind))].slice(0, 8)
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    /* приватный режим — список просто не сохранится */
  }
  return next.slice(0, 6)
}

export function readTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* ниже — системная подсказка */
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function writeTheme(theme: 'light' | 'dark') {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* тема и так применена к documentElement */
  }
}
