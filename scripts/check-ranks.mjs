import assert from 'node:assert/strict'
import { createRankResolver, rankFields, validRank } from '../server/player-ranks.mjs'
let time = 100 * 86400_000, calls = 0, mode = 'ok'
const cache = new Map()
const read = async id => cache.get(id) ?? null
const write = async (id, value) => cache.set(id, value)
const fetcher = async url => {
  calls++
  if (mode === 'outage') throw new Error('offline')
  if (mode === 'limited') return new Response('', { status: 429, headers: { 'retry-after': '60' } })
  const id = Number(url.split('/').at(-1))
  return Response.json({ profile: { account_id: id }, rank_tier: mode === 'invalid' ? 999 : 45 })
}
const resolve = createRankResolver({ read, write, fetcher, now: () => time })
assert(validRank(45) && validRank(80))
assert(!validRank(0) && !validRank(46) && !validRank(90) && !validRank('45'))
await Promise.all([resolve([1, 1, 0, 0xffffffff]), resolve([1])])
assert.equal(calls, 1, 'deduplicate in-flight and repeated IDs')
assert.equal((await resolve([1])).get(1).tier, 45)
assert.equal(calls, 1, 'fresh cache avoids upstream')
time += 25 * 3600_000; mode = 'outage'
assert.equal((await resolve([1])).get(1).tier, 45, 'temporary outage keeps previous rank')
time += 8 * 86400_000
assert.equal((await resolve([1])).get(1), null, 'stale rank expires')
mode = 'invalid'
assert.equal((await resolve([2])).get(2), null)
const before = calls
await resolve([2]); assert.equal(calls, before, 'cache missing/invalid ranks')
mode = 'limited'; await resolve([3])
const limited = calls
await resolve([4]); assert.equal(calls, limited, 'honor rate limit')
assert.equal(rankFields({ seasonRank: 63 }, { tier: 45 }).seasonRank, 63, 'historical rank wins')
assert.equal(rankFields({ seasonRank: 0 }, null).seasonRank, 0)
assert.equal(rankFields({ seasonRank: 45, rankScope: 'current' }, { tier: 51, source: 'opendota', fetchedAt: time }).seasonRank, 51)

let matchCalls = 0
const matchCache = new Map()
const matchResolver = createRankResolver({
  read: async id => matchCache.get(id), write: async (id, value) => matchCache.set(id, value), now: () => time,
  fetcher: async url => {
    matchCalls++
    assert(url.endsWith('/matches/12345'), 'batch snapshot should avoid individual player requests')
    return Response.json({ match_id: 12345, players: Array.from({ length: 10 }, (_, i) => ({
      account_id: i + 1, hero_id: i + 10, player_slot: i < 5 ? i : 128 + i - 5, rank_tier: 45, personaname: 'p' + i,
    })) })
  },
})
const raw = { id: 12345, players: Array.from({ length: 10 }, (_, i) => ({ steamAccountId: 0, heroId: i + 10, isRadiant: i < 5, seasonRank: 0 })) }
const enriched = await matchResolver.forMatch(raw)
assert(enriched.players.every(p => p.seasonRank === 45 && p.steamAccountId > 0 && p.rankScope === 'current'))
assert(raw.players.every(p => p.seasonRank === 0), 'do not mutate immutable match cache')
await matchResolver.forMatch(raw)
assert.equal(matchCalls, 1)
console.log('PASS ranks: IDs, batch enrichment, cache, expiry, outages, 429, provenance and historical precedence')

// Exercise the real Worker handlers, including the authenticated ingest boundary.
const { buildSync } = await import('esbuild')
const { outputFiles } = buildSync({ entryPoints: ['cloudflare/worker.ts'], bundle: true, platform: 'neutral', format: 'esm', write: false })
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'))
const db = new Map()
const put = (key, value) => db.set(key, { value: JSON.stringify(value), updated_at: Date.now() })
const DB = {
  prepare(sql) {
    let args = []
    return {
      bind(...values) { args = values; return this },
      async first() {
        if (sql.startsWith('SELECT 1 AS queued')) return [...db.keys()].some(key => key.startsWith('rank-pending:v1:')) ? { queued: 1 } : null
        return db.get(args[0]) ?? null
      },
      async all() {
        if (sql.includes('WHERE key IN')) return { results: [...db].filter(([key]) => args.includes(key)).map(([key, value]) => ({ key, ...value })) }
        const prefix = sql.includes("'history:*'") ? 'history:' : 'rank-pending:v1:'
        return { results: [...db].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value).slice(0, 10) }
      },
      async run() {
        if (sql.startsWith('DELETE')) db.delete(args[0])
        else db.set(args[0], { value: args[1], updated_at: args[2] })
        return {}
      },
    }
  },
  async batch(statements) { return Promise.all(statements.map(s => s.run())) },
}
put('match:12345', { ...raw, players: raw.players.map((p, i) => ({ ...p, steamAccountId: i === 0 ? 1 : 0, kills:2,heroDamage:123,abilityUpgrades: [] })) })
put('replay-data:v1:12345', {})
put('history:1', { rows: [{ id: 12345, seq: 1 }], total: 1 })
for (let id = 1; id <= 10; id++) put('profile:' + id, { name: 'p' + id, avatar: null })
const env = { DB, ASSETS: { fetch: async () => new Response('') }, REPLAY_INGEST_TOKEN: 'unit-test-token' }
const request = (path, options) => worker.fetch(new Request('https://unit.test' + path, options), env)
assert.equal((await request('/api/internal/ranks')).status, 401)
const headers = { authorization: 'Bearer unit-test-token', 'content-type': 'application/json' }
assert.equal((await request('/api/internal/ranks', { method: 'POST', headers, body: JSON.stringify({ records: [{ key: 'match:other', value: {} }] }) })).status, 400)
const now = Date.now()
const payload = { records: [{ key: '1', value: { tier: 45, fetchedAt: now } },
  { key: 'match-12345', value: { fetchedAt: now, players: raw.players.map((p, i) => ({
    account_id: i + 1, hero_id: p.heroId, player_slot: i < 5 ? i : 128 + i - 5, rank_tier: 45,
  })) } }] }
assert.equal((await request('/api/internal/ranks', { method: 'POST', headers, body: JSON.stringify(payload) })).status, 200)
const originalFetch = globalThis.fetch
globalThis.fetch = async () => { throw new Error('No upstream access allowed in cached-route test') }
try {
  const match = await (await request('/api/matches/12345')).json()
  assert.equal(match.players.length, 10)
  assert(match.players.every(p => p.seasonRank === 45 && p.rankScope === 'current' && p.steamAccountId > 0))
  const profile = await (await request('/api/profile/1')).json()
  assert.equal(profile.rank, 45)
  const history = await (await request('/api/player/1/matches')).json()
  assert.equal(history[0].player.seasonRank, 45)
  assert.equal(history[0].player.rankScope, 'current')
  const evidence={version:1,curve:[[0,0,600,0,0,0,0,0,0,0]],lane:{damage:null,damageTaken:null,attacks:null,spellHits:null,activeMinutes:null},deaths:[],wards:[],uses:[],fights:[],purchases:[],runes:[],dewards:0,stacks:0,stuns:0,itemUses:{}}
  assert.equal((await request('/api/internal/replay/12345',{method:'POST',headers,body:JSON.stringify({players:[{playerSlot:0,position:1,positionSource:'replay',positionVersion:2,evidence}]})})).status,200)
  const enrichedMatch=await (await request('/api/matches/12345')).json()
  const enrichedHistory=await (await request('/api/player/1/matches')).json()
  assert.deepEqual(enrichedHistory[0].player.evidence,enrichedMatch.players[0].evidence,'Worker history must preserve replay evidence')
  assert.equal(enrichedHistory[0].player.position,enrichedMatch.players[0].position)
  assert(Number.isFinite(enrichedHistory[0].player.teamKills),'history must return real team totals')
} finally { globalThis.fetch = originalFetch }
console.log('PASS Worker: match/profile/history ranks, recovered IDs, ingest authentication and validation')

// A rank-only backlog must wake its runner even after all replays are parsed.
db.clear()
const dispatches = []
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.github.com/repos/test/repo/dispatches')
  dispatches.push(JSON.parse(options.body))
  return new Response(null, { status: 204 })
}
const cronEnv = { ...env, GITHUB_DISPATCH_TOKEN: 'test-dispatch-token', GITHUB_REPO: 'test/repo' }
try {
  await worker.scheduled({}, cronEnv)
  assert.equal(dispatches.length, 0, 'empty queues do not start runners')
  put('rank-pending:v1:1', { key: '1' })
  await worker.scheduled({}, cronEnv)
  assert.equal(dispatches.at(-1).event_type, 'rank-refresh', 'rank-only queue starts only rank runner')
  put('history:1', { rows: [{ id: 12345 }] })
  await worker.scheduled({}, cronEnv)
  assert.equal(dispatches.at(-1).event_type, 'replay-backfill', 'both queues wake both workflows')
  assert.deepEqual(dispatches.at(-1).client_payload.matchIds, [12345])
  db.delete('rank-pending:v1:1')
  await worker.scheduled({}, cronEnv)
  assert.equal(dispatches.at(-1).event_type, 'replay-backfill', 'replay-only queue still runs')
} finally { globalThis.fetch = originalFetch }
console.log('PASS cron: empty, rank-only, replay-only and combined queues')
