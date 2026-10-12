// Найти матч с максимальным покрытием rich-признаков и показать сырые wards/loc
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const token = readFileSync(join(ROOT, '.env'), 'utf8').match(/VITE_STRATZ_TOKEN=(\S+)/)?.[1] ?? ''

const rows = readFileSync(join(ROOT, 'scripts', 'rich-dataset.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l))

// матч, где больше всего ненулевых rich-признаков
let best = null
let bestScore = -1
for (const m of rows) {
  if (/TURBO/.test(m.gameMode ?? '')) continue
  const score = m.players.reduce((s, p) => {
    let n = 0
    for (const f of ['wardsObs', 'wardsSen', 'dewards', 'campStacks', 'runes', 'pathPerMin', 'apmAvg', 'soloKillRate']) {
      if ((p[f] ?? 0) !== 0) n++
    }
    return s + n
  }, 0)
  if (score > bestScore) { bestScore = score; best = m }
}
console.log('Лучший матч:', best?.id, 'score:', bestScore, 'mode:', best?.gameMode)

const QUERY = `
query ($id: Long!) {
  match(id: $id) {
    id actualRank gameMode durationSeconds
    players {
      position partyId kills assists
      steamAccount { seasonRank }
      stats {
        wards { type }
        killEvents { isSolo isGank assist }
        locationReport { positionX positionY }
        wardDestruction { time }
        campStack
        runes { time }
      }
    }
  }
}`

const res = await fetch('http://localhost:5173/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: QUERY, variables: { id: best.id } }),
})
const json = await res.json()
if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
const m = json.data.match
console.log('actualRank:', m.actualRank, '| duration:', m.durationSeconds)

for (const p of m.players) {
  const s = p.stats
  const wards = s?.wards ?? []
  const loc = s?.locationReport ?? []
  console.log(
    `pos=${p.position ?? '-'} rank=${p.steamAccount?.seasonRank ?? '?'} k=${p.kills}`,
    '| wardTypes:', JSON.stringify([...new Set(wards.map((w) => w.type))]),
    '| killEvents:', (s?.killEvents ?? []).length,
    '| loc:', loc.length,
    '| campStack:', (s?.campStack ?? []).length,
    '| runes:', (s?.runes ?? []).length,
  )
}

const loc = m.players[0]?.stats?.locationReport ?? []
if (loc.length) {
  const xs = loc.map((l) => l.positionX)
  const ys = loc.map((l) => l.positionY)
  console.log('X:', Math.min(...xs), '..', Math.max(...xs), '| Y:', Math.min(...ys), '..', Math.max(...ys))
  console.log('первые 5:', JSON.stringify(loc.slice(0, 5)))
}
