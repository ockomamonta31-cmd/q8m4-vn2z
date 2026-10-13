// Тело бэктеста. Отдельным файлом, чтобы esbuild мог забандлить его вместе с
// фронтовой моделью — иначе бэктест проверял бы другую математику.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateDraft } from '../src/api/draftStrength'
import type { Profile } from '../src/api/heroProfile'
import type { MatchDetails } from '../src/api/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROFILE_PATH = join(ROOT, 'server', 'data', 'constants', 'hero_profile.json')
const MATCHES = join(ROOT, 'server', 'data', 'matches')

const profile = JSON.parse(readFileSync(PROFILE_PATH, 'utf8')) as Profile
const EDGES = [0.3, 0.4, 0.45, 0.48, 0.5, 0.52, 0.55, 0.6, 0.7, 1.0001]

type Bucket = { lo: number; hi: number; games: number; wins: number }
const newBuckets = (): Bucket[] => EDGES.slice(0, -1).map((lo, i) => ({ lo, hi: EDGES[i + 1], games: 0, wins: 0 }))

function put(buckets: Bucket[], share: number, won: boolean) {
  const b = buckets.find((x) => share >= x.lo && share < x.hi)
  if (!b) return
  b.games += 1
  b.wins += won ? 1 : 0
}

let matches = 0
let matchHits = 0
const calibration = newBuckets()

let laneGames = 0
let laneHits = 0
const laneCalibration = newBuckets()

for (const f of readdirSync(MATCHES)) {
  if (!f.endsWith('.json')) continue
  let match: MatchDetails
  try {
    match = JSON.parse(readFileSync(join(MATCHES, f), 'utf8')) as MatchDetails
  } catch {
    continue
  }
  if ((match.players ?? []).length !== 10 || match.didRadiantWin === null || match.didRadiantWin === undefined) continue
  const rating = evaluateDraft(profile, match.players, { durationSeconds: match.durationSeconds, didRadiantWin: match.didRadiantWin })
  if (!rating || !rating.axes.length) continue
  matches += 1

  const predicted = rating.total.radiant >= 50 ? 'radiant' : 'dire'
  const winner = match.didRadiantWin ? 'radiant' : 'dire'
  matchHits += predicted === winner ? 1 : 0
  put(calibration, rating.total.radiant / 100, match.didRadiantWin)

  for (const lane of rating.lanes) {
    const side = lane.result?.side
    if (lane.share === null || !side || side === 'even') continue
    laneGames += 1
    const call = lane.share >= 0.5 ? 'radiant' : 'dire'
    if (call === side) laneHits += 1
    put(laneCalibration, lane.share, side === 'radiant')
  }
}

const finish = (buckets: Bucket[]) =>
  buckets
    .filter((b) => b.games >= 15)
    .map((b) => ({ lo: b.lo, hi: Math.min(b.hi, 1), games: b.games, won: Math.round((b.wins / b.games) * 1000) / 1000 }))

const backtest = {
  generated: new Date().toISOString().slice(0, 10),
  matches,
  lanes: laneGames,
  matchAccuracy: Math.round((matchHits / Math.max(1, matches)) * 1000) / 1000,
  laneAccuracy: Math.round((laneHits / Math.max(1, laneGames)) * 1000) / 1000,
  calibration: finish(calibration),
  laneBuckets: finish(laneCalibration),
}

profile.backtest = backtest
mkdirSync(dirname(PROFILE_PATH), { recursive: true })
writeFileSync(PROFILE_PATH, JSON.stringify(profile))

console.log(`матчей прогнано: ${matches}, линий засчитано: ${laneGames}`)
console.log(`точность по матчу: ${(backtest.matchAccuracy * 100).toFixed(1)}% · по линиям: ${(backtest.laneAccuracy * 100).toFixed(1)}%`)
console.log('калибровка (доля силы Radiant → как часто Radiant выигрывал):')
for (const b of backtest.calibration) console.log(`  ${(b.lo * 100).toFixed(0)}–${(Math.min(b.hi, 1) * 100).toFixed(0)}% · n=${b.games} · выигрывал в ${(b.won * 100).toFixed(0)}%`)
console.log('то же по линиям:')
for (const b of backtest.laneBuckets) console.log(`  ${(b.lo * 100).toFixed(0)}–${(Math.min(b.hi, 1) * 100).toFixed(0)}% · n=${b.games} · брал линию в ${(b.won * 100).toFixed(0)}%`)
