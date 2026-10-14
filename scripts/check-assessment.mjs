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
  if(slot===129){
    assert.equal(evidence.lane.attacks,81);assert.equal(evidence.deaths.filter(d=>d.t>=0&&d.t<600).length,3);assert(facts.some(f=>f.title.includes('Desolator')))
    const minute=evidence.laneMinutes.find(m=>m.t===120),death=evidence.deathWindows.find(d=>d.t===509)
    assert.equal(minute.lh,2);assert.equal(minute.attacks,12);assert.equal(minute.aliveSeconds,60)
    assert.equal(death.damage,170);assert.equal(death.taken,733);assert.equal(death.nearestAlly.heroId,27);assert.equal(death.nearestAlly.distance,642)
    const casts=replay.movement.combat.filter(e=>e[1]==='ABILITY'&&e[2]==='npc_dota_hero_clinkz'&&e[5]==='clinkz_strafe')
    assert.equal(evidence.spellWindows.length,casts.length,'each Strafe window has an actual logged cast')
    assert(evidence.spellWindows.every(w=>casts.some(c=>c[0]===w.t)&&w.attacks>0),'this replay does not justify accusations of Strafe without attacks')
    assert(!facts.some(f=>f.title.includes('Strafe без')))
    assert(!validEvidence({...evidence,deathWindows:[{...death,taken:NaN}]}))
    assert(!validEvidence({...evidence,deathWindows:[{...death,nearestAlly:{heroId:-1,distance:600}}]}))
    assert(!validEvidence({...evidence,deathWindows:[{...death,lhNextMinute:-1}]}))
    assert(!validEvidence({...evidence,laneMinutes:[{...minute,aliveSeconds:61}]}))
    assert(result.factors.some(f=>f.detail.includes('Смерти с доступным лечением: данных нет')),'unobserved features are not presented as measured')
    const faster=structuredClone(row);faster.evidence.curve.filter(r=>r[0]>=1500).forEach(r=>r[1]+=3000)
    assert(assessPlayer(faster,match.durationSeconds,null).value>=result.value,'better recovery must not lower assessment')
    assert(!result.factors.some(f=>f.label==='Повторные смерти после байбека'),'dieback already included in execution errors')
  }
  report.push({heroId:row.heroId,role:row.position,score:result.value,factors:result.factors,missing:result.missing})
}
assert.equal(assessPlayer({},2400,null),null)
assert.equal(assessPlayer({...match.players[0]},0,null),null)
assert(referenceGames.some(r=>r.heroId===34&&r.mapPlays?.coverage>=.9),'actual Tinker spatial example')
assert(referenceGames.every(r=>r.evidence.curve.length&&r.matchId>0))
const apiBundle=buildSync({entryPoints:['src/api/index.ts'],bundle:true,platform:'node',format:'esm',define:{'import.meta.env':'{}'},write:false})
const {fetchMatch}=await import('data:text/javascript;base64,'+Buffer.from(apiBundle.outputFiles[0].text).toString('base64'))
const originalFetch=globalThis.fetch
try {
  globalThis.fetch=async()=>Response.json({...match,players:match.players.map((p,i)=>({...p,steamAccountId:i+1,seasonRank:45,evidence:playerEvidence(replay,(p.isRadiant?0:128)+match.players.filter(q=>q.isRadiant===p.isRadiant).indexOf(p),p.heroId,heroes)}))})
  const loaded=await fetchMatch(match.id)
  for(const p of loaded.players) {
    const team=loaded.players.filter(q=>q.isRadiant===p.isRadiant)
    assert.equal(p.teamKills,team.reduce((n,q)=>n+q.kills,0));assert.equal(p.teamDamage,team.reduce((n,q)=>n+q.heroDamage,0))
    assert.equal(resolveImpact(p,loaded.durationSeconds,null).value,resolveImpact({...p,teamKills:team.reduce((n,q)=>n+q.kills,0),teamDamage:team.reduce((n,q)=>n+q.heroDamage,0)},loaded.durationSeconds,null).value,'portrait and detailed assessment share actual team totals')
  }
} finally {globalThis.fetch=originalFetch}
writeFileSync('.verification/assessment-v5.json',JSON.stringify(report,null,2))
console.log('PASS assessment: five roles, additive factors, no victory/episode shortcut, missingness, measured lane events, identical history contract and actual strong-player trajectories')

// Primary coaching is deterministic, bounded and available without model calls.
const bundled=buildSync({entryPoints:['cloudflare/coach.ts'],bundle:true,platform:'node',format:'esm',write:false})
const {coachResponse}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const full={...match,players:match.players.map(p=>{const side=match.players.filter(q=>q.isRadiant===p.isRadiant),slot=(p.isRadiant?0:128)+side.indexOf(p);return {...p,...roles.get(slot),seasonRank:45,evidence:playerEvidence(replay,slot,p.heroId,heroes),mapPlays:plays[slot]}})}
const immediateEnv={DB:{prepare(){throw Error('Coach must not wait for DB budget or cache')}},AI:{run(){throw Error('Coach must not wait for model generation')}}}
for(const slot of [0,1,2,3,4,128,129,130,131,132]) {
  const response=await coachResponse(immediateEnv,full,slot),review=await response.json()
  assert.equal(response.status,200);assert.equal(review.version,10);assert(review.priorities.length<=3)
  assert(review.priorities.every(p=>p.facts.length===1&&p.explanation.length<400))
  assert(!review.priorities.some(p=>/после Orchid|Восстановление|Подключения к дракам/.test(p.title)),'routine context must not fill important-error slots')
  if(slot===129)assert(review.priorities.some(p=>p.facts.some(f=>f.t===120&&f.fact.includes('12 попаданий'))),'concrete low-CS/trading window still included')
}
assert.equal((await coachResponse(immediateEnv,full,99)).status,404)
assert.equal((await coachResponse(immediateEnv,{...full,players:full.players.map(p=>({...p,evidence:null}))},129)).status,409)
console.log('PASS concise coach: bounded concrete issues, no routine context, no model latency or budget dependency, correct player lookup and missing replay')
