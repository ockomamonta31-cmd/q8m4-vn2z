// Профиль героя — средние значения по НАШЕЙ базе матчей (server/data/constants/
// hero_profile.json, собирается scripts/build-hero-profile.mjs). Никаких
// чужих винрейтов: только статы Valve из матчей, которые мы сами вытащили и
// храним у себя.
//
// Герой сравнивается не с другими героями вообще, а со средним по своей роли —
// иначе саппорт всегда окажется «слабым керри». Индекс 1.0 = делает свою работу
// ровно как средний герой на этой роли.

import type { MatchPlayer } from './types'

export type MetricRow = {
  games: number
  wins: number
  winRate: number
  /** нижняя граница Уилсона — чтобы 2/2 не читалось как 100% */
  floor: number
} & Record<string, number>

export type Profile = {
  v: number
  generated: string
  source: string
  metrics: string[]
  meta: { matches: number; players: number; heroes: number; minMatchSeconds: number; minPairGames: number }
  hero: Record<string, { all: MetricRow; roles: Record<string, MetricRow> }>
  baseline: Record<string, MetricRow>
  pair: Record<string, { games: number; wins: number; winRate: number; floor: number }>
}

let promise: Promise<Profile | null> | null = null

export function getProfile(): Promise<Profile | null> {
  if (promise) return promise
  promise = import('../../server/data/constants/hero_profile.json')
    .then((m) => m.default as unknown as Profile)
    .catch(() => null)
  return promise
}

/** Оси, по которым сравниваем: метрики сгруппированы по смыслу, все — из матча. */
export const AXES: { key: string; label: string; detail: string; metrics: { field: string; sign: 1 | -1 }[] }[] = [
  { key: 'farm', label: 'Фарм', detail: 'золото, опыт, добивания за минуту', metrics: [{ field: 'goldPerMinute', sign: 1 }, { field: 'experiencePerMinute', sign: 1 }, { field: 'numLastHits', sign: 1 }] },
  { key: 'fight', label: 'Драка', detail: 'убийства и урон по героям, минус смерти', metrics: [{ field: 'kills', sign: 1 }, { field: 'heroDamage', sign: 1 }, { field: 'scaledHeroDamage', sign: 1 }, { field: 'deaths', sign: -1 }] },
  { key: 'push', label: 'Давление', detail: 'урон по башням и denies', metrics: [{ field: 'towerDamage', sign: 1 }, { field: 'numDenies', sign: 1 }] },
  { key: 'support', label: 'Поддержка', detail: 'ассисты и лечение', metrics: [{ field: 'assists', sign: 1 }, { field: 'heroHealing', sign: 1 }] },
  { key: 'tempo', label: 'Темп', detail: 'уровень и нетворс к концу', metrics: [{ field: 'level', sign: 1 }, { field: 'networth', sign: 1 }] },
]

/** Роль: известная из разбора, иначе — по порядку фарма в команде. */
export function roleOf(player: MatchPlayer, team: MatchPlayer[]): number {
  if (player.position >= 1 && player.position <= 5) return player.position
  const order = [...team].sort((a, b) => b.networth - a.networth || b.goldPerMinute - a.goldPerMinute)
  return order.indexOf(player) + 1
}

export type HeroIndex = {
  role: number
  games: number
  floor: number
  /** по осям: 1 = средний по роли */
  axes: Record<string, number>
  total: number
  missing: string[]
}

const ratio = (value: number, base: number, sign: 1 | -1) => {
  if (!base || !Number.isFinite(base)) return null
  const r = value / base
  if (sign === -1) return base > 0 ? 2 - Math.min(3, r) : null
  return Math.min(3, r)
}

/** Индекс героя на роли: среднее по осям, где у нас есть его профиль. */
export function heroIndex(profile: Profile, heroId: number, role: number): HeroIndex | null {
  const row = profile.hero[String(heroId)]?.roles?.[String(role)]
  const base = profile.baseline[String(role)]
  if (!row || !base) return null
  const axes: Record<string, number> = {}
  const missing: string[] = []
  for (const axis of AXES) {
    const parts: number[] = []
    for (const m of axis.metrics) {
      const v = ratio(row[m.field] ?? 0, base[m.field] ?? 0, m.sign)
      if (v !== null) parts.push(v)
    }
    if (!parts.length) { missing.push(axis.key); continue }
    axes[axis.key] = parts.reduce((a, b) => a + b, 0) / parts.length
  }
  const values = Object.values(axes)
  if (!values.length) return null
  return { role, games: row.games, floor: row.floor, axes, total: values.reduce((a, b) => a + b, 0) / values.length, missing }
}

/**
 * Синергия пары по нашей же базе: насколько пара выигрывает чаще, чем
 * ожидается от её же героев поодиночке. Ожидание — среднее двух индивидуальных
 * винрейтов: каждый из них и есть «как часто выигрывает команда с этим
 * героем», поэтому складывать их как вероятности нельзя.
 */
export function pairSynergy(profile: Profile, a: number, b: number, soloA: number, soloB: number) {
  const key = `${Math.min(a, b)}:${Math.max(a, b)}`
  const row = profile.pair[key]
  if (!row) return null
  const expected = (soloA + soloB) / 2
  if (!Number.isFinite(expected) || expected <= 0) return null
  return { games: row.games, lift: row.floor - expected, winRate: row.winRate }
}
