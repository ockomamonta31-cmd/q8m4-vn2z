// node scripts/check-loading.mjs
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { buildSync } from 'esbuild'
import { setTimeout as delay } from 'node:timers/promises'

const load = async (entry, define = {}) => {
  const { outputFiles } = buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false, define })
  return import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'))
}
const { default: worker } = await load('cloudflare/worker.ts')
const client = await load('src/api/index.ts', { 'import.meta.env.VITE_DEMO': '"0"' })
const db = new DatabaseSync(':memory:')
db.exec('CREATE TABLE cache(key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)')
const put = (key, value, time = Date.now()) => db.prepare('INSERT OR REPLACE INTO cache VALUES(?,?,?)').run(key, JSON.stringify(value), time)
const get = key => JSON.parse(db.prepare('SELECT value FROM cache WHERE key=?').get(key).value)
let reading = 0, peak = 0
const env = { STEAM_WEB_API_KEY: 'test', DB: {
  prepare(sql) {
    let args = []
    return {
      bind(...values) { args = values; return this },
      async first() {
        if (String(args[0]).startsWith('match:')) {
          peak = Math.max(peak, ++reading)
          await delay(5)
          reading--
        }
        return db.prepare(sql).get(...args) ?? null
      },
      async all() { return { results: db.prepare(sql).all(...args) } },
      async run() { db.prepare(sql).run(...args); return {} },
    }
  },
  async batch(statements) { return Promise.all(statements.map(s => s.run())) },
} }
const raw = { id: 42, durationSeconds: 1800, players: Array.from({ length: 10 }, (_, i) => ({
  steamAccountId: i === 0 ? 1 : 0, heroId: i + 1, isRadiant: i < 5,
  kills: 1, deaths: 1, heroDamage: 100, seasonRank: 0, abilityUpgrades: [],
})) }
const request = (path, ctx, settings = env) => worker.fetch(new Request('https://test' + path), settings, ctx)
const originalFetch = globalThis.fetch, originalTimeout = AbortSignal.timeout
const keepAlive = setInterval(() => {}, 1000)

try {
  put('match:42', raw)
  put('profile:1', { name: 'Cached', avatar: null })
  globalThis.fetch = async () => { throw new Error('Optional providers must not block the match') }
  const match = await request('/api/matches/42')
  assert.equal(match.status, 200)
  assert.equal((await match.json()).players.length, 10)
  assert(db.prepare('SELECT 1 FROM cache WHERE key=?').get('rank-pending:v1:match-42'), 'uncached identities enter the background queue')

  // A ready match with private IDs must not trigger a second browser request.
  let clientCalls = 0
  globalThis.fetch = async (url, options) => {
    clientCalls++
    assert.equal(url, '/api/matches/42')
    assert(options.signal instanceof AbortSignal)
    return Response.json(structuredClone(raw))
  }
  assert.equal((await client.fetchMatch(42)).players.length, 10)
  assert.equal(clientCalls, 1)

  // Expired names/history return immediately while one shared refresh runs.
  put('profile:1', { name: 'Cached', avatar: null }, 0)
  put('history:1', { rows: [{ id: 42, seq: 1 }], total: 1 }, 0)
  let release
  const gate = new Promise(resolve => { release = resolve })
  const calls = { names: 0, history: 0 }, background = []
  globalThis.fetch = async (url, options) => {
    assert(options.signal instanceof AbortSignal)
    const names = String(url).includes('GetPlayerSummaries')
    calls[names ? 'names' : 'history']++
    await gate
    return Response.json(names
      ? { response: { players: [{ steamid: '76561197960265729', personaname: 'Updated' }] } }
      : { result: { total_results: 2, matches: [{ match_id: 43, match_seq_num: 2 }, { match_id: 42, match_seq_num: 1 }] } })
  }
  const ctx = { waitUntil: task => background.push(task) }
  let timer
  const responses = await Promise.race([
    Promise.all([request('/api/profile/1', ctx), request('/api/profile/1', ctx), request('/api/player/1/matches?take=1', ctx)]),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Cached pages waited for upstream')), 1000) }),
  ]).finally(() => clearTimeout(timer))
  assert(responses.every(r => r.status === 200))
  assert.equal((await responses[0].json()).name, 'Cached')
  assert.deepEqual(calls, { names: 1, history: 1 }, 'concurrent pages share refresh requests')
  release()
  await Promise.all(background)
  assert.equal(get('profile:1').name, 'Updated')
  assert.equal(get('history:1').rows[0].id, 43)

  // Быстрый Valve: тихий повторный запрос (?fresh=1) приносит только что
  // сыгранный матч, так что ручная перезагрузка страницы не нужна.
  put('history:1', { rows: [{ id: 42, seq: 1 }], total: 1 }, 0)
  put('match:43', { ...raw, id: 43 })
  globalThis.fetch = async url => {
    assert(String(url).includes('GetMatchHistory'), 'the profile only asks Valve for its history')
    return Response.json({ result: { total_results: 2, matches: [{ match_id: 43, match_seq_num: 2 }, { match_id: 42, match_seq_num: 1 }] } })
  }
  const recheck = await (await request('/api/player/1/matches?take=1&fresh=1', { waitUntil: () => {} })).json()
  assert.deepEqual(recheck.map(m => m.id), [43], 'the quiet recheck brings a just-played match')

  // Молчащий Valve не держит страницу: отдаём кэш, обновление остаётся фоном.
  put('history:7', { rows: [{ id: 99, seq: 1 }], total: 1 }, 0)
  put('match:99', { ...raw, id: 99, players: raw.players.map((p, i) => ({ ...p, steamAccountId: i === 9 ? 7 : p.steamAccountId })) })
  globalThis.fetch = async () => new Promise(() => {})
  const stale = await (await request('/api/player/7/matches?take=1&fresh=1', { waitUntil: () => {} })).json()
  assert.deepEqual(stale.map(m => m.id), [99], 'a silent Valve falls back to the cached list')

  // History keeps order while reading several cached matches at once.
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: 100 - i, seq: i + 1 }))
  put('history:1', { rows, total: 10 })
  rows.forEach(r => put('match:' + r.id, { ...raw, id: r.id }))
  peak = 0
  const history = await (await request('/api/player/1/matches?take=10')).json()
  assert.deepEqual(history.map(m => m.id), rows.map(r => r.id))
  assert.equal(peak, 5, 'history uses bounded parallel match reads')

  const oldRows = Array.from({ length: 500 }, (_, i) => ({ id: 1000 - i, seq: 1000 - i }))
  put('history:1', { rows: oldRows, total: 500 }, 0)
  let historyCalls = 0
  globalThis.fetch = async () => {
    historyCalls++
    return Response.json({ result: { total_results: 500, matches: Array.from({ length: 100 }, (_, i) => ({ match_id: 1001 - i, match_seq_num: 1001 - i })) } })
  }
  const incremental = []
  await request('/api/profile/1', { waitUntil: task => incremental.push(task) })
  await Promise.all(incremental)
  assert.equal(historyCalls, 1, 'an existing history needs only its newest page')
  assert.equal(get('history:1').rows.length, 500, 'incremental refresh retains older matches')
  assert.equal(get('history:1').rows[0].id, 1001)

  // Simulate stalled providers and stalled response bodies without a real wait.
  const deadlines = []
  AbortSignal.timeout = ms => { deadlines.push(ms); return originalTimeout(20) }
  globalThis.fetch = async (_url, { signal }) => {
    assert(signal instanceof AbortSignal)
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  }
  const optional = await request('/api/matches/42', undefined, { ...env, STRATZ_API_TOKEN: 'test' })
  assert.equal(optional.status, 200, 'stalled draft/purchases do not hide match stats')
  assert(deadlines.includes(2000))
  assert.equal((await request('/api/profile/2')).status, 500, 'a cold Steam outage fails within its deadline')
  assert(deadlines.includes(8000) && deadlines.includes(10000))
  await assert.rejects(client.fetchProfile(1), /Сервер долго не отвечает/)
  globalThis.fetch = async (_url, { signal }) => new Response(new ReadableStream({
    start(controller) { signal.addEventListener('abort', () => controller.error(signal.reason), { once: true }) },
  }))
  await assert.rejects(client.fetchProfile(1), /Сервер долго не отвечает/, 'deadline includes the response body')
  assert(deadlines.includes(20000))
  console.log('PASS loading: cached pages survive provider stalls, refresh deduplication, background ranks, bounded parallel history, browser request/body deadlines')
} finally {
  globalThis.fetch = originalFetch
  AbortSignal.timeout = originalTimeout
  clearInterval(keepAlive)
  db.close()
}
