// Сборка статичных данных для оценки драфта: «кто сильнее на бумаге».
//
// Всё из измеренных чисел STRATZ (их разбор реплеев, все ранги, всё время) —
// никаких наших весов и догадок:
//   heroStats.laneOutcome(heroId, isWith, positionIds) — как герой отстоял
//     линию против конкретного героя (и вместе с конкретным напарником);
//   heroStats.matchUp(heroId) — винрейт пары «вместе» и «друг против друга»
//     за всю игру;
//   heroStats.stats(heroIds, groupByTime, groupByPosition) — нетворс по минутам
//     и базовый винрейт героя на позиции.
//
// Поле `position` в ответе laneOutcome всегда POSITION_1 и ничего не значит,
// поэтому позицию несём сами: она та, которой фильтровали запрос.
//
// Результат — server/data/constants/draft_data.json (читается лениво, отдельным
// чанком). Запуск: node scripts/build-draft-data.mjs [limit]

import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
)
const token = env.VITE_STRATZ_TOKEN
if (!token) throw new Error('Нужен VITE_STRATZ_TOKEN в .env')

const heroes = JSON.parse(readFileSync('server/data/constants/heroes.json', 'utf8'))
const allIds = heroes.map((h) => h.id).filter((id) => Number.isInteger(id) && id > 0).sort((a, b) => a - b)
const limit = Number(process.argv[2] || process.env.HERO_LIMIT || 0)
const ids = limit ? allIds.slice(0, limit) : allIds

const MIN_LANE = 250   // линий с исходом против одного героя
const MIN_PAIR = 300   // матчей в паре
const POS_SHARE = 0.04 // позиция считается «родной», если на ней ≥4% игр героя

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function gql(query, variables, attempt = 0) {
  const res = await fetch('https://api.stratz.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'STRATZ_API' },
    body: JSON.stringify({ query, variables }),
  })
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) throw new Error(`STRATZ HTTP ${res.status} после ${attempt} попыток`)
    await sleep(4000 * (attempt + 1))
    return gql(query, variables, attempt + 1)
  }
  const body = await res.json()
  if (body.errors) throw new Error(JSON.stringify(body.errors).slice(0, 200))
  return body.data
}

async function mapLimit(items, size, fn) {
  const out = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: size }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

const CURVE_Q = 'query($ids:[Short!]){ heroStats { stats(heroIds:$ids, groupByTime:true, groupByPosition:true, positionIds:[POSITION_1,POSITION_2,POSITION_3,POSITION_4,POSITION_5]){ heroId time position matchCount winCount networth } } }'
const LANE_Q = 'query($id:Short!,$with:Boolean!,$pos:[MatchPlayerPositionType!]){ heroStats { laneOutcome(heroId:$id, isWith:$with, positionIds:$pos){ heroId2 matchCount winCount lossCount drawCount } } }'
const PAIR_Q = 'query($id:Short!){ heroStats { matchUp(heroId:$id, take:200){ with{ heroId2 matchCount winCount } vs{ heroId2 matchCount winCount } } } }'
const POS_NAME = ['', 'POSITION_1', 'POSITION_2', 'POSITION_3', 'POSITION_4', 'POSITION_5']

console.log(`кривые нетворса и базовые винрейты: ${ids.length} героев`)
const curve = {}
const base = {}
for (let i = 0; i < ids.length; i += 8) {
  const chunk = ids.slice(i, i + 8)
  const rows = (await gql(CURVE_Q, { ids: chunk })).heroStats.stats ?? []
  for (const r of rows) {
    const pos = Number(String(r.position ?? '').split('_').pop()) || 0
    const per = (curve[r.heroId] ??= {})
    const arr = (per[pos] ??= new Array(8).fill(0))
    const minute = Number(r.time)
    if (minute % 5 === 0 && minute <= 35) arr[minute / 5] = Math.round(Number(r.networth) || 0)
    ;(base[r.heroId] ??= {})[pos] = [r.matchCount ?? 0, r.winCount ?? 0]
  }
  process.stdout.write(`  ${Math.min(i + 8, ids.length)}/${ids.length}\n`)
  await sleep(100)
}

/** Позиции, на которых герой реально играет: ≥4% его матчей. */
function homePositions(id) {
  const b = base[id] ?? {}
  const total = Object.values(b).reduce((n, x) => n + x[0], 0) || 1
  return Object.entries(b)
    .filter(([pos, [m]]) => pos !== '0' && m / total >= POS_SHARE)
    .map(([pos]) => Number(pos))
    .sort()
    .slice(0, 3)
}

const laneVs = {}
const laneWith = {}
const pairWith = {}
const pairVs = {}

const toRows = (rows, self, min) => {
  const by = new Map()
  for (const r of rows) {
    const other = r.heroId2
    if (other == null || other === self) continue
    const prev = by.get(other) ?? [0, 0, 0]
    prev[0] += r.winCount ?? 0
    prev[1] += r.lossCount ?? 0
    prev[2] += r.drawCount ?? 0
    by.set(other, prev)
  }
  return [...by.entries()]
    .filter(([, v]) => v[0] + v[1] + v[2] >= min)
    .map(([k, v]) => [k, v[0], v[1], v[2]])
    .sort((a, b) => a[0] - b[0])
}

console.log(`\nлинии и пары: ${ids.length} героев`)
await mapLimit(ids, 4, async (id) => {
  const positions = homePositions(id)
  const perPos = {}
  for (const pos of positions) {
    const rows = (await gql(LANE_Q, { id, with: false, pos: [POS_NAME[pos]] })).heroStats.laneOutcome ?? []
    const kept = toRows(rows, id, MIN_LANE)
    if (kept.length) perPos[pos] = kept
  }
  laneVs[id] = perPos

  const withRows = (await gql(LANE_Q, { id, with: true, pos: null })).heroStats.laneOutcome ?? []
  laneWith[id] = toRows(withRows, id, MIN_LANE)

  const mu = ((await gql(PAIR_Q, { id })).heroStats.matchUp ?? [])[0] ?? {}
  const pairs = (list) => (list ?? [])
    .filter((r) => r?.heroId2 != null && r.heroId2 !== id && (r.matchCount ?? 0) >= MIN_PAIR)
    .map((r) => [r.heroId2, r.winCount ?? 0, r.matchCount ?? 0])
    .sort((a, b) => a[0] - b[0])
  pairWith[id] = pairs(mu.with)
  pairVs[id] = pairs(mu.vs)
})

const out = {
  v: 2,
  generated: new Date().toISOString().slice(0, 10),
  source: 'STRATZ GraphQL heroStats: laneOutcome (исход линии против героя и с напарником), matchUp (пара вместе и друг против друга), stats (нетворс по минутам и винрейт позиции). Агрегат по всем рангам.',
  format: {
    laneVs: 'герой → позиция → [[враг, выиграно линий, проиграно, вничью], …]',
    laneWith: 'герой → [[напарник, выиграно, проиграно, вничью], …]',
    pairWith: 'герой → [[напарник, побед, матчей], …] — вся игра',
    pairVs: 'герой → [[враг, побед, матчей], …] — вся игра',
    curve: 'герой → позиция → нетворс на 0/5/…/35 минутах',
    base: 'герой → позиция → [матчей, побед]',
  },
  min: { lane: MIN_LANE, pair: MIN_PAIR },
  laneVs,
  laneWith,
  pairWith,
  pairVs,
  curve,
  base,
}
writeFileSync('server/data/constants/draft_data.json', JSON.stringify(out))

const rowsOf = (o) => Object.values(o).reduce((n, x) => n + (Array.isArray(x) ? x.length : Object.values(x).reduce((k, y) => k + y.length, 0)), 0)
console.log(`\ngotovo: server/data/constants/draft_data.json — ${(JSON.stringify(out).length / 1024).toFixed(0)} КБ`)
console.log('строк: laneVs', rowsOf(laneVs), '· laneWith', rowsOf(laneWith), '· pairWith', rowsOf(pairWith), '· pairVs', rowsOf(pairVs))
console.log('пример позиций героя 8 (Storm Spirit):', homePositions(8).join(','), '| героя 3:', homePositions(3).join(','))
