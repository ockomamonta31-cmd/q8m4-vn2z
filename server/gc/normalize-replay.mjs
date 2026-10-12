#!/usr/bin/env node
// Join OpenDota replay purchase logs to Valve match records by player_slot.
// Usage: node server/gc/normalize-replay.mjs MATCH_ID

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [id] = process.argv.slice(2)
if (!/^\d+$/.test(id ?? '')) {
  console.error('Usage: node server/gc/normalize-replay.mjs MATCH_ID')
  process.exit(2)
}
const data = join(dirname(dirname(fileURLToPath(import.meta.url))), 'data')
try {
  const envText = await readFile(join(dirname(data), '..', '.env'), 'utf8')
  for (const line of envText.split(/\r?\n/)) {
    const entry = line.match(/^\s*(REPLAY_INGEST_URL|REPLAY_INGEST_TOKEN)\s*=\s*(.*?)\s*$/)
    if (entry && !process.env[entry[1]]) process.env[entry[1]] = entry[2].replace(/^['"]|['"]$/g, '')
  }
} catch {}
const [match, replay, items] = await Promise.all([
  readFile(join(data, 'matches', `${id}.json`), 'utf8').then(JSON.parse),
  readFile(join(data, 'replays', `${id}.json`), 'utf8').then(JSON.parse),
  readFile(join(data, 'constants', 'items.json'), 'utf8').then(JSON.parse),
])
const itemIds = new Map(items.flatMap((x) => [[x.shortName, x.id], [x.shortName.replaceAll('_', ''), x.id]]))
if (!Array.isArray(replay.players) || replay.players.length !== 10) throw new Error(`Replay does not contain the expected 10 player records`)
let purchases = 0, unmapped = 0
const replayPlayers = match.players.map((p) => {
  const side = match.players.filter((q) => q.isRadiant === p.isRadiant)
  const slot = (p.isRadiant ? 0 : 128) + side.indexOf(p)
  const parsed = replay.players.find((x) => Number(x.player_slot) === slot)
  if (!parsed) throw new Error(`Replay lacks player_slot ${slot}`)
  p.purchaseEvents = []
  for (const e of parsed.purchase_log ?? []) {
    const key = String(e.key ?? '')
    const itemId = itemIds.get(key) ?? itemIds.get(key.replaceAll('_', ''))
    if (!itemId) { unmapped++; continue }
    p.purchaseEvents.push({ time: Number(e.time) || 0, itemId }); purchases++
  }
  return { playerSlot: slot, purchaseEvents: p.purchaseEvents, abilityUpgrades: p.abilityUpgrades }
})
const path = join(data, 'matches', `${id}.json`)
await writeFile(path, JSON.stringify(match))
const ingestUrl = process.env.REPLAY_INGEST_URL
const ingestToken = process.env.REPLAY_INGEST_TOKEN
if (ingestUrl && ingestToken) {
  const endpoint = new URL(`/api/internal/replay/${id}`, ingestUrl)
  const res = await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${ingestToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ players: replayPlayers }), signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Worker ingest HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  console.log(`Uploaded to Worker: ${await res.text()}`)
}
console.log(JSON.stringify({ matchId: Number(id), purchases, unmappedItems: unmapped }))
