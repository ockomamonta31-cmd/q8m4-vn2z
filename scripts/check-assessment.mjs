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

// An actual model adapter must not publish fabricated lane deaths, even when
// the invented number appears as part of a timestamp in its cited evidence.
const bundled=buildSync({entryPoints:['cloudflare/coach.ts'],bundle:true,platform:'node',format:'esm',write:false})
const {coachResponse}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
const full={...match,players:match.players.map(p=>{const side=match.players.filter(q=>q.isRadiant===p.isRadiant),slot=(p.isRadiant?0:128)+side.indexOf(p);return {...p,...roles.get(slot),seasonRank:45,evidence:playerEvidence(replay,slot,p.heroId,heroes),mapPlays:plays[slot]}})}
const bad={summary:'Разбор линии',priorities:[{factIds:['F1'],title:'Смерти на линии',explanation:'На линии ты допустил 5 смертей. Это потеряло время получения опыта. Перед следующим разменом нужно проверить расстояние до партнёра и возможность отойти, а после смерти спокойно вернуться к безопасной волне.',nextGame:'Выбери первую смерть на линии и проверь момент, в который ещё мог вернуться к партнёру.'}]}
const fakeDB={prepare(sql){return {bind(){return this},async first(){return sql.startsWith('INSERT')?{value:300}:null},async run(){}}}}
bad.priorities=[1,2,3,4].map(i=>({...bad.priorities[0],factIds:['F1','F'+i],title:'Разбор эпизода '+i}))
const rejected=await (await coachResponse({DB:fakeDB,AI:{run:async()=>({response:bad})}},full,129)).json()
assert.equal(rejected.model,'Разбор по подтверждённым событиям')
assert(rejected.priorities.some(p=>p.facts.some(f=>f.t===509&&f.fact.includes('733'))),'fallback explains a specific measured lane death')
assert(rejected.priorities.some(p=>p.facts.some(f=>f.t===120&&f.fact.includes('12 обычных'))),'fallback includes the concrete CS/trading window')
const valid={...bad,priorities:[1,2,3,4].map(i=>({...bad.priorities[0],factIds:['F1','F'+i],title:'Разбор эпизода '+i,explanation:bad.priorities[0].explanation.replace('5 смертей','3 смерти')}))}
const accepted=await (await coachResponse({DB:fakeDB,AI:{run:async()=>({response:valid})}},full,129)).json()
assert.equal(accepted.model,'GLM 4.7 Flash')
const summaryRejected=await (await coachResponse({DB:fakeDB,AI:{run:async()=>({response:{...valid,summary:'На линии было 5 смертей.'}})}},full,129)).json()
assert.equal(summaryRejected.model,'Разбор по подтверждённым событиям','uncited summary must not bypass fact checks')
const onePriority=await (await coachResponse({DB:fakeDB,AI:{run:async()=>({response:{...valid,priorities:[valid.priorities[0]]}})}},full,129)).json()
assert.equal(onePriority.model,'Разбор по подтверждённым событиям','incomplete generic answer must not replace concrete event coaching')
const generic=await (await coachResponse({DB:fakeDB,AI:{run:async()=>({response:{...valid,priorities:valid.priorities.map(p=>({...p,nextGame:'В следующей игре старайся получать больше опыта и урона на линии.'}))}})}},full,129)).json()
assert.equal(generic.model,'Разбор по подтверждённым событиям','generic exercise rejected')
console.log('PASS coach grounding: object response format, cited facts, fabricated death count rejected, truthful fallback and valid response accepted')
for(const slot of [0,1,2,3,4,128,129,130,131,132]) {
  let sent=false
  const response=await coachResponse({DB:fakeDB,AI:{run:async(_,input)=>{
    const context=JSON.parse(input.messages[1].content)
    assert.equal(context.hero,heroes.find(h=>h.id===full.players[(slot<128?slot:slot-123)].heroId).displayName)
    assert(context.lane.every(r=>r.hero&&r.heroId>0&&r.specs),'lane spells belong to the actual heroes')
    assert(new TextEncoder().encode(input.messages.map(m=>m.content).join('')).length<=28000)
    sent=true;throw Error('Deliberate generation failure')
  }}},full,slot)
  assert(sent,'all player contexts fit the free model budget');assert.equal(response.status,200)
}
console.log('PASS coach contexts: named heroes, correct lane spell kits, bounded UTF-8 context for every role')
