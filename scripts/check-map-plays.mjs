import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { buildMapPlays, validMapPlays } from '../server/gc/map-plays.mjs'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const heroes = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, shortName: 'hero' + (i + 1) }))
const slots = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132]
const match = { durationSeconds: 1800, didRadiantWin: false, players: slots.map((s, i) => ({ isRadiant: s < 128, heroId: i + 1 })) }
const tracks = Object.fromEntries(slots.map(s => [s, Array.from({ length: 901 }, (_, i) => [i * 2, 130, 130, 0, 1000 + i * 10, 0, 0, 0, 0, 0, 0])]))
const heroName = i => 'npc_dota_hero_hero' + i
const event = (t, type, attacker, target, value = 100, hero = true) => [t, type, heroName(attacker), hero ? heroName(target) : target, value, 'test', true, hero, false, false]
const replay = { players: slots.map(player_slot => ({ player_slot })), radiant_gold_adv: Array(31).fill(-10000), objectives: [], movement: {
  version: 1, sampleSeconds: 2, tracks, heroes: Object.fromEntries(slots.map((s, i) => [s, i + 1])), combat: [
    event(590, 'DAMAGE', 1, 6), event(600, 'DEATH', 2, 6),
    event(890, 'DAMAGE', 1, 7), event(900, 'DEATH', 1, 7),
    event(1200, 'DEATH', 8, 1),
    event(1500, 'DAMAGE', 1, 'npc_dota_badguys_tower1_mid', 300, false),
  ],
} }
const score = r => buildMapPlays(r, match, heroes)[0]
let p = score(replay)
assert.equal(p.good, 2); assert.equal(p.bad, 1); assert.equal(p.score, 33)
assert(p.episodes.some(e => e.kind === 'objective' && e.verdict === 0), 'hitting a tower is not destroying it')
assert(validMapPlays(p))
assert(!validMapPlays({ ...p, score: 100 }), 'ingest rejects fabricated score')
assert.equal(score({ ...replay, radiant_gold_adv: Array(31).fill(10000) }).score, p.score, 'losing state grants no automatic bonus')
assert.equal(buildMapPlays(replay, { ...match, didRadiantWin: true }, heroes)[0].score, p.score, 'final outcome grants no bonus')
const far = structuredClone(replay)
far.movement.tracks[0].forEach(p => { p[1] = 65; p[2] = 65 })
assert.equal(score(far).good, 1, 'damage far from the victim does not prove presence; recorded last hit still counts')
const walking = structuredClone(replay)
walking.movement.combat = []
walking.movement.tracks[0].forEach(p => { p[1] += p[0] % 80 })
assert.equal(score(walking).score, null); assert.equal(score(walking).episodes.length, 0, 'movement alone earns no credit')
const tower = structuredClone(replay)
tower.objectives = [{ time: 1510, type: 'building_kill', key: 'npc_dota_badguys_tower1_mid' }]
assert.equal(score(tower).good, 3)
const noCoverage = structuredClone(replay)
noCoverage.movement.tracks[0] = noCoverage.movement.tracks[0].slice(0, 500)
assert.equal(score(noCoverage).score, null, 'incomplete trajectories cannot get a numeric verdict')
assert.equal(buildMapPlays({ players: [] }, match, heroes), null)
assert.equal(buildMapPlays(replay, { ...match, players: match.players.map(p => ({ ...p, heroId: 999 })) }, heroes), null, 'wrong replay is rejected')
const { outputFiles } = buildSync({ entryPoints: ['src/api/score.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { resolveImpact } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'))
const input = {heroId:56,position:1,seasonRank:45,kills:5,deaths:5,assists:4,goldPerMinute:450,experiencePerMinute:500,numLastHits:150,numDenies:5,networth:12000,level:20,heroDamage:15000,towerDamage:1000,heroHealing:0,imp:null,isVictory:false}
assert.equal(resolveImpact({...input,mapPlays:p},1800,null).source,'model')
assert.equal(resolveImpact({...input,mapPlays:{...p,score:100}},1800,null).value,resolveImpact({...input,mapPlays:{...p,score:-100}},1800,null).value,'episode balance must not replace general performance')
assert(resolveImpact({...input,mapPlays:{...p,score:null}},1800,null),'missing movement score must not erase the statistical estimate')
const livePath = 'server/data/replays/9038997807.json'
if (existsSync(livePath)) {
  const r = JSON.parse(readFileSync(livePath)), h = JSON.parse(readFileSync('server/data/constants/heroes.json'))
  const m = JSON.parse(readFileSync('.verification/match-9038997807-live.json', 'utf8').replace(/^\uFEFF/, ''))
  const actual = buildMapPlays(r, m, h)
  assert(Object.values(actual).every(validMapPlays))
  const clinkz = actual[129]
  const towers=clinkz.structures.filter(s=>s.kind==='CDOTA_BaseNPC_Tower')
  assert.equal(towers.length,22);assert.equal(new Set(towers.map(s=>s.key)).size,22,'nearby T4 towers keep distinct identities')
  assert.equal(towers.find(s=>s.key==='npc_dota_badguys_tower1_bot').destroyedAt,711)
  assert(!validMapPlays({...clinkz,structures:[{...towers[0],x:NaN}]}))
  buildSync({entryPoints:['src/components/match/MapPlays.tsx'],bundle:true,platform:'node',format:'cjs',external:['react'],define:{'import.meta.env':'{}'},outfile:'.verification/map-route.cjs'})
  const {mapPoint,Route}=createRequire(import.meta.url)('../.verification/map-route.cjs')
  const radiant=mapPoint(69.75,73.796875),dire=mapPoint(185.875,181.5)
  assert(radiant[0]<60&&radiant[1]>450&&dire[0]>450&&dire[1]<100,'fountains align to opposing terrain corners')
  const episode=clinkz.episodes.find(e=>e.t===2335)
  const html=renderToStaticMarkup(React.createElement(Route,{play:episode,heroId:56,structures:clinkz.structures}))
  assert(html.includes('/assets/map/dota-741.webp'));assert.equal((html.match(/T[1-4], /g)??[]).length,22)
  assert(html.includes('уничтожен в'),'destroyed buildings display the actual destruction time')
  const reference=renderToStaticMarkup(React.createElement(Route,{play:episode,heroId:56}))
  assert(!reference.includes('уничтожен в'),'foreign reference routes never borrow current match destruction state')
  assert(clinkz.episodes.some(e => e.t === 1064 && e.kind === 'rotation' && e.facts.kills === 1))
  assert(clinkz.episodes.some(e => e.t === 2335 && e.kind === 'objective' && e.facts.destroyed))
  assert.equal(clinkz.teamGoldAt15, -6571)
  console.log('PASS live replay: Clinkz trajectories, 17:44 kill, 38:55 T2 pressure, 15-minute deficit')
}
console.log('PASS map plays: movement evidence, actual outcomes, no distance/deficit/win bonus, coverage and validation')
