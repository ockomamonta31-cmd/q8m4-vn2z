// Профиль героя — средние значения по НАШЕЙ базе матчей (server/data/constants/
// hero_profile.json, собирается scripts/build-hero-profile.mjs). Никаких
// чужих винрейтов: только статы Valve из матчей, которые мы сами вытащили и
// храним у себя.
//
// Герой сравнивается не с другими героями вообще, а со средним по своей роли —
// иначе саппорт всегда окажется «слабым керри». Индекс 1.0 = делает свою работу
// ровно как средний герой на этой роли.

import type { MatchPlayer } from './types'
import { inferRoles } from './roleModel'

export type MetricRow = {
  games: number
  wins: number
  winRate: number
  /** нижняя граница Уилсона — чтобы 2/2 не читалось как 100% */
  floor: number
} & Record<string, number>

/** Контроль и урон спелов на 10-й минуте: уровни умений измерены по нашим матчам. */
export type LaneSpell = { name: string; title: string; level: number; control: number }
export type LaneKit = { control: number; burst: number; spells?: LaneSpell[] }

export type Profile = {
  v: number
  generated: string
  source: string
  metrics: string[]
  meta: { matches: number; players: number; heroes: number; minMatchSeconds: number; minPairGames: number; avgDurationSeconds: number }
  /** контроль и урон спелов на уровнях умений, которые реально есть к 10-й минуте */
  lane?: Record<string, LaneKit>
  /** среднее тех же чисел по роли — знаменатель для сравнения */
  laneBaseline?: Record<string, { control: number; burst: number }>
  /** бэктест этой же модели по нашей базе: предсказание против факта */
  backtest?: {
    matches: number
    lanes: number
    /** сколько линий вообще имеют разобранные первые 10 минут */
    lanesMeasured: number
    matchAccuracy: number
    laneAccuracy: number
    calibration: { lo: number; hi: number; games: number; won: number }[]
    laneBuckets?: { lo: number; hi: number; games: number; won: number }[]
  }
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

/**
 * Роль: настоящая (разбор реплея или STRATZ) — иначе наша оценка по экономике
 * матча. Модель обучена на матчах с известными позициями и угадывает роль в
 * 57% случаев против 45% у простого порядка по нетворсу — в катке, где саппорт
 * отъелся, а оффлейнер слит, порядок фарма ставит линию не туда.
 */
export function roleOf(player: MatchPlayer, team: MatchPlayer[], durationSeconds = 0): number {
  if (player.position >= 1 && player.position <= 5) return player.position
  const guessed = inferRoles(team, durationSeconds)?.get(player)?.position
  if (guessed) return guessed
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

/** Роль, на которой герой играет чаще всего, — запасной знаменатель. */
function mainPosition(profile: Profile, heroId: number): number {
  const roles = profile.hero[String(heroId)]?.roles ?? {}
  let best = 0
  let games = -1
  for (const [role, row] of Object.entries(roles)) if (row.games > games) { games = row.games; best = Number(role) }
  return best
}

/**
 * Линия длится первые ~10 минут, поэтому берём не максимум умений, а то, что
 * реально прокачано к 10-й минуте: уровни измерены по нашей базе по
 * ability_upgrades. «Стан 6 секунд» от ультима Бейна к линии отношения не
 * имеет — к 10-й минуте его обычно нет. Относим к среднему по той же роли.
 */
export function laneAxes(profile: Profile, heroId: number, role: number): Record<string, number> {
  const l = profile.lane?.[String(heroId)]
  const base = profile.laneBaseline?.[String(role)] ?? profile.laneBaseline?.[String(mainPosition(profile, heroId))]
  if (!l || !base) return {}
  const out: Record<string, number> = {}
  if (base.control > 0) out.control = Math.min(3, l.control / base.control)
  if (base.burst > 0) out.burst = Math.min(3, l.burst / base.burst)
  return out
}

/** Секунды контроля и урон спелов на 10-й минуте — их показываем в объяснении линии. */
export function laneKitOf(profile: Profile, heroId: number): LaneKit | null {
  return profile.lane?.[String(heroId)] ?? null
}

/** Индекс героя на роли: среднее по осям, где у нас есть его профиль. */
export function heroIndex(profile: Profile, heroId: number, role: number): HeroIndex | null {
  const row = profile.hero[String(heroId)]?.roles?.[String(role)]
  const base = profile.baseline[String(role)]
  if (!row || !base) return null
  const axes: Record<string, number> = { ...laneAxes(profile, heroId, role) }
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
 * Что герой выдал в КОНКРЕТНОМ матче, в тех же единицах, что и профиль:
 * 1.00 = отработал как средний по своей роли. Кумулятивные статы (урон,
 * лх, нетворс) пересчитаны на среднюю длительность базы — иначе катаболия
 * на 18 минуте выглядит как провал.
 */
const PER_MINUTE = new Set(['goldPerMinute', 'experiencePerMinute'])

export function realizedIndex(profile: Profile, player: MatchPlayer, role: number, durationSeconds: number) {
  const base = profile.baseline[String(role)]
  if (!base) return null
  const avg = profile.meta.avgDurationSeconds || 1
  const scale = Math.max(0.2, (durationSeconds || avg) / avg)
  const axes: Record<string, number> = {}
  for (const axis of AXES) {
    const parts: number[] = []
    for (const m of axis.metrics) {
      const expected = (base[m.field] ?? 0) * (PER_MINUTE.has(m.field) ? 1 : scale)
      const raw = Number((player as unknown as Record<string, unknown>)[m.field]) || 0
      const v = ratio(raw, expected, m.sign)
      if (v !== null) parts.push(v)
    }
    if (parts.length) axes[axis.key] = parts.reduce((a, b) => a + b, 0) / parts.length
  }
  const values = Object.values(axes)
  if (!values.length) return null
  return { axes, total: values.reduce((a, b) => a + b, 0) / values.length }
}

/**
 * Калибровка по нашей же базе: доля силы → как часто такая доля действительно
 * выигрывала. Берём ближайший бакет бэктеста; если бакета нет — честное
 * «не знаем», то есть линейная аппроксимация от 50%.
 */
export function calibrate(profile: Profile, share: number): { probability: number; games: number } {
  const buckets = profile.backtest?.calibration ?? []
  const exact = buckets.find((b) => share >= b.lo && share < b.hi)
  if (exact && exact.games >= 20) return { probability: exact.won, games: exact.games }
  const nearest = buckets
    .filter((b) => b.games >= 20)
    .sort((a, b) => Math.abs((a.lo + a.hi) / 2 - share) - Math.abs((b.lo + b.hi) / 2 - share))[0]
  if (nearest) return { probability: nearest.won, games: nearest.games }
  return { probability: 0.5 + (share - 0.5) * 2 * 0.5, games: 0 }
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
