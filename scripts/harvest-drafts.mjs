// Наполняет кэш полными драфтами и линиями.
//
// Из Cloudflare Worker'а в api.stratz.com запрос не проходит: их анти-абьюз
// отвечает «You can only use one Steam Account» на общий исходящий IP. С этой
// машины проходит. Поэтому драфт выгружается здесь и кладётся туда, откуда
// Worker его и так читает: в D1-строки `match-draft:v1:<id>` и в локальный кэш
// server/data/drafts/<id>.json (тот же формат, что отдаёт matchDraft).
//
//   node scripts/harvest-drafts.mjs            — собрать и положить в локальный кэш
//   node scripts/harvest-drafts.mjs --push     — то же + загнать чанк в D1
//   node scripts/harvest-drafts.mjs --ids=1,2  — только перечисленные матчи
//
// Матчи неизменяемы, поэтому строки пишутся без срока жизни.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
)
const token = env.VITE_STRATZ_TOKEN
if (!token) throw new Error('Нужен VITE_STRATZ_TOKEN в .env')

const PUSH = process.argv.includes('--push')
const only = (process.argv.find((a) => a.startsWith('--ids=')) ?? '').slice(6).split(',').map(Number).filter(Boolean)
const DRAFTS = join(ROOT, 'server', 'data', 'drafts')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** npx на Windows — это .cmd: запускаем через cmd.exe, но аргументами, а не
    строкой, чтобы путь до SQL-файла не мог ничего подставить в shell. */
function wrangler(args) {
  const win = process.platform === 'win32'
  return execFileSync(win ? 'cmd.exe' : 'npx', win ? ['/c', 'npx', 'wrangler', ...args] : ['wrangler', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 128e6,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

const QUERY = 'query M($id:Long!){ match(id:$id) { pickBans { isPick order heroId bannedHeroId isRadiant } players { isRadiant heroId lane position } } }'

async function gql(id, attempt = 0) {
  const res = await fetch('https://api.stratz.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'STRATZ_API' },
    body: JSON.stringify({ query: QUERY, variables: { id } }),
  })
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 5) return null
    await sleep(3000 * (attempt + 1))
    return gql(id, attempt + 1)
  }
  if (!res.ok) { console.error(`  ${id}: HTTP ${res.status}`, (await res.text()).slice(0, 80)); return null }
  const body = await res.json()
  return body.data?.match ?? null
}

/** Тот же вид, что отдаёт matchDraft в Worker'е. */
function toDraft(m) {
  if (!m) return null
  const draft = { bans: [], picks: [], roles: {} }
  for (const b of m.pickBans ?? []) {
    if (b.isPick && Number.isInteger(b.heroId)) draft.picks.push({ heroId: b.heroId, radiant: Boolean(b.isRadiant), order: Number.isInteger(b.order) ? b.order : draft.picks.length })
    else if (!b.isPick && Number.isInteger(b.bannedHeroId)) draft.bans.push({ heroId: b.bannedHeroId, radiant: b.isRadiant === true ? true : b.isRadiant === false ? false : null })
  }
  draft.picks.sort((a, b) => a.order - b.order)
  const lanes = { SAFE_LANE: 'safelane', MID_LANE: 'mid', OFF_LANE: 'offlane' }
  for (const p of m.players ?? []) {
    const position = /^POSITION_[1-5]$/.test(p.position ?? '') ? Number(p.position.slice(9)) : 0
    if (!position) continue
    draft.roles[`${p.isRadiant ? 'r' : 'd'}:${p.heroId}`] = { lane: lanes[p.lane] ?? '', position }
  }
  return draft.picks.length || Object.keys(draft.roles).length ? draft : null
}

function allIds() {
  if (only.length) return only
  const ids = new Set()
  for (const f of readdirSync(join(ROOT, 'server', 'data', 'matches'))) ids.add(Number(f.replace('.json', '')))
  const historyDir = join(ROOT, 'server', 'data', 'history')
  if (existsSync(historyDir)) {
    for (const f of readdirSync(historyDir)) {
      try {
        const rows = JSON.parse(readFileSync(join(historyDir, f), 'utf8')).rows ?? []
        for (const r of rows) ids.add(Number(r.id))
      } catch { /* кэш истории может быть пустяком */ }
    }
  }
  if (PUSH) {
    // в D1 матчей больше, чем на диске: берём и те, что Worker уже видел
    try {
      const out = wrangler(['d1', 'execute', 'stratz-cache', '--remote', '--json', '--command', "SELECT key FROM cache WHERE key GLOB 'match:*'"])
      const rows = JSON.parse(out.slice(out.indexOf('[')))
      const found = (Array.isArray(rows) ? rows.flatMap((r) => r.results ?? []) : [])
        .map((r) => Number(String(r.key).slice('match:'.length)))
        .filter((n) => Number.isSafeInteger(n) && n > 0)
      for (const id of found) ids.add(id)
      console.log(`в D1 матчей: ${found.length}`)
    } catch (e) { console.error('не удалось прочитать список матчей из D1:', e.message) }
  }
  return [...ids].filter(Boolean).sort((a, b) => b - a)
}

const ids = allIds()
const fresh = ids.filter((id) => !existsSync(join(DRAFTS, `${id}.json`)))
console.log(`матчей: ${ids.length}, кэш драфтов уже есть для ${ids.length - fresh.length}, качаем ${fresh.length}`)
mkdirSync(DRAFTS, { recursive: true })

let done = 0
let empty = 0
const drafts = new Map()
const queue = [...fresh]
await Promise.all(Array.from({ length: 4 }, async () => {
  for (;;) {
    const id = queue.shift()
    if (id === undefined) return
    const draft = toDraft(await gql(id))
    done++
    if (!draft) empty++
    else {
      drafts.set(id, draft)
      writeFileSync(join(DRAFTS, `${id}.json`), JSON.stringify(draft))
    }
    if (done % 50 === 0) console.log(`  ${done}/${fresh.length} (пусто: ${empty})`)
    await sleep(80)
  }
}))

for (const id of ids) if (!drafts.has(id) && existsSync(join(DRAFTS, `${id}.json`))) drafts.set(id, JSON.parse(readFileSync(join(DRAFTS, `${id}.json`), 'utf8')))
console.log(`готово: ${drafts.size} драфтов, без данных ${empty}`)

if (!PUSH) {
  console.log('локальный кэш обновлён; для D1 запусти с --push')
} else {
  const quote = (s) => `'${String(s).replace(/'/g, "''")}'`
  const list = [...drafts.entries()]
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200)
    const sql = chunk
      .map(([id, draft]) => `INSERT OR REPLACE INTO cache(key,value,updated_at) VALUES(${quote(`match-draft:v1:${id}`)},${quote(JSON.stringify(draft))},${Date.now()});`)
      .join('\n')
    const file = join(ROOT, '.tmp-shots', `drafts-${i / 200}.sql`)
    writeFileSync(file, sql)
    wrangler(['d1', 'execute', 'stratz-cache', '--remote', '--file', file, '--yes'])
    console.log(`  D1: чанк ${i / 200 + 1} из ${Math.ceil(list.length / 200)} (${chunk.length} строк)`)
  }
}
