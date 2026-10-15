#!/usr/bin/env node
// Parse a bounded batch of replay-ready matches from the Worker cache.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { replayJson } from './replay-http.mjs'
import { createReplayMetadataResolver, replayAgeAction } from './replay-metadata.mjs'

const base=process.env.REPLAY_INGEST_URL
const token=process.env.REPLAY_INGEST_TOKEN
if(!base||!token) throw new Error('REPLAY_INGEST_URL and REPLAY_INGEST_TOKEN are required')
const root=dirname(dirname(fileURLToPath(import.meta.url)))
const data=join(root,'data')
const headers={authorization:`Bearer ${token}`}
const get=path=>replayJson(new URL(path,base),{headers})
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const run=(file,...args)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[join(root,'gc',file),...args],{stdio:'inherit',env:process.env})
  child.once('error',reject)
  child.once('exit',code=>code===0?resolve():reject(new Error(`${file} exited ${code}`)))
})
const status=async(id,state)=>{
  await replayJson(new URL(`/api/internal/replay/${id}/status`,base),{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({state})})
}

const requestedId=process.env.REPLAY_MATCH_ID
// Ручной dispatch умеет список: "123,456". Всё, что не чистые цифры, отбрасываем,
// чтобы в аргументы парсера не попало ничего кроме ID матча.
const requested=(requestedId??'').split(',').map((x)=>x.trim()).filter((x)=>/^\d+$/.test(x))
const {matchIds=[]}=requested.length?{matchIds:requested}:await get('/api/internal/replay/pending?limit=100')
const max=Math.max(1,Number(process.env.REPLAY_MATCHES_PER_RUN)||5)
// Смотрим только на свежие кандидаты. Valve публикует replay_salt не сразу, и
// без окна батч доедал бы очередь до матчей недельной давности, хотя смысл в
// том, чтобы разобрать то, что человек только что сыграл.
const scan=Math.max(max,Number(process.env.REPLAY_SCAN_LIMIT)||40)
const candidates=matchIds.slice(0,scan)

// Valve удаляет реплеи через несколько недель, и для более старых матчей адреса
// не существует уже ни у кого. Держать их в очереди незачем: каждый запуск они
// занимали место в окне скана, которое нужно свежим играм.
const retentionMs=Math.max(1,Number(process.env.REPLAY_RETENTION_DAYS)||21)*86_400_000
// Наш собственный сеанс в координаторе Valve отвечает за секунды, но он же и
// самый хрупкий: Valve ограничивает аккаунт, который спрашивает про всё подряд.
// Поэтому туда идут только те игры, которые сыграны только что.
const gcMaxAgeMs=Math.max(1,Number(process.env.REPLAY_GC_MAX_AGE_HOURS)||24)*3_600_000
const gcLookups=Math.max(0,Number(process.env.REPLAY_GC_LOOKUPS)||4)
// Остальное разбирает OpenDota по запросу: её бот сам забирает адрес в
// координаторе и публикует его за секунды — замерено на матче пятидневной
// давности. Спрашивать имеет смысл всё, что ещё не просрочено, а не только
// считанные часы: очередь из суточных матчей стояла в WAIT, пока запуск за
// запуском перечитывал одни и те же сорок записей без адреса.
const requestLimit=Math.max(0,Number(process.env.REPLAY_REQUEST_LIMIT)||10)
const requestWaitMs=Math.max(0,Number(process.env.REPLAY_REQUEST_WAIT_SECONDS)||120)*1000
const requestPollMs=Math.max(1,Number(process.env.REPLAY_REQUEST_POLL_SECONDS)||10)*1000

const resolved=new Map(), ended=new Map(), paused=[]
let completed=0,noReplay=0,failures=0,expired=0,asked=0,gcUsed=0
const ageMs=id=>{const at=ended.get(id);return at==null?null:Date.now()-at*1000}
const metadata=createReplayMetadataResolver()
const note=async(id,state)=>{ await status(id,state).catch(error=>console.error(`STATUS ${id}: ${error.message}`)) }

async function ingest(id,meta) {
  console.log(`REPLAY ${id}: metadata from ${meta.source}`)
  const match=await get(`/api/internal/replay/match/${id}`)
  if(match.players?.length!==10) throw new Error('Expected ten match players')
  await status(id,'parsing')
  await mkdir(join(data,'matches'),{recursive:true})
  await writeFile(join(data,'matches',`${id}.json`),JSON.stringify(match))
  await run('parse-replay.mjs',String(id),String(meta.cluster),String(meta.replay_salt))
  await run('normalize-replay.mjs',String(id))
  await status(id,'ready')
  completed++
  console.log(`READY ${id}`)
}
async function parse(id,meta) {
  try { await ingest(id,meta) }
  catch(error) {
    failures++
    console.error(`RETRY ${id}: ${error instanceof Error?error.message:'unknown error'}`)
    await note(id,'retry')
  }
}

try {
  // Первый проход: адреса спрашивает только HTTP. Координатор Valve стоит
  // заметно дороже для аккаунта, поэтому вопрос ему задаётся позже и только про
  // те игры, которые всё ещё лежат на его серверах.
  for(const id of candidates) {
    if(resolved.size>=max) break
    try {
      const answer=await metadata.lookup(id,{allowGc:false})
      if(answer.endedAt) ended.set(id,answer.endedAt)
      if(answer.address) { resolved.set(id,answer.address); continue }
      if(replayAgeAction(ageMs(id),retentionMs)==='expired') {
        expired++
        console.log(`EXPIRED ${id}: the replay is older than anyone keeps`)
        await note(id,'expired')
        continue
      }
      // Запуск разбирает столько игр, сколько успевает, поэтому и спрашиваем
      // ровно про столько: у OpenDota каждый запрос — это её парсер, а здесь
      // ещё и ожидание ответа.
      if(paused.length<max&&asked<requestLimit) {
        await metadata.request(id)
        asked++
        paused.push(id)
        console.log(`REQUEST ${id}: asked OpenDota to publish the replay address`)
        continue
      }
      noReplay++
      console.log(`WAIT ${id}: no replay address from available sources`)
      await note(id,'waiting')
    } catch(error) {
      failures++
      console.error(`RETRY ${id}: ${error instanceof Error?error.message:'unknown error'}`)
      await note(id,'retry')
    }
  }
  // Второй проход: свежие матчи, которым OpenDota уже ищет реплей. Ждём их
  // здесь, а не в следующем запуске, потому что это игры, которые человек
  // сыграл только что и разбора которых он ждёт сейчас.
  const waitingFor=paused.slice(0,Math.max(0,max-resolved.size))
  const deadline=Date.now()+requestWaitMs
  while(waitingFor.length&&resolved.size<max&&Date.now()<deadline) {
    let published=false
    for(const id of waitingFor) {
      if(resolved.has(id)) continue
      const answer=await metadata.lookup(id,{allowGc:false})
      if(answer.endedAt) ended.set(id,answer.endedAt)
      if(answer.address) { resolved.set(id,answer.address); published=true; console.log(`PUBLISHED ${id}: OpenDota released the replay address`) }
    }
    if(!published&&Date.now()<deadline) await delay(requestPollMs)
  }
  for(const id of paused) {
    if(resolved.has(id)) continue
    noReplay++
    console.log(`WAIT ${id}: OpenDota has not published the replay address yet`)
    await note(id,'waiting')
  }
  // Третий проход: разбор всего, для чего адрес уже есть. Координатор Valve
  // оставлен напоследок: у него есть собственный бюджет на запуск, и он не
  // должен задерживать игры, которые можно разобрать и без него.
  for(const [id,meta] of resolved) {
    if(completed>=max) break
    await parse(id,meta)
  }
  if(completed<max&&metadata.gcConfigured) for(const id of candidates) {
    if(completed>=max||gcUsed>=gcLookups) break
    if(resolved.has(id)) continue
    const age=ageMs(id)
    // Игру, которую никто не смог датировать, спрашиваем у Valve: именно она
    // скорее всего сыграна только что, а координатор отвечает про неё быстрее
    // остальных источников.
    if(age!=null&&age>gcMaxAgeMs) continue
    gcUsed++
    const meta=await metadata.lookup(id,{allowGc:true}).then(answer=>answer.address).catch(error=>{
      failures++
      console.error(`RETRY ${id}: ${error instanceof Error?error.message:'unknown error'}`)
      return null
    })
    if(meta) await parse(id,meta)
  }
} finally { metadata.close() }
console.log(`INGEST ${completed}/${candidates.length}; без адреса реплея=${noReplay}; запрошено у OpenDota=${asked}; просрочено=${expired}; вопросов к Valve GC=${gcUsed}; ошибок=${failures}; всего в очереди=${matchIds.length}`)
if(failures)process.exitCode=1
