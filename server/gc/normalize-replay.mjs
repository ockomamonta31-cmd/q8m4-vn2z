#!/usr/bin/env node
// Join OpenDota replay purchase logs to Valve match records by player_slot.
// Usage: node server/gc/normalize-replay.mjs MATCH_ID

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { impactPhases as phasesFor } from './impact-phases.mjs'
import { startingLanes } from './lane-outcome.mjs'
import { inferReplayPositions } from './infer-replay-positions.mjs'
import { buildMatchTimeline } from './build-timeline.mjs'
import { buildMapPlays } from './map-plays.mjs'
import { playerEvidence } from './player-evidence.mjs'
import { replayJson } from './replay-http.mjs'

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
const mapPlays = buildMapPlays(replay, match, heroes)
let purchases = 0, unmapped = 0
const observedLanes = startingLanes(replay)
const replayPlayers = match.players.map((p) => {
  const side = match.players.filter((q) => q.isRadiant === p.isRadiant)
  const slot = (p.isRadiant ? 0 : 128) + side.indexOf(p)
  const parsed = replay.players.find((x) => Number(x.player_slot) === slot)
  if (!parsed) throw new Error(`Replay lacks player_slot ${slot}`)
  const impactPhases = phasesFor(parsed, match.durationSeconds)
  const evidence = playerEvidence(replay, slot, p.heroId, heroes)
  p.evidence = evidence
  p.impactPhases = impactPhases
  p.purchaseEvents = []
  for (const e of parsed.purchase_log ?? []) {
    const key = String(e.key ?? '')
    const itemId = itemIds.get(key) ?? itemIds.get(key.replaceAll('_', ''))
    if (!itemId) { unmapped++; continue }
    p.purchaseEvents.push({ time: Number(e.time) || 0, itemId }); purchases++
  }
  const role = detectedPositions.get(slot)
  return { playerSlot: slot, positionVersion: 2, startingLane: observedLanes.get(slot), purchaseEvents: p.purchaseEvents, abilityUpgrades: p.abilityUpgrades, impactPhases, evidence, mapPlays: mapPlays?.[slot], ...(role ?? {}) }
})
const path = join(data, 'matches', `${id}.json`)
await writeFile(path, JSON.stringify(match))
const ingestUrl = process.env.REPLAY_INGEST_URL
const ingestToken = process.env.REPLAY_INGEST_TOKEN
if (ingestUrl && ingestToken) {
  const endpoint = new URL(`/api/internal/replay/${id}`, ingestUrl)
  const body = { players: replayPlayers, timeline: buildMatchTimeline(replay, match, heroes) }
  const result = await replayJson(endpoint, { method: 'POST', headers: { authorization: `Bearer ${ingestToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  console.log(`Uploaded to Worker: ${JSON.stringify(result)}`)
}
console.log(JSON.stringify({ matchId: Number(id), purchases, unmappedItems: unmapped, positionsDetected: [...detectedPositions.values()].filter((x) => x.positionSource === 'replay').length }))
