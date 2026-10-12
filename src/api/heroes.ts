import { DEMO_MODE } from './client'
import type { HeroInfo } from './types'
import { DEMO_HEROES } from './mock'

const CACHE_KEY = 'stratz.heroes.v2'
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000

let heroesPromise: Promise<Map<number, HeroInfo>> | null = null

function loadCache(): Map<number, HeroInfo> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { ts, heroes } = JSON.parse(raw) as { ts: number; heroes: HeroInfo[] }
    if (Date.now() - ts > CACHE_TTL_MS) return null
    if (!Array.isArray(heroes) || heroes.length === 0) return null
    return new Map(heroes.map((h) => [h.id, h]))
  } catch {
    return null
  }
}

function saveCache(heroes: HeroInfo[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), heroes }))
  } catch {
    /* приватный режим — не кэшируем */
  }
}

/** Возвращает map heroId → heroInfo. В демо-режиме — статичный список. */
export function getHeroMap(): Promise<Map<number, HeroInfo>> {
  if (heroesPromise) return heroesPromise
  heroesPromise = (async () => {
    const cached = loadCache()
    if (cached) return cached
    if (DEMO_MODE) {
      return new Map(DEMO_HEROES.map((h) => [h.id, h]))
    }
    try {
      const raw = await fetch('/api/constants/heroes').then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ id: number; shortName: string; displayName?: string }[]>
      })
      const heroes: HeroInfo[] = raw.map((h) => ({ id: h.id, shortName: h.shortName, name: h.displayName || h.shortName }))
      if (heroes.length) {
        saveCache(heroes)
        return new Map(heroes.map((h) => [h.id, h]))
      }
      throw new Error('пустой список героев')
    } catch {
      // API недоступен — отдаём статичный список, чтобы таблицы не ломались
      return new Map(DEMO_HEROES.map((h) => [h.id, h]))
    }
  })()
  return heroesPromise
}

export function heroImageUrl(shortName: string): string {
  return `https://cdn.steamstatic.com/apps/dota2/images/dota_react/heroes/${shortName}.png`
}

export function avatarImageUrl(avatar: string | null | undefined): string {
  if (avatar) return avatar
  return 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'
}
