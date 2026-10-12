#!/usr/bin/env node
// Join OpenDota replay purchase logs to Valve match records by player_slot.
// Usage: node server/gc/normalize-replay.mjs MATCH_ID

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inferReplayPositions } from './infer-replay-positions.mjs'
import { buildMatchTimeline } from './build-timeline.mjs'

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
const [match, replay, items, heroes] = await Promise.all([
  readFile(join(data, 'matches', `${id}.json`), 'utf8').then(JSON.parse),
  readFile(join(data, 'replays', `${id}.json`), 'utf8').then(JSON.parse),
  readFile(join(data, 'constants', 'items.json'), 'utf8').then(JSON.parse),
  readFile(join(data, 'constants', 'heroes.json'), 'utf8').then(JSON.parse),
])
const itemIds = new Map(items.flatMap((x) => [[x.shortName, x.id], [x.shortName.replaceAll('_', ''), x.id]]))
if (!Array.isArray(replay.players) || replay.players.length !== 10) throw new Error(`Replay does not contain the expected 10 player records`)
const detectedPositions = inferReplayPositions(match.players, replay.players)
let purchases = 0, unmapped = 0
const phasesFor = (parsed) => {
  const bounds = [[0, 600, 'Начало · 0–10 мин'], [600, 1500, 'Середина · 10–25 мин'], [1500, match.durationSeconds, 'Конец · 25+ мин']]
  const at = (series, seconds) => {
    const times = parsed.times ?? []
    let index = 0
    while (index + 1 < times.length && times[index + 1] <= seconds) index++
    return Number(series?.[index]) || 0
  }
  const count = (events, from, to) => (events ?? []).filter((event) => Number(event.time) >= from && Number(event.time) < to).length
  const fields = [['gold_t', 'gold'], ['networth_t', 'networth'], ['lh_t', 'lastHits'], ['xp_t', 'experience'], ['hero_damage_t', 'heroDamage'], ['tower_damage_t', 'towerDamage']]
  return bounds.filter(([from]) => from < match.durationSeconds).map(([from, rawTo, label]) => {
    const to = Math.min(rawTo, match.durationSeconds)
    const values = { label, kills: count(parsed.kills_log, from, to), deaths: count(parsed.deaths_log, from, to) }
    for (const [series, key] of fields) values[key] = Math.max(0, at(parsed[series], to) - at(parsed[series], from))
    return values
  })
}
const replayPlayers = match.players.map((p) => {
  const side = match.players.filter((q) => q.isRadiant === p.isRadiant)
  const slot = (p.isRadiant ? 0 : 128) + side.indexOf(p)
  const parsed = replay.players.find((x) => Number(x.player_slot) === slot)
  if (!parsed) throw new Error(`Replay lacks player_slot ${slot}`)
  const impactPhases = phasesFor(parsed)
  p.impactPhases = impactPhases
  p.purchaseEvents = []
  for (const e of parsed.purchase_log ?? []) {
    const key = String(e.key ?? '')
    const itemId = itemIds.get(key) ?? itemIds.get(key.replaceAll('_', ''))
    if (!itemId) { unmapped++; continue }
    p.purchaseEvents.push({ time: Number(e.time) || 0, itemId }); purchases++
  }
  const role = detectedPositions.get(slot)
  return { playerSlot: slot, positionVersion: 2, purchaseEvents: p.purchaseEvents, abilityUpgrades: p.abilityUpgrades, impactPhases, ...(role ?? {}) }
})
const path = join(data, 'matches', `${id}.json`)
await writeFile(path, JSON.stringify(match))
const ingestUrl = process.env.REPLAY_INGEST_URL
const ingestToken = process.env.REPLAY_INGEST_TOKEN
if (ingestUrl && ingestToken) {
  const endpoint = new URL(`/api/internal/replay/${id}`, ingestUrl)
  const body = { players: replayPlayers, timeline: buildMatchTimeline(replay, match, heroes) }
  const res = await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${ingestToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Worker ingest HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  console.log(`Uploaded to Worker: ${await res.text()}`)
}
console.log(JSON.stringify({ matchId: Number(id), purchases, unmappedItems: unmapped, positionsDetected: [...detectedPositions.values()].filter((x) => x.positionSource === 'replay').length }))
