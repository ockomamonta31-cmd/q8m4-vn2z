// Роли по экономике матча — для игр, где позиций нет ни в разобранном реплее,
// ни у STRATZ (у старых матчей STRATZ отдаёт пустые lane/position).
//
// Модель обучена на НАШИХ матчах с известными позициями:
// scripts/build-role-model.mjs → server/data/constants/role_model.json.
// Признаки — только числа самого матча, нормированные внутри команды, плюс
// prior на роль самого героя («Инвокер почти не бывает пятёркой» — измерено
// по этой же базе). Точность лежит рядом в JSON и показывается в интерфейсе,
// чтобы оценка не выдавала себя за факт.

import raw from '../../server/data/constants/role_model.json'
import type { MatchPlayer } from './types'

export type RoleGuess = { position: number; lane: 'safelane' | 'mid' | 'offlane' }

const MODEL = raw as unknown as {
  features: string[]
  mean: number[]
  std: number[]
  W: number[][]
  b: number[]
  prior: Record<string, number[]>
  priorFallback: number[]
  usePrior: boolean
  accuracy: number
  laneAccuracy: number
  baselines: { farmOrder: number; farmOrderLane: number }
  samples: { train: number; test: number; teams: number }
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[(s.length - 1) >> 1] : 1
}

const laneOf = (position: number): RoleGuess['lane'] =>
  position === 2 ? 'mid' : position === 1 || position === 5 ? 'safelane' : 'offlane'

function featuresOf(p: MatchPlayer, team: MatchPlayer[], minutes: number): Record<string, number> {
  const med = (pick: (x: MatchPlayer) => number) => Math.max(1e-6, median(team.map(pick)))
  const lh = num(p.numLastHits)
  const dn = num(p.numDenies)
  return {
    lhPerMin: lh / minutes,
    dnPerMin: dn / minutes,
    gpmRatio: num(p.goldPerMinute) / med((t) => num(t.goldPerMinute)),
    xpmRatio: num(p.experiencePerMinute) / med((t) => num(t.experiencePerMinute)),
    nwRatio: num(p.networth) / med((t) => num(t.networth)),
    levelRatio: num(p.level) / med((t) => num(t.level)),
    towerPerMin: num(p.towerDamage) / minutes,
    healPerMin: num(p.heroHealing) / minutes,
    dmgPerMin: num(p.scaledHeroDamage) / minutes,
    killPerMin: num(p.kills) / minutes,
    deathPerMin: num(p.deaths) / minutes,
    assistPerMin: num(p.assists) / minutes,
    items: (p.items?.length ?? 0) + (p.backpack?.length ?? 0),
    aghanim: num(p.aghanimsScepter) > 0 ? 1 : 0,
    creepDenyShare: lh + dn > 0 ? dn / (lh + dn) : 0,
  }
}

function positionScores(p: MatchPlayer, team: MatchPlayer[], minutes: number): number[] {
  const f = featuresOf(p, team, minutes)
  const out = new Array(5).fill(0)
  for (let c = 0; c < 5; c++) {
    let s = MODEL.b[c]
    for (let i = 0; i < MODEL.features.length; i++) {
      const x = (f[MODEL.features[i]] ?? 0) - MODEL.mean[i]
      s += MODEL.W[c][i] * (x / (MODEL.std[i] || 1))
    }
    out[c] = s
  }
  return out
}

const cache = new WeakMap<MatchPlayer[], Map<MatchPlayer, RoleGuess>>()

/**
 * Пять ролей в команде — это перестановка 1..5, поэтому назначаем жадно:
 * берём лучшую пару «игрок → роль» и исключаем и игрока, и роль.
 */
export function inferRoles(team: MatchPlayer[], durationSeconds: number): Map<MatchPlayer, RoleGuess> | null {
  if (team.length !== 5 || !(durationSeconds > 0)) return null
  const cached = cache.get(team)
  if (cached) return cached

  const minutes = durationSeconds / 60
  const pairs: { p: MatchPlayer; c: number; v: number }[] = []
  for (const p of team) {
    const s = positionScores(p, team, minutes)
    const prior = MODEL.usePrior ? MODEL.prior[String(p.heroId)] ?? MODEL.priorFallback : MODEL.priorFallback.map(() => 0)
    for (let c = 0; c < 5; c++) pairs.push({ p, c, v: s[c] + prior[c] })
  }
  pairs.sort((a, b) => b.v - a.v)

  const out = new Map<MatchPlayer, RoleGuess>()
  const usedRole = new Set<number>()
  for (const pair of pairs) {
    if (out.has(pair.p) || usedRole.has(pair.c)) continue
    out.set(pair.p, { position: pair.c + 1, lane: laneOf(pair.c + 1) })
    usedRole.add(pair.c)
  }
  cache.set(team, out)
  return out
}

/** Честные цифры модели — их же показываем в подсказке к иконке роли. */
export const roleModelStats = {
  accuracy: MODEL.accuracy,
  laneAccuracy: MODEL.laneAccuracy,
  farmOrderAccuracy: MODEL.baselines.farmOrder,
  teams: MODEL.samples.teams,
}
