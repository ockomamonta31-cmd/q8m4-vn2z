// Run: node scripts/check-replay-ingest.mjs
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { buildSync } from 'esbuild'
import { playerEvidence, validEvidence } from '../server/gc/player-evidence.mjs'
import { buildMapPlays } from '../server/gc/map-plays.mjs'
import { buildMatchTimeline } from '../server/gc/build-timeline.mjs'
const heroes=JSON.parse(readFileSync('server/data/constants/heroes.json'))
const combat=Array.from({length:5001},(_,i)=>[i%2350,'ABILITY','npc_dota_hero_invoker','dota_unknown',0,'invoker_exort',true,false,false,false])
const evidence=playerEvidence({players:[{player_slot:0}],movement:{combat}},0,74,heroes)
assert.equal(evidence.uses.length,5001)
assert(validEvidence(evidence),'ordinary Invoker orb casts must not reject a whole replay')
assert(!validEvidence({...evidence,uses:[{t:NaN,key:'invoker_exort',target:'dota_unknown'}]}))
assert(!validEvidence({...evidence,uses:Array(16001).fill(evidence.uses[0])}))
const bundle=buildSync({entryPoints:['cloudflare/worker.ts'],bundle:true,platform:'node',format:'esm',write:false})
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
let queueSQL
const rows=new Map(),env={REPLAY_INGEST_TOKEN:'test',DB:{prepare(sql){if(sql.includes('json_each(cache.value)'))queueSQL=sql;return {args:[],bind(...args){this.args=args;return this},async first(){return rows.get(this.args[0])??null},async all(){return {results:[...rows].filter(([key])=>sql.includes("'history:*'")?key.startsWith('history:'):sql.includes("'match:*'")?key.startsWith('match:'):this.args.includes(key)).map(([key,r])=>{
    if(!sql.includes("json_each(cache.value)"))return {key,...r}
    const data=JSON.parse(r.value),entries=Object.values(data)
    const flags=key.startsWith('replay-data:')?{
      complete:entries.length===10&&entries.every(p=>p.position>=1&&p.position<=5&&p.positionVersion>=2&&p.mapPlays?.version===1&&p.evidence?.version===1&&p.evidence?.microVersion===1&&p.mapPlays?.structures?.length),
      decision:entries.length===10&&entries.every(p=>p.evidence?.decisionVersion===1),
    }:{enriched:!data.teamfights?.length||Array.isArray(data.teamfights[0]?.lines)}
    return {key,value:JSON.stringify(flags)}
  })}},async run(){rows.set(this.args[0],{value:this.args[1],updated_at:this.args[2]});return {success:true}}}},async batch(statements){return Promise.all(statements.map(s=>s.run()))}}}
const request=(path,body,auth=true)=>worker.fetch(new Request('https://test'+path,{method:body?'POST':'GET',headers:{...(auth?{authorization:'Bearer test'}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env)
const slots=[0,1,2,3,4,128,129,130,131,132]
const mapPlays={version:1,heroId:74,sampleSeconds:2,coverage:1,score:null,good:0,bad:0,neutral:0,episodes:[],structures:[{kind:'tower',team:2,x:80,y:80}]}
const payload={players:slots.map(playerSlot=>({playerSlot,position:1,positionVersion:2,evidence:{...evidence,microVersion:1,decisionVersion:1},mapPlays})),timeline:{series:[],teamfights:[]}}
// One busy Invoker + the other nine players, not ten cloned busy Invokers.
payload.players.slice(1).forEach(p=>p.evidence.uses=[])
payload.timeline.padding='x'.repeat(800_000)
assert(Buffer.byteLength(JSON.stringify(payload))>1_000_000)
assert.equal((await request('/api/internal/replay/42',payload,false)).status,401)
assert.equal((await request('/api/internal/replay/42',payload)).status,200,'a replay above the old 1 MB limit uploads')
assert.equal(JSON.parse(rows.get('replay-data:v1:42').value)['0'].evidence.uses.length,5001,'all casts survive upload')
assert.equal((await (await request('/api/matches/42/replay-status')).json()).state,'ready')
const original=rows.get('replay-data:v1:42').value
const bad=structuredClone(payload);bad.players[9].playerSlot=0
assert.equal((await request('/api/internal/replay/42',bad)).status,400)
assert.equal(rows.get('replay-data:v1:42').value,original,'invalid input cannot replace a successful replay')
assert.equal((await request('/api/internal/replay/43/status',{state:'parsing'})).status,200)
assert.equal((await (await request('/api/matches/43/replay-status')).json()).state,'parsing')
rows.get('replay-status:v1:43').updated_at=0
const stale=JSON.parse(rows.get('replay-status:v1:43').value);stale.updatedAt=0;rows.get('replay-status:v1:43').value=JSON.stringify(stale)
assert.equal((await (await request('/api/matches/43/replay-status')).json()).state,'retry','interrupted runners cannot show parsing forever')
rows.set('match:42',{value:'{}',updated_at:Date.now()});rows.set('match:43',{value:'{}',updated_at:Date.now()})
const pending=await (await request('/api/internal/replay/pending')).json()
assert.deepEqual(pending.matchIds,[43],'directly opened matches enter the queue and complete matches leave it')
// Execute the production SQL, not just the mock projection: megabyte replay
// rows must never be returned to the Worker while checking readiness.
const db = new DatabaseSync(':memory:')
db.exec('CREATE TABLE cache(key TEXT PRIMARY KEY,value TEXT)')
for(const [key,row] of rows) db.prepare('INSERT INTO cache VALUES(?,?)').run(key,row.value)
const flags=db.prepare(queueSQL).all('replay-data:v1:43','replay-timeline:v1:43','replay-data:v1:42','replay-timeline:v1:42')
assert.equal(JSON.parse(flags.find(r=>r.key==='replay-data:v1:42').value).complete,1)
assert.equal(JSON.parse(flags.find(r=>r.key==='replay-data:v1:42').value).decision,1)
assert.equal(JSON.parse(flags.find(r=>r.key==='replay-timeline:v1:42').value).enriched,1)
assert(JSON.stringify(flags).length<500,'queue transfers compact flags rather than full replay JSON')
db.close()
const legacy=JSON.parse(original);Object.values(legacy).forEach(p=>delete p.evidence.decisionVersion)
rows.get('replay-data:v1:42').value=JSON.stringify(legacy)
assert.deepEqual((await (await request('/api/internal/replay/pending')).json()).matchIds,[43,42],'recent legacy evidence is regenerated')
rows.get('replay-data:v1:42').value=original
payload.timeline.padding='x'.repeat(1_900_000)
assert.equal((await request('/api/internal/replay/42',payload)).status,413)
assert.equal(rows.get('replay-data:v1:42').value,original)
for(const code of [200,404,502]) {
  const failure=code===502
  const preload=`globalThis.fetch=async url=>String(url).includes('api.opendota.com')?Response.json({}, {status:${code}}):Response.json({ok:true});`
  const run=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(preload),'server/gc/github-ingest.mjs'],{encoding:'utf8',env:{...process.env,REPLAY_INGEST_URL:'https://test',REPLAY_INGEST_TOKEN:'test',REPLAY_MATCH_ID:'42'}})
  assert.equal(run.status,failure?1:0,run.stderr)
  assert.match(run.stdout,failure?/ошибок=1/:/WAIT 42/)
}
// Also exercise actual local replays when available; synthetic checks above
// run in a clean checkout without requiring downloaded match artifacts.
for(const id of [9044601272,9043718539,9042974863,9033240359]) {
  const path=`server/data/replays/${id}.json`
  if(!existsSync(path))continue
  const replay=JSON.parse(readFileSync(path)),match=JSON.parse(readFileSync(`server/data/matches/${id}.json`)),maps=buildMapPlays(replay,match,heroes)
  const players=replay.players.map(p=>({playerSlot:p.player_slot,evidence:playerEvidence(replay,p.player_slot,replay.movement.heroes[p.player_slot],heroes),mapPlays:maps[p.player_slot],position:1,positionVersion:2}))
  assert(players.every(p=>validEvidence(p.evidence)),`actual match ${id}`)
  const actual={players,timeline:buildMatchTimeline(replay,match,heroes)}
  assert.equal((await request(`/api/internal/replay/${id}`,actual)).status,200,`actual replay ${id}`)
  console.log(`PASS actual replay ${id}: ${Buffer.byteLength(JSON.stringify(actual))} bytes, ten players`)
}
console.log('PASS replay ingest: full Invoker casts, large payload, validation, atomic upload, queue, status and visible runner failure')
