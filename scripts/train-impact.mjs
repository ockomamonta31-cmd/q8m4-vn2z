#!/usr/bin/env node
// Role-specific, monotone outcome models with duration-conditioned pub baselines.
// Run: node scripts/train-impact.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_PATH = join(ROOT, 'scripts', 'rich-dataset.jsonl')
const OUT_PATH = join(ROOT, 'src', 'api', 'impact-model.json')

if (!existsSync(DATA_PATH)) {
  console.error(`Нет ${DATA_PATH} — сначала запусти scripts/harvest-rich.mjs`)
  process.exit(1)
}

// --- Загрузка данных ---

const rows = readFileSync(DATA_PATH, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  // Турбо искажает статистику (деньги/опыт ×2) — учимся на обычных режимах
  .filter((m) => !/TURBO/.test(m.gameMode ?? ''))

const byMatch = new Map(rows.map((m) => [String(m.id), { ...m, sourceTag: ['rich'] }]))
const corpusPath = join(ROOT, 'server', 'data', 'corpus', 'teams.jsonl')
if (existsSync(corpusPath)) {
  const teams = new Map()
  for (const line of readFileSync(corpusPath, 'utf8').split(/\r?\n/)) {
    try {
      const team = JSON.parse(line)
      if (team.matchId) teams.set(String(team.matchId), [...(teams.get(String(team.matchId)) ?? []), team])
    } catch { /* ignore malformed cache lines */ }
  }
  for (const [id, pair] of teams) {
    const radiant = pair.find((team) => team.radiant)
    if (!radiant || pair.length !== 2) continue
    const existing = byMatch.get(id)
    if (existing) {
      // Keep richer per-match stats; backfill true STRATZ roles where absent.
      const roleBySideHero = new Map(pair.flatMap((team) => team.players.map((p) => [`${team.radiant}:${p.heroId}`, p.position])))
      for (const p of existing.players) if (!(p.position >= 1 && p.position <= 5)) {
        p.position = roleBySideHero.get(`${p.isRadiant}:${p.heroId}`) ?? p.position
      }
      existing.sourceTag = [...new Set([...(existing.sourceTag ?? []), 'stratz-corpus'])]
      if (radiant.leagueId) existing.leagueId ??= radiant.leagueId
      continue
    }
    const durationMin = Math.max(Number(radiant.durationSeconds) / 60, 1)
    const players = pair.flatMap((team) => {
      const teamKills = team.players.reduce((sum, p) => sum + (Number(p.kills) || 0), 0)
      const teamDamage = team.players.reduce((sum, p) => sum + (Number(p.heroDamage) || 0), 0)
      return team.players.map((p) => {
        const k = Number(p.kills) || 0, d = Number(p.deaths) || 0, a = Number(p.assists) || 0
        const heroDmg = Number(p.heroDamage) || 0
        return {
          k, d, a, kpm: k / durationMin, dpm: d / durationMin, apm: a / durationMin,
          gpm: Number(p.goldPerMinute) || 0, xpm: Number(p.experiencePerMinute) || 0,
          lh: Number(p.numLastHits) || 0, denies: Number(p.numDenies) || 0,
          networth: Number(p.networth) || 0, level: Number(p.level) || 0,
          heroDmg, heroDmgPerMin: heroDmg / durationMin, towerDmg: Number(p.towerDamage) || 0,
          heroHeal: Number(p.heroHealing) || 0,
          dmgShare: teamDamage ? heroDmg / teamDamage : 0,
          killShare: teamKills ? k / teamKills : 0,
          assistsPerKill: k ? a / k : 0, soloKillRate: 0, gankKillRate: 0, avgGoldFed: 0,
          dieBacks: 0, diedWithHeal: 0, tpFailDeaths: 0, wardsObs: 0, wardsSen: 0,
          dewards: 0, campStacks: 0, runes: 0, courierKills: 0, smokesBought: 0,
          dustsBought: 0, pathPerMin: 0, apmAvg: 0, fountainTrips: 0,
          seasonRank: Number(p.seasonRank) || Number(team.rank) || 80,
          position: Number(p.position) || 0, heroId: Number(p.heroId) || 0,
          isRadiant: team.radiant, stratzImp: null,
        }
      })
    })
    byMatch.set(id, {
      id: Number(id), didRadiantWin: Boolean(radiant.won), gameMode: radiant.gameMode,
      actualRank: Number(radiant.rank) || 80, leagueId: radiant.leagueId ?? null,
      durationSeconds: radiant.durationSeconds, players, sourceTag: ['stratz-corpus'],
    })
  }
}

const opendotaPaths = ['opendota-impact.jsonl', 'opendota-ranked-impact.jsonl'].map((name) => join(ROOT, 'scripts', name))
for (const opendotaPath of opendotaPaths) if (existsSync(opendotaPath)) {
  for (const line of readFileSync(opendotaPath, 'utf8').split(/\r?\n/)) {
    try {
      const m = JSON.parse(line)
      if (m.source === 'opendota-pub' && Number(m.lobbyType) !== 7) continue
      if (m.id && !byMatch.has(String(m.id)) && !/TURBO/.test(m.gameMode ?? '')) {
        m.sourceTag = [m.source ?? 'opendota']
        byMatch.set(String(m.id), m)
      }
    } catch { /* ignore partial cache lines */ }
  }
}
const trainingRows = [...byMatch.values()].filter((m) => {
  const minutes = Number(m.durationSeconds) / 60 || Number(m.players[0]?.durationMin)
  return !/TURBO/.test(m.gameMode ?? '') && minutes >= 10 && minutes <= 180
})

// Store rates, not raw totals: an 80-minute game must not be compared with a
// 30-minute average. Totals stay in the replay panel; the model sees per-minute
// rates and the actual team share for this match.
for (const m of trainingRows) {
  const minutes = (Number(m.durationSeconds) || 0) / 60 || Number(m.players[0]?.durationMin)
  if (!(minutes >= 10 && minutes <= 180)) throw new Error('Invalid duration for match ' + m.id)
  const sides = [true, false].map((radiant) => m.players.filter((p) => p.isRadiant === radiant))
  for (const side of sides) {
    const teamKills = side.reduce((n, p) => n + (Number(p.kills ?? p.k) || 0), 0)
    const teamDamage = side.reduce((n, p) => n + (Number(p.heroDamage ?? p.heroDmg) || 0), 0)
    for (const p of side) {
      const rate = (v) => (Number(v) || 0) / minutes
      const kills = Number(p.kills ?? p.k) || 0, deaths = Number(p.deaths ?? p.d) || 0, assists = Number(p.assists ?? p.a) || 0
      const heroDamage = Number(p.heroDamage ?? p.heroDmg) || 0
      Object.assign(p, {
        durationMin: minutes, kpm: rate(kills), dpm: rate(deaths), apm: rate(assists),
        killParticipation: teamKills > 0 ? Math.min(1, (kills + assists) / teamKills) : 0,
        lhpm: rate(p.numLastHits ?? p.lh), deniesPerMin: rate(p.numDenies ?? p.denies),
        networthPerMin: rate(p.networth), heroDmgPerMin: rate(heroDamage),
        towerDmgPerMin: rate(p.towerDamage ?? p.towerDmg), heroHealPerMin: rate(p.heroHealing ?? p.heroHeal),
        dmgShare: teamDamage > 0 ? heroDamage / teamDamage : 0,
        killShare: teamKills > 0 ? kills / teamKills : 0,
        dieBacksPerMin: rate(p.dieBacks), diedWithHealPerMin: rate(p.diedWithHeal), tpFailDeathsPerMin: rate(p.tpFailDeaths),
        wardsObsPerMin: rate(p.wardsObs), wardsSenPerMin: rate(p.wardsSen), dewardsPerMin: rate(p.dewards),
        campStacksPerMin: rate(p.campStacks), runesPerMin: rate(p.runes), courierKillsPerMin: rate(p.courierKills),
        smokesBoughtPerMin: rate(p.smokesBought), dustsBoughtPerMin: rate(p.dustsBought),
      })
    }
  }
}

// Outcome prediction is observational; its AUC is not a validation of individual
// impact. Sign-constrained logistic models prevent a beneficial stat from
// lowering the score with all other inputs held fixed.
const BASE_FEATURES = [
  'kpm', 'dpm', 'apm', 'killParticipation',
  'gpm', 'xpm', 'lhpm', 'deniesPerMin', 'networthPerMin',
  'heroDmgPerMin', 'towerDmgPerMin', 'heroHealPerMin', 'dmgShare',
]
const RICH_FEATURES = [...BASE_FEATURES,
  'avgGoldFed', 'dieBacksPerMin', 'diedWithHealPerMin', 'tpFailDeathsPerMin',
  'wardsObsPerMin', 'wardsSenPerMin', 'dewardsPerMin', 'campStacksPerMin',
  'runesPerMin', 'courierKillsPerMin', 'smokesBoughtPerMin', 'dustsBoughtPerMin',
]
const NEGATIVE = new Set(['dpm', 'avgGoldFed', 'dieBacksPerMin', 'diedWithHealPerMin', 'tpFailDeathsPerMin'])
const DURATION_CENTERS = [17.5, 32.5, 47.5, 62.5, 80]
const durationBin = (minutes) => minutes < 25 ? 0 : minutes < 40 ? 1 : minutes < 55 ? 2 : minutes < 70 ? 3 : 4
const vector = (p, features) => features.map((f) => Number.isFinite(p[f]) ? p[f] : 0)
const average = (vs) => vs[0].map((_, j) => vs.reduce((s, v) => s + v[j], 0) / vs.length)
const bucketOf = (rank) => Math.max(10, Math.min(80, Math.floor(rank / 10) * 10))
const isPro = (m) => Boolean(m.leagueId || m.source === 'opendota-pro' || m.sourceTag?.includes('opendota-pro'))
const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))))

// Split whole matches before calculating normalization or any baseline.
const order = trainingRows.map((_, i) => i)
let seed = 11
for (let i = order.length - 1; i > 0; i--) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  const j = seed % (i + 1)
  ;[order[i], order[j]] = [order[j], order[i]]
}
const trainIds = new Set(order.slice(0, Math.floor(order.length * 0.85)).map((i) => trainingRows[i].id))
const playersOf = (matches) => matches.flatMap((m) => m.players.map((p) => ({
  ...p, matchId: m.id, won: p.isRadiant === m.didRadiantWin,
  isPro: isPro(m),
})))

function durationAdjustment(level, position, minutes) {
  const values = level.durationAdjustments[String(position)]
  if (!values) return level.features.map(() => 0)
  let hi = DURATION_CENTERS.findIndex((v) => v >= minutes)
  if (hi < 0) hi = DURATION_CENTERS.length - 1
  const lo = Math.max(0, hi - 1)
  const t = lo === hi ? 0 : Math.max(0, Math.min(1,
    (minutes - DURATION_CENTERS[lo]) / (DURATION_CENTERS[hi] - DURATION_CENTERS[lo])))
  return values[lo].map((v, j) => v * (1 - t) + values[hi][j] * t)
}

function baselineFor(level, p) {
  const pos = p.position >= 1 && p.position <= 5 ? p.position : 0
  const prior = level.posMean[String(pos)] ?? level.posMean['0']
  const ranked = p.seasonRank > 0 ? level.baselines[pos + ':' + bucketOf(p.seasonRank)] ?? prior : prior
  const hero = level.heroBaselines[p.heroId + ':' + pos + ':0']
  const exact = p.seasonRank > 0 ? level.heroBaselines[p.heroId + ':' + pos + ':' + bucketOf(p.seasonRank)] : null
  const base = exact ?? (hero ? ranked.map((v, j) => v + hero[j] - prior[j]) : ranked)
  const adjustment = durationAdjustment(level, pos, p.durationMin)
  return base.map((v, j) => Math.max(0, v + adjustment[j]))
}

function auc(scores, ys) {
  const sorted = scores.map((s, i) => [s, ys[i]]).sort((a, b) => a[0] - b[0])
  let rankSum = 0, wins = 0
  for (let i = 0; i < sorted.length;) {
    let end = i + 1
    while (end < sorted.length && sorted[end][0] === sorted[i][0]) end++
    for (let j = i; j < end; j++) if (sorted[j][1]) { wins++; rankSum += (i + 1 + end) / 2 }
    i = end
  }
  return wins && wins < ys.length ? (rankSum - wins * (wins + 1) / 2) / (wins * (ys.length - wins)) : 0.5
}

function fit(samples, features) {
  const dim = features.length
  const std = features.map((_, j) => Math.sqrt(samples.reduce((s, p) => s + p.x[j] ** 2, 0) / samples.length) || 1)
  const X = samples.map((p) => p.x.map((v, j) => Math.max(-4, Math.min(4, v / std[j]))))
  const beta = new Array(dim + 1).fill(0)
  for (let epoch = 0; epoch < 450; epoch++) {
    const gradient = new Array(dim + 1).fill(0)
    for (let i = 0; i < X.length; i++) {
      const x = X[i]
      let logit = beta[0]
      for (let j = 0; j < dim; j++) logit += beta[j + 1] * x[j]
      const error = sigmoid(logit) - (samples[i].won ? 0.95 : 0.05)
      gradient[0] += error
      for (let j = 0; j < dim; j++) gradient[j + 1] += error * x[j]
    }
    beta[0] -= 0.15 * gradient[0] / samples.length
    for (let j = 0; j < dim; j++) {
      const next = beta[j + 1] - 0.15 * (gradient[j + 1] / samples.length + 0.025 * beta[j + 1])
      beta[j + 1] = NEGATIVE.has(features[j]) ? Math.min(0, next) : Math.max(0, next)
    }
  }
  return { kind: 'logistic', beta, mean: features.map(() => 0), std, T: 1, clip: 4 }
}
function predict(w, x) {
  return sigmoid(w.beta[0] + x.reduce((s, v, j) => s + w.beta[j + 1] * Math.max(-w.clip, Math.min(w.clip, v / w.std[j])), 0))
}
function trainLevel(name, features) {
  // Unavailable event statistics must not be labeled as zero support work.
  const matches = name === 'rich' ? trainingRows.filter((m) => m.sourceTag?.includes('rich')) : trainingRows
  const train = playersOf(matches.filter((m) => trainIds.has(m.id)))
  const test = playersOf(matches.filter((m) => !trainIds.has(m.id)))
  const pubs = train.filter((p) => !p.isPro)
  const posMean = { '0': average(pubs.map((p) => vector(p, features))) }
  const baselines = {}, heroBaselines = {}, durationAdjustments = {}
  for (let pos = 1; pos <= 5; pos++) {
    const ps = pubs.filter((p) => p.position === pos)
    posMean[pos] = ps.length ? average(ps.map((p) => vector(p, features))) : posMean['0']
    for (let bucket = 10; bucket <= 80; bucket += 10) {
      const cell = ps.filter((p) => p.seasonRank > 0 && bucketOf(p.seasonRank) === bucket)
      const weight = cell.length / (cell.length + 40)
      const mean = cell.length ? average(cell.map((p) => vector(p, features))) : posMean[pos]
      baselines[pos + ':' + bucket] = mean.map((v, j) => weight * v + (1 - weight) * posMean[pos][j])
    }
    for (const heroId of new Set(ps.map((p) => p.heroId).filter((id) => id > 0))) {
      const hp = ps.filter((p) => p.heroId === heroId)
      const mean = average(hp.map((p) => vector(p, features)))
      const weight = hp.length / (hp.length + 30)
      heroBaselines[heroId + ':' + pos + ':0'] = mean.map((v, j) => weight * v + (1 - weight) * posMean[pos][j])
      for (let bucket = 10; bucket <= 80; bucket += 10) {
        const cell = hp.filter((p) => p.seasonRank > 0 && bucketOf(p.seasonRank) === bucket)
        if (!cell.length) continue
        const mean = average(cell.map((p) => vector(p, features)))
        const weight = cell.length / (cell.length + 100)
        const prior = baselines[pos + ':' + bucket]
        heroBaselines[heroId + ':' + pos + ':' + bucket] = mean.map((v, j) => weight * v + (1 - weight) * prior[j])
      }
    }
  }
  const level = { name, features, posMean, baselines, heroBaselines, durationCenters: DURATION_CENTERS, durationAdjustments, positionWins: {}, rankBuckets: {}, scale: 100 }
  // Duration correction is a residual after hero/role/rank expectations,
  // with shrinkage for the sparse 70+ minute tail.
  for (let pos = 0; pos <= 5; pos++) {
    const ps = pubs.filter((p) => pos === 0 || p.position === pos)
    durationAdjustments[pos] = DURATION_CENTERS.map((_, bin) => {
      const cell = ps.filter((p) => durationBin(p.durationMin) === bin)
      if (!cell.length) return features.map(() => 0)
      const residual = average(cell.map((p) => vector(p, features).map((v, j) => v - baselineFor({ ...level, durationAdjustments: {} }, p)[j])))
      return residual.map((v) => v * cell.length / (cell.length + 30))
    })
  }
  const sample = (p) => ({ ...p, x: vector(p, features).map((v, j) => v - baselineFor(level, p)[j]) })
  const samples = train.map(sample)
  level.win = fit(samples, features)
  const predictions = [], outcomes = []
  for (let pos = 1; pos <= 5; pos++) {
    const tr = samples.filter((p) => p.position === pos)
    const te = test.filter((p) => p.position === pos).map(sample)
    if (!tr.length || !te.length) continue
    const w = fit(tr, features)
    const scores = te.map((p) => predict(w, p.x))
    const ys = te.map((p) => Number(p.won))
    const logLoss = -scores.reduce((s, v, i) => s + ys[i] * Math.log(Math.max(v, 1e-7)) + (1 - ys[i]) * Math.log(Math.max(1 - v, 1e-7)), 0) / te.length
    w.metrics = { auc: +auc(scores, ys).toFixed(4), logLoss: +logLoss.toFixed(4), train: tr.length, test: te.length }
    level.positionWins[pos] = w
    predictions.push(...scores); outcomes.push(...ys)
    console.log(name + ' pos ' + pos + ': ' + JSON.stringify(w.metrics))
  }
  level.metrics = { auc: +auc(predictions, outcomes).toFixed(4), corrWithStratzImp: 0, winAvgImpact: 0, lossAvgImpact: 0 }
  return level
}
const base = trainLevel('base', BASE_FEATURES)
const rich = trainLevel('rich', RICH_FEATURES)
const model = {
  version: 4, kind: 'impact-monotone', trainedAt: new Date().toISOString(),
  matches: trainingRows.length, players: trainingRows.reduce((n, m) => n + m.players.length, 0),
  trainingData: {
    sources: trainingRows.reduce((out, m) => {
      for (const source of m.sourceTag ?? ['rich']) out[source] = (out[source] ?? 0) + 1
      return out
    }, {}),
    proMatches: trainingRows.filter(isPro).length,
    pubMatches: trainingRows.filter((m) => !isPro(m)).length,
    trainMatches: trainIds.size, testMatches: trainingRows.length - trainIds.size,
    validation: 'Held-out match outcome prediction; not causal or expert impact labels.',
  },
  base, rich,
}
writeFileSync(OUT_PATH, JSON.stringify(model, (_, value) => typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value))
console.log('Saved ' + trainingRows.length + ' matches, ' + model.players + ' players; model version ' + model.version)
