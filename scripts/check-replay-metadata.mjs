// Run: node scripts/check-replay-metadata.mjs
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
process.on('unhandledRejection', error => { console.log('UNHANDLED:', error && error.message); console.log((error && error.stack || '').split('\n').slice(0,6).join('\n')) })
import { createReplayMetadataResolver, replayEndedAt } from '../server/gc/replay-metadata.mjs'
import { createReplayGc, gcRequest, gcResponse } from '../server/gc/replay-gc.mjs'

const json = (payload, status = 200) => ({
  ok: status < 400, status,
  json: async () => payload,
  body: { cancel: async () => {} },
})

// --- Valve GC session ---------------------------------------------------------
//
// The coordinator answers a match request in about two seconds or drops it
// without a reply, and the drop is not per-match. The session has to survive
// that: the version shipped before this asked about forty queued matches every
// ten minutes, latched the first drop for the whole batch, and reported every
// candidate as addressless without asking anything.

function fakeSteam(script) {
  const created = []
  class Fake extends EventEmitter {
    constructor(options) { super(); this.options = options; this.asks = 0; created.push(this) }
    logOn() { setImmediate(() => { this.emit('loggedOn'); this.emit('appLaunched', 570) }) }
    gamesPlayed() {}
    logOff() { this.offline = true }
    sendToGC(app, type, header, payload) {
      if (type === 4006) { setImmediate(() => this.emit('receivedFromGC', 570, 4004, Buffer.alloc(0))); return }
      if (type !== 7095) return
      this.asks++
      script(this, Number(gcRequest.decode(payload).matchId))
    }
    answer(id, result = 1) {
      this.emit('receivedFromGC', 570, 7096, gcResponse.encode({ result, match: { matchId: id, cluster: 183, replaySalt: 932364230, replayState: 0 } }).finish())
    }
  }
  return { Steam: Fake, created }
}

{
  let dropped = 0
  const { Steam, created } = fakeSteam((steam, id) => { if (dropped++ < 2) return; steam.answer(id) })
  const gc = createReplayGc({ env: { STEAM_REFRESH_TOKEN: 'test' }, Steam, requestMs: 40, retryMs: 1, connectMs: 200 })
  const match = await gc.lookup(9046298688)
  assert.equal(match.cluster, 183)
  assert.equal(match.replaySalt, 932364230)
  assert.equal(created.length, 3, 'a dropped request is retried instead of ending the batch')
  gc.close()
}

{
  const { Steam, created } = fakeSteam(() => {})
  const gc = createReplayGc({ env: { STEAM_REFRESH_TOKEN: 'test' }, Steam, requestMs: 40, retryMs: 1, connectMs: 200, attempts: 2, sessions: 8 })
  await assert.rejects(() => gc.lookup(1), /timed out/)
  const before = created.length
  await assert.rejects(() => gc.lookup(2), /timed out/)
  assert.equal(before, 2, 'one dropped request does not latch the session for the batch')
  assert.equal(created.length, 4, 'the next match is really asked, not answered from a cached failure')
  gc.close()
}

{
  const { Steam, created } = fakeSteam(() => {})
  const gc = createReplayGc({ env: { STEAM_REFRESH_TOKEN: 'test' }, Steam, requestMs: 40, retryMs: 1, connectMs: 200, attempts: 4, sessions: 3 })
  await assert.rejects(() => gc.lookup(1), /session limit/)
  assert.equal(created.length, 3, 'the account is not asked to log in over and over')
  gc.close()
}

{
  const { Steam } = fakeSteam(() => {})
  const gc = createReplayGc({ env: { STEAM_REFRESH_TOKEN: 'test' }, Steam, requestMs: 40, budgetMs: -1 })
  await assert.rejects(() => gc.lookup(1), /budget/)
  gc.close()
}

{
  const gc = createReplayGc({ env: {} })
  assert.equal(gc.configured, false)
  await assert.rejects(() => gc.lookup(1), /not configured/)
  gc.close()
}

// --- addresses ----------------------------------------------------------------
assert.equal(replayEndedAt(1000, 1800), 2800, 'a match is aged by its end, not its start')
assert.equal(replayEndedAt(1000, null), 1000)
assert.equal(replayEndedAt(null, 1800), null)

const calls = []
const fetcher = async (url, options = {}) => {
  calls.push(`${options.method ?? 'GET'} ${url}`)
  if (String(url).includes('/api/request/')) return json({ job: { jobId: 1 } })
  if (String(url).includes('/api/matches/9046298688')) return json({ match_id: 9046298688, cluster: 183, replay_salt: 932364230, start_time: 1792077901, duration: 1948 })
  if (String(url).includes('/api/matches/9046171456')) return json({ match_id: 9046171456, cluster: 182, replay_salt: 0, start_time: 1792073315, duration: 1779 })
  return json({}, 404)
}
let gcAsked = 0
const resolver = createReplayMetadataResolver({ env: {}, fetcher, gc: { configured: true, lookup: async () => { gcAsked++; return null }, close() {} } })

const published = await resolver.lookup(9046298688, { allowGc: false })
assert.equal(published.address.source, 'OpenDota')
assert.equal(published.address.replay_salt, 932364230)
assert.equal(published.endedAt, 1792079849)
assert.equal(gcAsked, 0, 'a fresh match is not worth a coordinator request')

const pendingAddress = await resolver.lookup(9046171456, { allowGc: false })
assert.equal(pendingAddress.address, null)
assert.equal(pendingAddress.endedAt, 1792075094, 'an answer without an address still dates the match')
assert.equal(gcAsked, 0, 'allowGc:false never reaches Valve')

await resolver.lookup(9046171456)
assert.equal(gcAsked, 1, 'the coordinator is asked for a match the HTTP sources cannot address')

assert.equal(await resolver.request(9046298688), true)
assert(calls.includes('POST https://api.opendota.com/api/request/9046298688'), 'a fresh match is requested from OpenDota')

const unreachable = createReplayMetadataResolver({ env: {}, fetcher: async () => { throw new Error('offline') }, gc: { configured: true, lookup: async () => { throw new Error('offline') }, close() {} } })
await assert.rejects(() => unreachable.lookup(1), /sources unavailable/, 'nothing answered is a retry, not a waiting match')
await assert.rejects(() => resolver.request('abc'), /Invalid match ID/)
const missing = createReplayMetadataResolver({ env: {}, fetcher: async () => json({}, 404), gc: { configured: false, lookup: async () => null, close() {} } })
assert.deepEqual(await missing.lookup(9046298688), { address: null, endedAt: null, source: null })

console.log('check-replay-metadata: ok')