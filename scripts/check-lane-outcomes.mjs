import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { startingLanes, laneOutcome } from '../server/gc/lane-outcome.mjs'
import { impactPhases } from '../server/gc/impact-phases.mjs'
const phase = (gold, experience = gold) => [{ label: 'Начало · 0–10 мин', endSeconds: 600, gold, experience }]
const players = Array.from({ length: 10 }, (_, i) => ({ heroId: i + 1, isRadiant: i < 5,
  startingLane: ['mid', 'top', 'top', 'bottom', 'bottom'][i % 5], impactPhases: phase(2000), isVictory: i < 5 }))
const result = () => laneOutcome(players, players[0], 2000)
assert.equal(result().result, 'draw')
for (const [ratio, expected] of [[1.1, 'draw'], [1.12, 'win'], [1.5, 'stomp'], [.89, 'loss'], [.65, 'stomp_loss']]) {
  players[0].impactPhases = phase(2000 * ratio)
  assert.equal(result().result, expected)
  assert.equal(laneOutcome(players, players[5], 2000).score, -result().score)
}
players[0].impactPhases = phase(5000, 1500)
assert.equal(result().result, 'win', 'gold alone cannot be a stomp when XP is behind')
const before = result()
players.forEach(p => p.isVictory = !p.isVictory)
assert.deepEqual(result(), before, 'final victory is independent')
assert.equal(laneOutcome(players, players[0], 599), null)
players[0].impactPhases[0].endSeconds = 540
assert.equal(result(), null, 'truncated replay is not a ten-minute measurement')
players[0].impactPhases = phase(2000)
delete players[0].startingLane
assert.equal(result(), null)
players[0].startingLane = 'mid'
players[1].impactPhases = phase(3500)
assert.deepEqual(laneOutcome(players, players[1], 2000), laneOutcome(players, players[2], 2000), 'support shares lane verdict')
const ambiguous = { players: [{ player_slot: 0, lane_pos: { 90: { 160: 100 }, 160: { 90: 100 } } }] }
assert.equal(startingLanes(ambiguous).size, 0)
for (const id of ['9044688469', '9044601272']) {
  if (!existsSync(`server/data/replays/${id}.json`)) continue
  const match = JSON.parse(readFileSync(`server/data/matches/${id}.json`))
  const replay = JSON.parse(readFileSync(`server/data/replays/${id}.json`))
  const lanes = startingLanes(replay), order = { r: 0, d: 0 }
  const normalized = match.players.map(p => {
    const slot = p.isRadiant ? order.r++ : 128 + order.d++
    return { ...p, startingLane: lanes.get(slot), impactPhases: impactPhases(replay.players.find(x => x.player_slot === slot), match.durationSeconds) }
  })
  assert.equal(lanes.size, 10)
  const me = normalized.find(p => p.steamAccountId === 1858036696)
  const measured = laneOutcome(normalized, me, match.durationSeconds)
  assert(measured)
  assert.deepEqual(laneOutcome(JSON.parse(JSON.stringify(normalized)), { ...me }, match.durationSeconds), measured, 'history and full match serialization agree')
  if (id === '9044688469') {
    assert.equal(measured.result, 'loss')
    assert.equal(measured.goldDelta, -1500)
    assert.deepEqual(measured.allyHeroIds, [12, 68], 'PL + AA, not a farm-ranked PL + Venge duo')
    assert.deepEqual(measured.enemyHeroIds, [27, 135])
  }
  console.log(id, measured)
}
console.log('Lane outcomes: thresholds, symmetry, missing data, groups and real fixtures passed')
