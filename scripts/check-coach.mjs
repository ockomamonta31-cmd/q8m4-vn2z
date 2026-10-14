// Run: node scripts/check-coach.mjs — exercise the same modules shipped to the browser.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildSync } from 'esbuild'
const moduleOf = async path => {
  const { outputFiles } = buildSync({ entryPoints: [path], bundle: true, platform: 'node', format: 'esm', write: false })
  return import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'))
}
const { rankTeamfights, keyTeamfight } = await moduleOf('src/api/timeline.ts')
const { reviewLane, reviewFight, reviewMatch, laneMeasurements } = await moduleOf('src/api/coach.ts')
const { evaluateDraft } = await moduleOf('src/api/draftStrength.ts')
const fight = (index, t, swing, gold) => ({ index, t, end: t + 20, swing, deaths: 5, radiantKills: 4, direKills: 1,
  lines: [{ slot: 0, gold, damage: 500, healing: 0, kills: 2, deaths: 0, buybacks: 0 }, { slot: 128, gold: 0, damage: 200, healing: 0, kills: 0, deaths: 1, buybacks: 0 }] })
const base = { series: [], kills: [], structures: [], roshans: [], teamfights: [], durationSeconds: 3000 }
const early = fight(0, 600, 5000, 2000), late = fight(1, 2400, 2000, 5000)
const sample = { ...base, teamfights: [late, early], series: [{t: 600, gold: -2000}, {t: 720, gold: 3000}, {t: 2400, gold: 25000}, {t: 2520, gold: 27000}] }
assert.equal(rankTeamfights(sample)[0].index, 0, 'early state change must outrank larger late gold haul')
assert.equal(keyTeamfight(sample).index, 0)
assert.equal(keyTeamfight({ ...base, teamfights: [fight(0, 2400, 500, 8000)], series: [{t: 2400, gold: 25000}] }), null, 'late cleanup is not automatically decisive')
assert.equal(keyTeamfight({ ...base, teamfights: [{...early, swing: undefined, lines: []}] }), null, 'missing evidence cannot invent a key fight')
const reversal = { ...base, teamfights: [fight(0, 600, 500, 0)], series: [{t: 600, gold: -2000}, {t: 720, gold: 700}, {t: 780, gold: 800}, {t: 840, gold: 1000}] }
assert(keyTeamfight(reversal)?.reasons.some(r => r.includes('сменился лидер')))
const interrupted = { ...reversal, teamfights: [...reversal.teamfights, fight(1, 750, 0, 0)] }
assert(!rankTeamfights(interrupted).find(f => f.index === 0).reasons.some(r => r.includes('сменился лидер')), 'later fights break attribution')
const fort = { ...sample, structures: [{ t: 2425, radiant: true, kind: 'fort' }] }
assert(!rankTeamfights(fort).find(f => f.index === 1).reasons.some(r => r.includes('забрали')), 'end-of-game fort grants no key-fight bonus')
assert.deepEqual(reviewLane({heroId: 1}, null, null).map(n => n.status), ['info'])
assert.equal(reviewMatch({heroId: 1})[0].status, 'info')
assert.equal(laneMeasurements({radiant: [{heroId:1}], dire: [{heroId:2}]}), null)
const noAction = { ...early, lines: [{ slot: 0, kills: 0, deaths: 0, damage: 0, healing: 0, buybacks: 0, gold: 0 }] }
assert(reviewFight({heroId: 1}, rankTeamfights({...base, teamfights:[noAction]})[0], base, 0).some(n => n.advice.includes('это ещё не означает')))
const inconsistent = {...early, lines: [{slot: 0, kills: 0, deaths: 1, damage: 50, healing: 0, buybacks: 1, gold: 0}]}
assert(!reviewFight({heroId:1},rankTeamfights({...base,teamfights:[inconsistent]})[0],base,0).some(n => n.title.includes('повторная смерть')))

const matchPath = '.verification/match-9038997807-spatial-live.json', timelinePath = '.verification/timeline-9038997807-live.json'
if (fs.existsSync(matchPath) && fs.existsSync(timelinePath)) {
  const match = JSON.parse(fs.readFileSync(matchPath)), timeline = JSON.parse(fs.readFileSync(timelinePath))
  const clinkz = match.players.find(p => p.heroId === 56)
  const profile = JSON.parse(fs.readFileSync('server/data/constants/hero_profile.json'))
  const rating = evaluateDraft(profile, match.players, match)
  assert.equal(rating.kitOff, false, 'All Draft is regular hero selection, not Ability Draft')
  assert.equal(evaluateDraft(profile, match.players, {...match, gameMode:'ABILITY_DRAFT'}).kitOff, true)
  assert.equal(evaluateDraft(profile, match.players.map((p,i) => i === 0 ? {...p, lane:undefined, positionSource:'stats'} : p), match).realLanes, false, 'partial inferred lineups must be marked estimates')
  assert.equal(rating.lanes.find(l => l.key === 'offlane').label, 'Верхняя линия')
  const lane = rating.lanes.find(l => [...l.radiant, ...l.dire].some(p => p.heroId === clinkz.heroId))
  assert(reviewLane(clinkz, lane, timeline).some(n => n.title.includes('просела')))
  assert(reviewMatch(clinkz).some(n => n.status === 'good'))
  assert(reviewMatch(clinkz).some(n => n.fact.includes('-6')))
  for (const p of match.players) {
    assert(reviewLane(p, null, timeline).length > 0)
    assert(reviewMatch(p).every(n => n.fact && n.advice))
  }
  console.log('Actual match key fight:', keyTeamfight(timeline)?.t ?? 'none', 'last fight:', Math.max(...timeline.teamfights.map(f => f.t)))
  assert.notEqual(keyTeamfight(timeline)?.t, Math.max(...timeline.teamfights.map(f => f.t)), 'terminal fight in this established lead must not be labelled key')
  console.log('Top fight times:', rankTeamfights(timeline).slice(0,3).map(f => ({t:f.t, weight:Math.round(f.weight * 10)/10, key:f.keyCandidate})))
}
console.log('PASS coach: early vs late, reversal, missing evidence, overlap, fort, personal review and real replay')
