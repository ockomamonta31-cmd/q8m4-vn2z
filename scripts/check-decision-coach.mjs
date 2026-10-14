// Decision coaching must use conditions before contact, not the death's outcome.
import assert from 'node:assert/strict'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import {buildSync} from 'esbuild'
import {playerEvidence,validEvidence} from '../server/gc/player-evidence.mjs'
const heroes=JSON.parse(readFileSync('server/data/constants/heroes.json'))
const bundle=buildSync({entryPoints:['src/api/training.ts','cloudflare/coach.ts'],bundle:true,platform:'node',format:'esm',outdir:'out',write:false})
const [training,coach]=await Promise.all(bundle.outputFiles.map(f=>import('data:text/javascript;base64,'+Buffer.from(f.text).toString('base64'))))
const ids={0:145,1:27,2:135,3:4,4:3,128:39,129:12,130:49,131:68,132:20}
const slots=Object.keys(ids).map(Number)
const name=id=>'npc_dota_hero_'+heroes.find(h=>h.id===id).shortName
const hit=(t,id,key,value=0,illusion=false)=>[t,value?'DAMAGE':'ABILITY',name(id),name(12),value,key,true,true,false,illusion]
const replay={players:slots.map(player_slot=>({player_slot,...(player_slot===129?{times:[0,60],lh_t:[0,20],xp_t:[0,400],deaths_log:[{time:40,key:name(27)}]}:{})})),movement:{sampleSeconds:2,heroes:ids,
  tracks:Object.fromEntries(slots.map(s=>[s,Array.from({length:51},(_,i)=>[i*2,s===129?100:s<128?105:170,100,0,0,0,i,0,0,0,0])])),
  heroState:{129:[[26,800,900]]},combat:[hit(32,27,'shadow_shaman_voodoo'),hit(34,145,'kez_echo_slash',300),hit(35,27,'shadow_shaman_shackles',100),hit(36,145,'kez_echo_slash',9999,true),hit(38,39,'queenofpain_scream_of_pain',600)]}}
const e=playerEvidence(replay,129,12,heroes),d=e.deathWindows[0]
assert(validEvidence(e));assert.equal(d.taken,400,'illusion and allied damage excluded')
assert.equal(d.decision.t,26);assert.equal(d.decision.attackStart,32);assert.equal(d.decision.health,800)
assert.equal(d.decision.nearbyAllies,0);assert.deepEqual(d.decision.attackers.map(a=>a.heroId),[27,145])
const player={heroId:12,position:1,isRadiant:false,seasonRank:0,evidence:e}
const opponents=[{heroId:145,lane:'mid',isRadiant:true}]
const detail=training.deathDetail(player,d,opponents)
assert(detail.decisionRisk);assert.match(detail.fact,/вражеский мидер Kez/)
assert.match(detail.fact,/HP 800\/900/);assert.match(detail.advice,/Hex → Shackles/)
assert.match(detail.advice,/Если мидер пропал/);assert.match(detail.advice,/не выходи один/)
assert(!detail.advice.includes('одного-двух ударов'))
assert(!detail.fact.includes('мидера не было видно'),'unknown visibility cannot be inferred from omniscient positions')
const later=structuredClone(replay)
later.movement.tracks[128].filter(p=>p[0]>=32).forEach(p=>p[1]=101)
assert.deepEqual(playerEvidence(later,129,12,heroes).deathWindows[0].decision,d.decision,'later rescue positions cannot leak into pre-contact evidence')
const nearby=structuredClone(replay);nearby.movement.tracks[128].forEach(p=>p[1]=104)
const available=playerEvidence(nearby,129,12,heroes).deathWindows[0]
assert.equal(available.decision.nearbyAllies,1);assert(!training.deathDetail(player,available).decisionRisk,'an available ally is not solo exposure')
const missing=structuredClone(replay);delete missing.movement.tracks[128]
const unknown=playerEvidence(missing,129,12,heroes).deathWindows[0]
assert.equal(unknown.decision.nearbyAllies,null);assert(!training.deathDetail(player,unknown).decisionRisk)
const noHealth=structuredClone(replay);delete noHealth.movement.heroState
assert.equal(playerEvidence(noHealth,129,12,heroes).deathWindows[0].decision.health,null)
for(const changes of [{t:33},{nearbyAllies:5},{health:NaN},{attackers:[{heroId:145,firstContact:41}]}])assert(!validEvidence({...e,deathWindows:[{...d,decision:{...d.decision,...changes}}]}),'invalid decision evidence rejected')
const match={id:42,durationSeconds:100,players:slots.map(s=>s===129?player:{heroId:ids[s],isRadiant:s<128,position:s===0?2:4,lane:s===0?'mid':undefined})}
const DB={prepare(sql){return {bind(){return this},async first(){return sql.startsWith('INSERT')?{value:300}:null},async run(){}}}}
const fallback=await(await coach.coachResponse({DB,AI:{run:async()=>{throw Error('Deliberate failure')}}},match,129)).json()
assert(fallback.priorities[0].facts[0].decisionRisk);assert.match(fallback.priorities[0].explanation,/Hex → Shackles/)
const facts=training.trainingFacts(player,100,opponents)
const response=await(await coach.coachResponse({DB,AI:{run:async()=>({response:{summary:'Нужно проверить условия выхода к волне. Для следующего решения выбери безопасный маршрут.',priorities:Array.from({length:4},(_,i)=>({factIds:[facts[i%facts.length].id],title:'Решение на линии',explanation:'Перед подходом к волне проверь условия получения опыта и положение команды. Сопоставь это решение с доступным отходом, чтобы сохранить возможность безопасно продолжать фарм.',nextGame:'Останови реплей перед подходом к волне и проверь расстояние до команды.'}))}})}},match,129)).json()
assert.equal(response.model,'GLM 4.7 Flash');assert(response.priorities[0].facts[0].decisionRisk,'accepted model output cannot bury the verified gank')
assert.match(response.priorities[0].explanation,/не выходи один/)
const actual='server/data/replays/9044688469.json'
if(existsSync(actual)){
  const r=JSON.parse(readFileSync(actual)),m=JSON.parse(readFileSync('server/data/matches/9044688469.json'))
  const evidence=playerEvidence(r,129,12,heroes),death=evidence.deathWindows.find(d=>d.t===524)
  assert(validEvidence(evidence));assert.equal(death.decision.t,510);assert.equal(death.decision.attackStart,516)
  assert.equal(death.decision.nearbyAllies,0);assert(death.decision.nearestAlly.distance>9000)
  assert.deepEqual(death.decision.attackers.map(a=>a.heroId),[135,27,145]);assert.equal(death.decision.health,868)
  assert.equal(death.decision.maxHealth,868);assert(death.taken<2063)
  const note=training.deathDetail(m.players.find(p=>p.heroId===12),death,m.players.filter(p=>p.isRadiant))
  assert.match(note.fact,/вражеский мидер Kez/)
  writeFileSync('.verification/decision-9044688469.json',JSON.stringify({death,note},null,2))
  const full={...m,players:m.players.map(p=>{const s=(p.isRadiant?0:128)+m.players.filter(q=>q.isRadiant===p.isRadiant).indexOf(p);return {...p,evidence:playerEvidence(r,s,p.heroId,heroes)}})}
  for(const slot of slots){let sent=false;const result=await coach.coachResponse({DB,AI:{run:async(_,input)=>{sent=true;assert(new TextEncoder().encode(input.messages.map(m=>m.content).join('')).length<=28000);throw Error('Deliberate context check')}}},full,slot);assert(sent,`actual slot ${slot} fits model context`);assert.equal(result.status,200)}
  console.log(`PASS actual PL 8:44: decision 8:30, nearest ally ${death.decision.nearestAlly.distance}, real damage ${death.taken}`)
}
console.log('PASS decision coaching: pre-contact isolation, chain control, missing-mid condition, illusion filtering, missingness, future leakage, validation and prominent grounded advice')
