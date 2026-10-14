// Run locally or on the existing GitHub runner. Uses the authorized ingest
// endpoint, not a public write endpoint. Throttle to <50 OpenDota calls/minute.
import { readFileSync } from 'node:fs'
import { createRankResolver } from '../server/player-ranks.mjs'
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* Runner supplies secrets through its environment. */ }
const base = process.env.REPLAY_INGEST_URL, token = process.env.REPLAY_INGEST_TOKEN
if (!base || !token) throw new Error('REPLAY_INGEST_URL and REPLAY_INGEST_TOKEN are required')
const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' }
async function api(path, options = {}) {
  const response = await fetch(new URL(path, base), { ...options, headers, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error('Rank ingest HTTP ' + response.status)
  return response.json()
}
const forced = process.argv.filter((x) => /^--match=\d+$/.test(x)).map((x) => ({ key: 'match-' + x.slice(8) }))
const { pending = [] } = forced.length ? { pending: forced } : await api('/api/internal/ranks')
const cache = new Map()
let last = 0, chain = Promise.resolve()
const resolver = createRankResolver({
  read: async (key) => cache.get(String(key)),
  write: async (key, value) => cache.set(String(key), value),
  fetcher: (url, options) => {
    const result = chain.then(async () => {
      const wait = 1250 - (Date.now() - last)
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      last = Date.now()
      return fetch(url, options)
    })
    chain = result.catch(() => {})
    return result
  },
})
for (const { key } of pending.slice(0, 10)) {
  if (/^match-\d+$/.test(key)) {
    const id = Number(key.slice(6))
    const match = await api('/api/internal/replay/match/' + id)
    await resolver.forMatch(match)
  } else if (/^\d+$/.test(key)) await resolver([Number(key)])
}
// Do not ingest outage placeholders or empty snapshots as successful refreshes.
const records = [...cache].filter(([key, value]) => key.startsWith('match-') ? value.players?.length === 10 : !value.retryAt)
  .map(([key, value]) => ({ key, value }))
if (records.length) console.log('RANK INGEST', await api('/api/internal/ranks', { method: 'POST', body: JSON.stringify({ records }) }))
console.log('Rank requests processed:', pending.length, 'records:', records.length)
