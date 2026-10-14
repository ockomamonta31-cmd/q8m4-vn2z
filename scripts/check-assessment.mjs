import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { buildSync } from 'esbuild'
import { playerEvidence,validEvidence } from '../server/gc/player-evidence.mjs'
import { inferReplayPositions } from '../server/gc/infer-replay-positions.mjs'
import { buildMapPlays } from '../server/gc/map-plays.mjs'
const source=buildSync({entryPoints:['src/api/assessment.ts','src/api/score.ts','src/api/training.ts'],bundle:true,platform:'node',format:'esm',outdir:'out',write:false})
const modules=await Promise.all(source.outputFiles.map(f=>import('data:text/javascript;base64,'+Buffer.from(f.text).toString('base64'))))
const {assessPlayer,referenceGames}=modules[0],{resolveImpact}=modules[1],{trainingFacts}=modules[2]
const replay=JSON.parse(readFileSync('server/data/replays/9038997807.json')), match=JSON.parse(readFileSync('server/data/matches/9038997807.json')),
  heroes=JSON.parse(readFileSync('server/data/constants/heroes.json')),
  roles=inferReplayPositions(match.players,replay.players),plays=buildMapPlays(replay,match,heroes)
const report=[]
for(const p of match.players) {
  const side=match.players.filter(q=>q.isRadiant===p.isRadiant),slot=(p.isRadiant?0:128)+side.indexOf(p),evidence=playerEvidence(replay,slot,p.heroId,heroes)
  assert(validEvidence(evidence));assert(!validEvidence({...evidence,curve:[[0,NaN]]}))
  const row={...p,...roles.get(slot),seasonRank:45,evidence,mapPlays:plays[slot],teamKills:side.reduce((n,p)=>n+p.kills,0),teamDamage:side.reduce((n,p)=>n+p.heroDamage,0)}
  const result=assessPlayer(row,match.durationSeconds,null)
  assert(result&&Math.abs(result.value)<100)
  assert.equal(result.value,result.factors.reduce((n,f)=>n+f.contribution,0))
  assert.equal(resolveImpact(row,match.durationSeconds,null).value,result.value)
  assert.equal(assessPlayer({...row,isVictory:!row.isVictory},match.durationSeconds,null).value,result.value,'final victory must not award score')
  assert.equal(assessPlayer({...row,mapPlays:{...plays[slot],score:100}},match.durationSeconds,null).value,result.value,'episode index must not drive score')
  assert(assessPlayer({...row,deaths:row.deaths+10},match.durationSeconds,null).value<=result.value,'more deaths must not improve score')
  const history=JSON.parse(JSON.stringify(row));assert.equal(resolveImpact(history,match.durationSeconds,45).value,result.value,'history and match use same evidence/score')
  const unknown=assessPlayer({...row,evidence:{...evidence,wards:null,itemUses:null}},match.durationSeconds,null)
  assert(!unknown.factors.some(f=>f.label==='Поддержка без поставленных вардов'),'missing wards are not zero wards')
  const facts=trainingFacts(row,match.durationSeconds,match.players.filter(q=>q.isRadiant!==row.isRadiant))
  assert(facts.some(f=>f.section==='lane'))
  if(row.position>=4) assert(facts.some(f=>f.section==='support'))
  if(slot===129){assert.equal(evidence.lane.attacks,81);assert.equal(evidence.deaths.filter(d=>d.t>=0&&d.t<600).length,3);assert(facts.some(f=>f.title.includes('Desolator')))}
  report.push({heroId:row.heroId,role:row.position,score:result.value,factors:result.factors,missing:result.missing})
}
assert.equal(assessPlayer({},2400,null),null)
assert.equal(assessPlayer({...match.players[0]},0,null),null)
assert(referenceGames.some(r=>r.heroId===34&&r.mapPlays?.coverage>=.9),'actual Tinker spatial example')
assert(referenceGames.every(r=>r.evidence.curve.length&&r.matchId>0))
writeFileSync('.verification/assessment-v5.json',JSON.stringify(report,null,2))
console.log('PASS assessment: five roles, additive factors, no victory/episode shortcut, missingness, measured lane events, identical history contract and actual strong-player trajectories')
