// Фасад API — источник данных: СОБСТВЕННЫЙ сервер (server/index.mjs),
// который ходит напрямую в Valve (Steam Web API) и хранит матчи в своём
// хранилище на диске (server/data/matches/). Никаких сторонних парсеров.
//
// Эндпоинты (тот же origin, dev-сервер Vite монтирует middleware):
//   GET /api/health
//   GET /api/profile/:id
//   GET /api/player/:id/matches?take=&skip=
//   GET /api/player/:id/heroes?take=
//   GET /api/player/:id/peers
//   GET /api/matches/:id
//   GET /api/constants/heroes | /api/constants/items

import { DEMO_MODE } from './client'
import type { HeroStat, ItemInfo, MatchDetails, Peer, PlayerMatch, Profile } from './types'
import { ApiError } from './types'
import { demoHeroStats, demoMatches, demoPeers, demoProfile } from './mock'

// --- Клиент своего API ---

async function ownApi<T>(path: string): Promise<T> {
  let res: Response
  const signal = AbortSignal.timeout(20_000)
  try {
    res = await fetch(`/api${path}`, { signal })
  } catch (e) {
    throw new ApiError('network', signal.aborted ? 'Сервер долго не отвечает. Попробуй ещё раз.' : `Сервер недоступен: ${(e as Error).message}`)
  }
  let json: { error?: string } & Record<string, unknown> | null = null
  try {
    json = (await res.json()) as { error?: string } & Record<string, unknown>
  } catch {
    if (signal.aborted) throw new ApiError('network', 'Сервер долго не отвечает. Попробуй ещё раз.')
    throw new ApiError('http', `Свой API вернул HTTP ${res.status}`)
  }
  if (!res.ok || json?.error) {
    const msg = (json as { error?: string } | null)?.error ?? `HTTP ${res.status}`
    if (msg.includes('STEAM_WEB_API_KEY')) throw new ApiError('no_token', msg)
    throw new ApiError('http', msg)
  }
  return json as T
}

/** Проверка: настроен ли ключ Steam (для понятной панели ошибки). */
export async function apiHealth(): Promise<{ ok: boolean; steamKey: boolean }> {
  try {
    return await ownApi<{ ok: boolean; steamKey: boolean }>('/health')
  } catch {
    return { ok: false, steamKey: false }
  }
}

// --- Профиль ---

export async function fetchProfile(id: number): Promise<Profile> {
  if (DEMO_MODE) return demoProfile(id)
  return ownApi<Profile>(`/profile/${id}`)
}

// --- Список матчей ---

export async function fetchMatches(id: number, take: number, skip: number): Promise<PlayerMatch[]> {
  if (DEMO_MODE) return demoMatches(id, take, skip)
  return ownApi<PlayerMatch[]>(`/player/${id}/matches?take=${take}&skip=${skip}`)
}

/** Постраничная загрузка для вкладки «Активность». */
export async function fetchMatchesPages(id: number, total: number, pageSize = 50): Promise<PlayerMatch[]> {
  const all: PlayerMatch[] = []
  const pages = Math.ceil(total / pageSize)
  for (let i = 0; i < pages; i++) {
    const batch = await fetchMatches(id, pageSize, i * pageSize)
    all.push(...batch)
    if (batch.length < pageSize) break
  }
  return all
}

// --- Статистика по героям ---

export async function fetchHeroStats(id: number): Promise<{ stats: HeroStat[]; source: 'api' | 'matches' }> {
  if (DEMO_MODE) return { stats: demoHeroStats(id), source: 'api' }
  const stats = await ownApi<HeroStat[]>(`/player/${id}/heroes?take=100`)
  return { stats, source: 'api' }
}

// --- Пиры ---

export async function fetchPeers(id: number): Promise<Peer[]> {
  if (DEMO_MODE) return demoPeers(id)
  return ownApi<Peer[]>(`/player/${id}/peers`)
}

// --- Полный матч ---

export async function fetchMatch(id: number): Promise<MatchDetails> {
  if (DEMO_MODE) {
    const { demoMatch } = await import('./mock')
    return demoMatch(id)
  }
  const m = await ownApi<MatchDetails>(`/matches/${id}`)
  // Every match consumer gets the same observed team totals as history rows.
  // Otherwise portraits/build details silently estimate shares and disagree
  // with the assessment in Edik and the scoreboard.
  for(const p of m.players) {
    const team=m.players.filter(q=>q.isRadiant===p.isRadiant)
    p.teamKills=team.reduce((n,q)=>n+q.kills,0)
    p.teamDamage=team.reduce((n,q)=>n+q.heroDamage,0)
  }
  // IDs and names are enriched by our server's background rank runner.
  return m
}

// --- Справочник предметов ---

let itemsPromise: Promise<Map<number, ItemInfo>> | null = null

/** Карта предметов (свой сервер, статичный файл); при сбое — пустая карта. */
export function getItemMap(): Promise<Map<number, ItemInfo>> {
  if (itemsPromise) return itemsPromise
  itemsPromise = (async () => {
    // константы лежат на своём сервере статичными файлами — доступны и без ключа
    try {
      const rows = await ownApi<{ id: number; displayName: string; shortName: string }[]>('/constants/items')
      const map = new Map<number, ItemInfo>()
      for (const it of rows) {
        map.set(it.id, { id: it.id, name: it.displayName || it.shortName || `#${it.id}`, shortName: it.shortName || '' })
      }
      return map
    } catch {
      return new Map<number, ItemInfo>()
    }
  })()
  return itemsPromise
}

export function itemImageUrl(shortName: string): string {
  // Valve provides one shared scroll icon; individual recipe_* files do not exist.
  const imageName = shortName.startsWith('recipe_') ? 'recipe' : shortName
  return `https://cdn.steamstatic.com/apps/dota2/images/dota_react/items/${imageName}.png`
}
