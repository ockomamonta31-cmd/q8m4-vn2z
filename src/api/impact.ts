// «Честная» модель импакта (обучена scripts/train-impact.mjs на реальных
// исходах матчей, НЕ на IMP STRATZ).
//
// Принцип: импакт игрока = насколько ЕГО статистика сдвигает шанс победы
// команды относительно ТИПИЧЕСКОГО игрока ЕГО же ранга и позиции.
// Подробности и валидация (AUC, корреляция с их IMP, синтетика) — в скрипте.
//
// Использование:
// - со страницы матча (полный контекст 10 игроков, rich-признаки);
// - со списка матчей (один игрок, контекст команды импутируется baseline'ом
//   его ранга, base-признаки).

import type { MatchDetails, MatchPlayer, PlayerMatch } from './types'
import impactModelJson from './impact-model.json'

interface WinModel {
  kind: 'ridge' | 'mlp'
  mean: number[]
  std: number[]
  /** температура калибровки: P = sigmoid(logit / T) */
  T?: number
  beta?: number[]
  dim?: number
  H?: number
  W1?: number[][]
  b1?: number[]
  W2?: number[]
  b2?: number
}

export interface ImpactLevel {
  name: string
  features: string[]
  win: WinModel
  baselines: Record<string, number[]>
  posMean: Record<string, number[]>
  rankBuckets: Record<string, number[]>
  scale: number
  metrics: {
    auc: number
    corrWithStratzImp: number
    winAvgImpact: number
    lossAvgImpact: number
  }
}

interface ImpactModelFile {
  version: number
  kind: string
  trainedAt: string
  matches: number
  players: number
  base: ImpactLevel
  rich: ImpactLevel
  placeholder?: boolean
}

const model = impactModelJson as ImpactModelFile

export const IMPACT_MODEL_READY =
  !model.placeholder && typeof model.matches === 'number' && model.matches > 0

export function impactModelInfo(): {
  matches: number
  players: number
  auc: number
  corr: number
  trainedAt: string
} | null {
  if (!IMPACT_MODEL_READY) return null
  return {
    matches: model.matches,
    players: model.players,
    auc: model.base.metrics.auc,
    corr: model.base.metrics.corrWithStratzImp,
    trainedAt: model.trainedAt,
  }
}

function winProb(level: ImpactLevel, diff: number[]): number {
  const w = level.win
  const z = diff.map((v, j) => (v - (w.mean[j] ?? 0)) / (w.std[j] || 1))
  let out: number
  if (w.kind === 'mlp' && w.W1 && w.W2 && w.b1 && typeof w.b2 === 'number' && w.dim && w.H) {
    let acc2 = w.b2
    for (let j = 0; j < w.H; j++) {
      let acc = w.b1[j]
      for (let k = 0; k < w.dim; k++) acc += z[k] * w.W1[k][j]
      acc2 += Math.tanh(acc) * w.W2[j]
    }
    out = acc2
  } else if (w.beta) {
    const beta = w.beta
    out = [1, ...z].reduce((s, v, j) => s + v * beta[j], 0)
  } else {
    return 0.5
  }
  // Калибровка температуры — как в scripts/train-impact.mjs (T ≥ 1, только сглаживание)
  const T = w.T && w.T > 0 ? w.T : 1
  const p = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, out / T))))
  return p
}

function nearestBucket(level: ImpactLevel, target: number): string | null {
  const keys = Object.keys(level.rankBuckets).map(Number)
  if (!keys.length) return null
  const best = keys.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
  return String(best)
}

function baselineFor(level: ImpactLevel, pos: number, seasonRank: number): number[] {
  const bucket = Math.max(10, Math.min(80, Math.round((seasonRank || 45) / 10) * 10))
  const key = `${pos}:${bucket}`
  if (pos >= 1 && pos <= 5 && level.baselines[key]) return level.baselines[key]
  if (level.rankBuckets[String(bucket)]) return level.rankBuckets[String(bucket)]
  const near = nearestBucket(level, bucket)
  return (near ? level.rankBuckets[near] : null) ?? level.posMean[String(pos)] ?? []
}

function lobbyBaseline(level: ImpactLevel, actualRank: number): number[] {
  const bucket = Math.max(10, Math.min(80, Math.round((actualRank || 45) / 10) * 10))
  const near = nearestBucket(level, bucket)
  return (near ? level.rankBuckets[near] : null) ?? level.rankBuckets['40'] ?? []
}

// --- Извлечение признаков (должно совпадать с scripts/harvest-rich.mjs) ---

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const mean = (arr: number[]): number => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0)
const sum = (arr: number[]): number => arr.reduce((s, v) => s + v, 0)

type RichSource = {
  kills: number
  deaths: number
  assists: number
  goldPerMinute: number
  experiencePerMinute: number
  numLastHits: number
  numDenies: number
  networth: number
  level: number
  heroDamage: number
  towerDamage: number
  heroHealing: number
  // rich (только со страницы матча)
  killEvents?: { isSolo?: boolean; isGank?: boolean; assist?: number | null }[]
  deathEvents?: { goldFed?: number | null; isDieBack?: boolean; hasHealAvailable?: boolean; isAttemptTpOut?: boolean }[]
  wards?: { type?: number | null }[]
  wardDestruction?: unknown[]
  itemPurchases?: { itemId?: number | null }[]
  campStack?: number[]
  runes?: unknown[]
  courierKills?: unknown[]
  actionsPerMinute?: number[]
  tripsFountainPerMinute?: number[]
  pathPerMin?: number
}

function extractFeatures(
  src: RichSource,
  durationMin: number,
  teamKills: number,
  teamDamage: number,
  rich: boolean,
  features: string[],
): number[] {
  const k = num(src.kills), d = num(src.deaths), a = num(src.assists)
  const killEvents = src.killEvents ?? []
  const deathEvents = src.deathEvents ?? []
  const wards = src.wards ?? []
  // ward.type — Int: 0 = OBSERVER, 1 = SENTRY
  const wardObs = wards.filter((w) => num(w.type) === 0).length
  const wardSen = wards.filter((w) => num(w.type) === 1).length
  const purchases = src.itemPurchases ?? []
  const smokesBought = purchases.filter((ip) => num(ip.itemId) === 188).length
  const dustsBought = purchases.filter((ip) => num(ip.itemId) === 40).length
  const d2 = Math.max(durationMin, 1)

  const all: Record<string, number> = {
    k, d, a,
    kpm: k / d2, dpm: d / d2, apm: a / d2,
    gpm: num(src.goldPerMinute), xpm: num(src.experiencePerMinute),
    lh: num(src.numLastHits), denies: num(src.numDenies),
    networth: num(src.networth), level: num(src.level),
    heroDmg: num(src.heroDamage), heroDmgPerMin: num(src.heroDamage) / d2,
    towerDmg: num(src.towerDamage), heroHeal: num(src.heroHealing),
    dmgShare: teamDamage > 0 ? num(src.heroDamage) / teamDamage : 0,
    killShare: teamKills > 0 ? k / teamKills : 0,
    assistsPerKill: killEvents.length
      ? mean(killEvents.map((e) => num(e.assist)))
      : k > 0 ? a / k : 0,
    soloKillRate: killEvents.length ? killEvents.filter((e) => e.isSolo).length / killEvents.length : 0,
    gankKillRate: killEvents.length ? killEvents.filter((e) => e.isGank).length / killEvents.length : 0,
    avgGoldFed: deathEvents.length ? mean(deathEvents.map((e) => num(e.goldFed))) : 0,
    dieBacks: deathEvents.filter((e) => e.isDieBack).length,
    diedWithHeal: deathEvents.filter((e) => e.hasHealAvailable).length,
    tpFailDeaths: deathEvents.filter((e) => e.isAttemptTpOut).length,
    wardsObs: wardObs, wardsSen: wardSen,
    smokesBought, dustsBought,
    dewards: (src.wardDestruction ?? []).length,
    campStacks: sum(src.campStack ?? []),
    runes: (src.runes ?? []).length,
    courierKills: (src.courierKills ?? []).length,
    pathPerMin: num(src.pathPerMin),
    apmAvg: mean(src.actionsPerMinute ?? []),
    fountainTrips: mean(src.tripsFountainPerMinute ?? []),
  }
  // rich-модель может содержать base-признаки; base-модель — только base
  return features.map((f) => all[f] ?? 0)
}

function meanVec(vecs: number[][]): number[] {
  if (!vecs.length) return []
  return vecs[0].map((_, j) => vecs.reduce((s, v) => s + v[j], 0) / vecs.length)
}

function diffVec(a: number[], b: number[]): number[] {
  return a.map((v, j) => v - (b[j] ?? 0))
}

/**
 * ЕДИНСТВЕННАЯ оценка импакта — та же, что изначально жила в списке матчей.
 * Считает линию статов игрока против типичного для его bracket и вызывается
 * одинаково и для строки списка, и для каждой из десяти строк страницы матча,
 * поэтому один и тот же игрок в одном и том же матче видит одно число.
 */
/** Минимальный набор полей для оценки: есть и у строки списка, и у игрока матча. */
export type ImpactInput = Pick<
  MatchPlayer,
  | 'seasonRank'
  | 'position'
  | 'kills'
  | 'deaths'
  | 'assists'
  | 'goldPerMinute'
  | 'experiencePerMinute'
  | 'numLastHits'
  | 'numDenies'
  | 'networth'
  | 'level'
  | 'heroDamage'
  | 'towerDamage'
  | 'heroHealing'
>

export function personalImpact(
  p: ImpactInput,
  durationSec: number,
  seasonRank: number | null,
): number | null {
  if (!IMPACT_MODEL_READY) return null
  const level = model.base
  const durationMin = Math.max(durationSec / 60, 1)
  const effRank = p.seasonRank > 0 ? p.seasonRank : (seasonRank ?? 45)
  const lobby = lobbyBaseline(level, effRank)
  const base = baselineFor(level, p.position, effRank)
  if (!lobby.length || !base.length) return null

  const myVec = lobby.slice()
  const set = (name: string, v: number) => {
    const i = level.features.indexOf(name)
    if (i >= 0 && Number.isFinite(v)) myVec[i] = v
  }
  const kLobby = lobby[level.features.indexOf('k')] ?? 5
  const teamKills = p.kills + 4 * kLobby
  set('k', p.kills)
  set('d', p.deaths)
  set('a', p.assists)
  set('kpm', p.kills / durationMin)
  set('dpm', p.deaths / durationMin)
  set('apm', p.assists / durationMin)
  set('gpm', p.goldPerMinute)
  set('xpm', p.experiencePerMinute)
  set('lh', p.numLastHits)
  set('denies', p.numDenies)
  const myNetworth = p.networth > 0 ? p.networth : p.goldPerMinute * durationMin
  set('networth', myNetworth)
  set('level', p.level)
  set('killShare', teamKills > 0 ? p.kills / teamKills : 0)
  const dmgLobby = lobby[level.features.indexOf('heroDmg')] ?? 0
  const nwLobby = lobby[level.features.indexOf('networth')] ?? 0
  const myDmg = p.heroDamage > 0
    ? p.heroDamage
    : dmgLobby > 0 && nwLobby > 0
      ? myNetworth * (dmgLobby / nwLobby)
      : myNetworth * 1.5
  set('heroDmg', myDmg)
  set('heroDmgPerMin', myDmg / durationMin)
  set('towerDmg', p.towerDamage)
  set('heroHeal', p.heroHealing)

  const meanR = meanVec([myVec, lobby, lobby, lobby, lobby])
  const newTeamMean = meanVec([base, lobby, lobby, lobby, lobby])
  const impact = winProb(level, diffVec(meanR, lobby)) - winProb(level, diffVec(newTeamMean, lobby))
  return Math.max(-100, Math.min(100, Math.round(impact * level.scale)))
}

export function impactClass(score: number): string {
  if (score >= 15) return 'score-top'
  if (score >= 0) return 'score-mid'
  if (score <= -15) return 'score-low'
  return 'score-mid'
}
