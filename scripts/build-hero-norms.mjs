// Норма по герою из уже собранной выборки сильных игроков: 7670 игр Ancient+
// без Turbo из scripts/rich-dataset.jsonl. Смысл — сравнивать показатели
// игрока не только с соперником в его же матче, а с тем, как на этом герое
// играют сильные игроки.
//
//   node scripts/build-hero-norms.mjs
//
// Выход — server/data/constants/hero_norms.json.
// Значения — перцентили [p10, p25, p50, p75, p90]. Нормы только по финальным
// показателям матча: поминутных серий в этом датасете нет, поэтому линия и
// тайминги предметов здесь не измеряются.
//
// Счётчики вардов, стаков и расходников из этого источника сознательно не
// берутся: у пятой позиции медиана Observer здесь 4-6 за игру, тогда как
// разобранный реплей показывает 12. Сравнивать свой точный счёт с заниженной
// базой нельзя — это давало бы ложную похвалу.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'scripts', 'rich-dataset.jsonl')
const OUT = join(ROOT, 'server', 'data', 'constants', 'hero_norms.json')
const MIN_RANK = 60
const MIN_POSITION_SAMPLE = 25

const percentile = (sorted, q) => {
  if (!sorted.length) return 0
  const at = (sorted.length - 1) * q
  const low = Math.floor(at), high = Math.ceil(at)
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (at - low)
}
const round = (value, digits) => Number(value.toFixed(digits))

// null означает "в этой выборке признак не измеряется".
const CORE = {
  gpm: p => p.gpm, xpm: p => p.xpm, networth: p => p.networth,
  lhPerMin: p => (p.durationMin > 0 && p.lh != null ? p.lh / p.durationMin : null),
  heroDmgPerMin: p => p.heroDmgPerMin, towerDmgPerMin: p => (p.durationMin > 0 ? p.towerDmg / p.durationMin : null),
  dmgShare: p => (p.dmgShare != null ? p.dmgShare * 100 : null),
  killsPer10: p => (p.kpm != null ? p.kpm * 10 : null), deathsPer10: p => (p.dpm != null ? p.dpm * 10 : null),
  assistsPer10: p => (p.apm != null ? p.apm * 10 : null),
}
const POSITION = { gpm: CORE.gpm, xpm: CORE.xpm, lhPerMin: CORE.lhPerMin, heroDmgPerMin: CORE.heroDmgPerMin, deathsPer10: CORE.deathsPer10, dmgShare: CORE.dmgShare }
const DIGITS = { dmgShare: 1, lhPerMin: 1, killsPer10: 1, deathsPer10: 1, assistsPer10: 1, towerDmgPerMin: 1 }

const rows = []
for (const line of readFileSync(SOURCE, 'utf8').trim().split('\n')) {
  let match
  try { match = JSON.parse(line) } catch { continue }
  if (String(match.gameMode ?? '').includes('TURBO')) continue
  for (const player of match.players ?? []) {
    if (player.heroId == null || (player.actualRank ?? 0) < MIN_RANK) continue
    if (!(player.durationMin > 0)) continue
    rows.push(player)
  }
}

const series = (rows, pick) => {
  const values = rows.map(pick).filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b)
  return values.length >= 5 ? values : null
}
const table = (rows, metrics, sample) => {
  const out = {}
  for (const [name, pick] of Object.entries(metrics)) {
    const values = series(rows, pick)
    if (!values.length) continue
    const digits = DIGITS[name] ?? 0
    out[name] = [0.1, 0.25, 0.5, 0.75, 0.9].map(q => round(percentile(values, q), digits))
  }
  return { n: sample, metrics: out }
}

const byHero = new Map()
for (const player of rows) {
  const bucket = byHero.get(player.heroId) ?? []
  bucket.push(player)
  byHero.set(player.heroId, bucket)
}

const heroes = {}
let positionTables = 0
for (const [heroId, bucket] of [...byHero].sort((a, b) => a[0] - b[0])) {
  if (bucket.length < 25) continue
  const entry = table(bucket, CORE, bucket.length)
  for (const position of [1, 2, 3, 4, 5]) {
    const slice = bucket.filter(p => p.position === position)
    if (slice.length < MIN_POSITION_SAMPLE) continue
    entry.position = entry.position ?? {}
    entry.position[position] = { n: slice.length, metrics: table(slice, POSITION, slice.length).metrics }
    positionTables++
  }
  heroes[heroId] = entry
}

const output = {
  version: 1,
  cohort: { source: 'rich-dataset', minRank: MIN_RANK, excludeTurbo: true, players: rows.length, heroes: Object.keys(heroes).length, positionTables },
  percentiles: [10, 25, 50, 75, 90],
  metrics: { core: Object.keys(CORE), position: Object.keys(POSITION) },
  heroes,
}
writeFileSync(OUT, JSON.stringify(output))
console.log(`hero_norms: ${output.cohort.heroes} героев, ${rows.length} игр, ${positionTables} таблиц по позициям, ${(JSON.stringify(output).length / 1024).toFixed(0)} КБ`)
