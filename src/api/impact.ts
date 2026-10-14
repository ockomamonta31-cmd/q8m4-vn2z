// A role-specific statistical comparison, not a causal verdict on a match.
// Training: scripts/train-impact.mjs. All favorable feature coefficients are
// constrained nonnegative; death/error coefficients are nonpositive.
import type { MatchPlayer } from './types'
import impactModelJson from './impact-model.json'

interface WinModel {
  kind: string
  beta: number[]
  std: number[]
  clip: number
  metrics?: { auc: number; logLoss: number; train: number; test: number }
}
export interface ImpactLevel {
  features: string[]
  win: WinModel
  positionWins: Record<string, WinModel>
  baselines: Record<string, number[]>
  heroBaselines: Record<string, number[]>
  posMean: Record<string, number[]>
  durationCenters: number[]
  durationAdjustments: Record<string, number[][]>
  scale: number
  metrics: { auc: number }
}
const model = impactModelJson as unknown as {
  version: number; matches: number; players: number; trainedAt: string
  base: ImpactLevel; rich: ImpactLevel; placeholder?: boolean
}
export const IMPACT_MODEL_READY = !model.placeholder && model.version >= 4 && model.matches > 0

export function impactModelInfo() {
  return IMPACT_MODEL_READY ? {
    matches: model.matches, players: model.players,
    auc: model.base.metrics.auc, trainedAt: model.trainedAt,
  } : null
}

export type ImpactInput = Pick<MatchPlayer,
  'seasonRank' | 'heroId' | 'position' | 'kills' | 'deaths' | 'assists' |
  'goldPerMinute' | 'experiencePerMinute' | 'numLastHits' | 'numDenies' |
  'networth' | 'level' | 'heroDamage' | 'towerDamage' | 'heroHealing'
> & Partial<Pick<MatchPlayer, 'stats' | 'mapPlays' | 'evidence' | 'impactPhases' | 'purchaseEvents'>> & { teamKills?: number; teamDamage?: number }

const bucketOf = (rank: number) => Math.max(10, Math.min(80, Math.floor(rank / 10) * 10))
const sigmoid = (v: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, v))))
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : 0

function durationAdjustment(level: ImpactLevel, pos: number, minutes: number): number[] {
  const values = level.durationAdjustments[String(pos)]
  if (!values) return level.features.map(() => 0)
  const centers = level.durationCenters
  let hi = centers.findIndex((v) => v >= minutes)
  if (hi < 0) hi = centers.length - 1
  const lo = Math.max(0, hi - 1)
  const t = lo === hi ? 0 : Math.max(0, Math.min(1, (minutes - centers[lo]) / (centers[hi] - centers[lo])))
  return values[lo].map((v, j) => v * (1 - t) + values[hi][j] * t)
}

function baselineFor(level: ImpactLevel, p: ImpactInput, rank: number, minutes: number): number[] {
  const pos = p.position >= 1 && p.position <= 5 ? p.position : 0
  const prior = level.posMean[String(pos)] ?? level.posMean['0']
  const ranked = rank > 0 ? level.baselines[pos + ':' + bucketOf(rank)] ?? prior : prior
  const hero = level.heroBaselines[p.heroId + ':' + pos + ':0']
  const exact = rank > 0 ? level.heroBaselines[p.heroId + ':' + pos + ':' + bucketOf(rank)] : null
  const base = exact ?? (hero ? ranked.map((v, j) => v + hero[j] - prior[j]) : ranked)
  const adjustment = durationAdjustment(level, pos, minutes)
  return base.map((v, j) => Math.max(0, v + adjustment[j]))
}

interface ImpactContext { level: ImpactLevel; base: number[]; actual: number[]; win: WinModel }
function impactContext(p: ImpactInput, durationSec: number, seasonRank: number | null): ImpactContext | null {
  if (!IMPACT_MODEL_READY || !Number.isFinite(durationSec) || durationSec <= 0) return null
  const level = p.stats || p.evidence ? model.rich : model.base
  const minutes = Math.max(durationSec / 60, 1)
  const rank = p.seasonRank > 0 ? p.seasonRank : seasonRank && seasonRank > 0 ? seasonRank : 0
  const base = baselineFor(level, p, rank, minutes)
  const rates = (v: unknown) => num(v) / minutes
  const lobby = baselineFor(level, { ...p, heroId: 0, position: 0 }, rank, minutes)
  const typical = (f: string) => lobby[level.features.indexOf(f)] ?? 0
  const kills = num(p.kills), assists = num(p.assists), damage = num(p.heroDamage)
  // Profile histories do not contain teammates: only share features use a
  // typical-team estimate there. The match page supplies observed team totals.
  const teamKills = p.teamKills ?? kills + 4 * typical('kpm') * minutes
  const teamDamage = p.teamDamage ?? damage + 4 * typical('heroDmgPerMin') * minutes
  const s = p.stats
  const values: Record<string, number> = {
    kpm: rates(kills), dpm: rates(p.deaths), apm: rates(assists),
    killParticipation: teamKills > 0 ? Math.min(1, (kills + assists) / teamKills) : 0,
    gpm: num(p.goldPerMinute), xpm: num(p.experiencePerMinute),
    lhpm: rates(p.numLastHits), deniesPerMin: rates(p.numDenies),
    networthPerMin: rates(p.networth),
    heroDmgPerMin: rates(damage), towerDmgPerMin: rates(p.towerDamage), heroHealPerMin: rates(p.heroHealing),
    dmgShare: teamDamage > 0 ? damage / teamDamage : 0,
    avgGoldFed: s?.deathEvents.length ? s.deathEvents.reduce((n, e) => n + num(e.goldFed), 0) / s.deathEvents.length : 0,
    dieBacksPerMin: rates(s?.deathEvents.filter((e) => e.isDieBack).length),
    diedWithHealPerMin: rates(s?.deathEvents.filter((e) => e.hasHealAvailable).length),
    tpFailDeathsPerMin: rates(s?.deathEvents.filter((e) => e.isAttemptTpOut).length),
    wardsObsPerMin: rates(s?.wards.filter((w) => w.type === 0).length),
    wardsSenPerMin: rates(s?.wards.filter((w) => w.type === 1).length),
    dewardsPerMin: rates(s?.wardDestruction.length),
    campStacksPerMin: rates(s?.campStack.reduce((n, v) => n + num(v), 0)),
    runesPerMin: rates(s?.runes.length), courierKillsPerMin: rates(s?.courierKills.length),
    smokesBoughtPerMin: rates(s?.itemPurchases.filter((e) => e.itemId === 188).length),
    dustsBoughtPerMin: rates(s?.itemPurchases.filter((e) => e.itemId === 40).length),
  }
  if (!s && p.evidence) {
    const e = p.evidence
    // Unknown telemetry is imputed to the baseline, never treated as failure.
    const observed: Record<string, number | null | undefined> = {
      avgGoldFed: e.deaths?.length ? e.deaths.reduce((n,d)=>n+(d.goldFed??0),0)/e.deaths.length : null,
      dieBacksPerMin: e.deaths ? rates(e.deaths.filter(d=>d.dieback).length) : null,
      wardsObsPerMin: e.wards ? rates(e.wards.filter(w=>w.type==='observer').length) : null,
      wardsSenPerMin: e.wards ? rates(e.wards.filter(w=>w.type==='sentry').length) : null,
      dewardsPerMin: e.dewards != null ? rates(e.dewards) : null,
      campStacksPerMin: e.stacks != null ? rates(e.stacks) : null,
      runesPerMin: e.runes ? rates(e.runes.length) : null,
      smokesBoughtPerMin: e.purchases ? rates(e.purchases.filter(x=>x.key==='smoke_of_deceit').length) : null,
      dustsBoughtPerMin: e.purchases ? rates(e.purchases.filter(x=>x.key==='dust').length) : null,
    }
    for (const feature of level.features) if (!(feature in observed) && !(feature in values && model.base.features.includes(feature))) observed[feature] = null
    for (const [key,v] of Object.entries(observed)) values[key] = v == null ? base[level.features.indexOf(key)] ?? 0 : v
  }
  return { level, base, actual: level.features.map((f) => values[f] ?? base[level.features.indexOf(f)] ?? 0),
    win: level.positionWins[String(p.position)] ?? level.win }
}

// The sigmoid changes the scale, not the sign of a feature's contribution.
// Integrating its slope along the baseline-to-player line gives an exact
// additive breakdown in O(features), without permutation noise.
function attribution(context: ImpactContext) {
  const { win, actual, base, level } = context
  const terms = actual.map((v, j) => win.beta[j + 1] * Math.max(-win.clip, Math.min(win.clip, (v - base[j]) / win.std[j])))
  const delta = terms.reduce((s, v) => s + v, 0)
  const origin = sigmoid(win.beta[0])
  const raw = (sigmoid(win.beta[0] + delta) - origin) * level.scale
  const slope = Math.abs(delta) > 1e-9 ? raw / delta : origin * (1 - origin) * level.scale
  return { score: Math.round(raw), contributions: terms.map((v) => v * slope) }
}

export function personalImpact(p: ImpactInput, durationSec: number, seasonRank: number | null): number | null {
  const context = impactContext(p, durationSec, seasonRank)
  return context ? attribution(context).score : null
}

export interface ImpactBreakdown {
  score: number
  factors: { label: string; section: string; contribution: number; actual: number; baseline: number; unit: 'rate' | 'share' | 'value' }[]
}
const impactLabels: Record<string, [string, string]> = {
  kpm: ['Убийства', 'Бой'], dpm: ['Смерти', 'Бой'], apm: ['Ассисты', 'Бой'],
  killParticipation: ['Участие в убийствах команды', 'Бой'],
  gpm: ['Золото/мин', 'Фарм'], xpm: ['Опыт/мин', 'Фарм'],
  lhpm: ['Добивания', 'Фарм'], deniesPerMin: ['Денаи', 'Фарм'], networthPerMin: ['Нетворт', 'Фарм'],
  heroDmgPerMin: ['Урон героям', 'Урон и объекты'], towerDmgPerMin: ['Урон башням', 'Урон и объекты'],
  heroHealPerMin: ['Лечение', 'Урон и объекты'], dmgShare: ['Доля урона команды', 'Урон и объекты'],
  avgGoldFed: ['Отдано золота за смерть', 'Ошибки'],
  dieBacksPerMin: ['Повторные смерти', 'Ошибки'], diedWithHealPerMin: ['Смерти с доступным лечением', 'Ошибки'],
  tpFailDeathsPerMin: ['Смерти при телепорте', 'Ошибки'],
  wardsObsPerMin: ['Observer-варды', 'Поддержка'], wardsSenPerMin: ['Sentry-варды', 'Поддержка'],
  dewardsPerMin: ['Снятые варды', 'Поддержка'], campStacksPerMin: ['Стаки лагерей', 'Поддержка'],
  runesPerMin: ['Подобранные руны', 'Поддержка'], courierKillsPerMin: ['Убитые курьеры', 'Поддержка'],
  smokesBoughtPerMin: ['Купленные смоки', 'Поддержка'], dustsBoughtPerMin: ['Купленный Dust', 'Поддержка'],
}
export function personalImpactBreakdown(p: ImpactInput, durationSec: number, seasonRank: number | null): ImpactBreakdown | null {
  const context = impactContext(p, durationSec, seasonRank)
  if (!context) return null
  const { score, contributions } = attribution(context)
  const factors = context.level.features.flatMap((key, j) => {
    const meta = impactLabels[key]
    return meta ? [{ label: meta[0], section: meta[1], contribution: Math.trunc(contributions[j]),
      actual: context.actual[j], baseline: context.base[j],
      unit: (key === 'killParticipation' || key === 'dmgShare' ? 'share' : key === 'avgGoldFed' ? 'value' : 'rate') as 'rate' | 'share' | 'value' }] : []
  })
  // Largest-remainder rounding preserves every factor's sign and makes the
  // displayed integer contributions sum exactly to the displayed score.
  let remainder = score - factors.reduce((s, f) => s + f.contribution, 0)
  const order = factors.map((_, j) => j).sort((a, b) =>
    Math.sign(remainder) * ((contributions[b] - factors[b].contribution) - (contributions[a] - factors[a].contribution)))
  for (const j of order) {
    if (!remainder) break
    const step = Math.sign(remainder)
    if (Math.sign(contributions[j]) !== step) continue
    factors[j].contribution += step
    remainder -= step
  }
  return { score, factors }
}
export function impactClass(score: number): string {
  return score >= 15 ? 'score-top' : score <= -15 ? 'score-low' : 'score-mid'
}
