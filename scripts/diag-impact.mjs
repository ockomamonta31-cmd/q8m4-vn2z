import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const rows = readFileSync(join(ROOT, 'scripts', 'rich-dataset.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((m) => !/TURBO/.test(m.gameMode ?? ''))

const ps = rows.flatMap((m) => m.players)
console.log('игроков:', ps.length)

const stat = (f) => {
  const vals = ps.map((p) => p[f]).filter((v) => typeof v === 'number')
  const nz = vals.filter((v) => v !== 0).length
  console.log(
    f.padEnd(16),
    'ненулевых:', String(nz).padStart(6),
    `(${((nz / vals.length) * 100).toFixed(1)}%)`,
    'сумма:', vals.reduce((s, v) => s + v, 0).toFixed(0),
  )
}
for (const f of ['apmAvg', 'wardsObs', 'wardsSen', 'dewards', 'campStacks', 'runes', 'courierKills', 'pathPerMin', 'soloKillRate', 'assistsPerKill', 'avgGoldFed', 'fountainTrips', 'actualRank', 'seasonRank', 'rankDelta', 'partySize', 'position', 'stratzImp']) stat(f)

// сколько игроков с непустыми killEvents (судя по assistsPerKill>0 при k>0)
const withKills = ps.filter((p) => p.k > 0)
console.log('с k>0:', withKills.length, '| из них assistsPerKill>0:', withKills.filter((p) => p.assistsPerKill > 0).length)

// проверка NaN в diff-векторах
const BASE = ['k', 'd', 'a', 'kpm', 'dpm', 'apm', 'gpm', 'xpm', 'lh', 'denies', 'networth', 'level', 'heroDmg', 'heroDmgPerMin', 'towerDmg', 'heroHeal', 'dmgShare', 'killShare']
let nanCount = 0
let maxAbs = 0
for (const m of rows) {
  const rad = m.players.filter((p) => p.isRadiant)
  const dire = m.players.filter((p) => !p.isRadiant)
  if (rad.length !== 5 || dire.length !== 5) continue
  for (const f of BASE) {
    const mr = rad.reduce((s, p) => s + (p[f] || 0), 0) / 5
    const md = dire.reduce((s, p) => s + (p[f] || 0), 0) / 5
    const d = mr - md
    if (!Number.isFinite(d)) nanCount++
    maxAbs = Math.max(maxAbs, Math.abs(d))
  }
}
console.log('NaN в diff:', nanCount, '| max|diff|:', maxAbs)

// проверка: доля матчей, где у победившего radiant больше нетворта (реальная предсказуемость)
let winNw = 0, tot = 0
for (const m of rows) {
  const rad = m.players.filter((p) => p.isRadiant)
  const dire = m.players.filter((p) => !p.isRadiant)
  if (rad.length !== 5 || dire.length !== 5) continue
  tot++
  const nr = rad.reduce((s, p) => s + (p.networth || 0), 0)
  const nd = dire.reduce((s, p) => s + (p.networth || 0), 0)
  if (m.didRadiantWin ? nr > nd : nd > nr) winNw++
}
console.log(`нетворт-победитель угадывает исход: ${winNw}/${tot} = ${(winNw / tot * 100).toFixed(1)}%`)
