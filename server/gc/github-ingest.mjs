#!/usr/bin/env node
// Parse a bounded batch of replay-ready matches from the Worker cache.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { replayJson } from './replay-http.mjs'
import { createReplayMetadataResolver, isThrottled, replayAgeAction } from './replay-metadata.mjs'

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

const numeric=value=>String(value).trim().match(/^\d+$/)?.[0]
// `Number(x)||default` превращает явный ноль в дефолт, а ноль здесь и есть
// главный переключатель: выключить запросы к OpenDota или к координатору.
// Проверено на живом запуске — REPLAY_REQUEST_LIMIT=0 всё равно ходил в провайдер.
const num=(name,def,min=0)=>{
  const raw=process.env[name]
  if(raw===undefined||String(raw).trim()==='') return def
  const value=Number(raw)
  return Number.isFinite(value)?Math.max(min,value):def
}
const requestedId=process.env.REPLAY_MATCH_ID
// Ручной dispatch умеет список: "123,456". Всё, что не чистые цифры, отбрасываем,
// чтобы в аргументы парсера не попало ничего кроме ID матча.
const requested=(requestedId??'').split(',').map(numeric).filter(Boolean)
// Будильник от открытой страницы тоже указывает матч: без него запуск, который
// разбудил человек, уходит разбирать голову очереди, а не его игру.
const dispatched=(()=>{
  const raw=process.env.REPLAY_DISPATCH_MATCH_IDS
  try { const value=JSON.parse(raw??'[]'); return Array.isArray(value)?value:[] }
  catch { return String(raw??'').split(',') }
})()
const pinned=[...new Set([...requested,...dispatched.map(numeric).filter(Boolean)])]
const max=num('REPLAY_MATCHES_PER_RUN',5,1)
// Смотрим только на свежие кандидаты. Valve публикует replay_salt не сразу, и
// без окна батч доедал бы очередь до матчей недельной давности, хотя смысл в
// том, чтобы разобрать то, что человек только что сыграл.
const scan=Math.max(max,num('REPLAY_SCAN_LIMIT',40,1))
const {matchIds:queued=[]}=requested.length?{matchIds:[]}:await get('/api/internal/replay/pending?limit=200')
// Названный матч идёт в голове, а очередь — сразу за ним: адреса у названного
// ещё может не быть, и тогда запуск разбирает то, что уже опубликовано, вместо
// того чтобы просто выдохнуть окно ожидания.
const candidates=[...new Set([...pinned,...queued])].slice(0,Math.max(scan,pinned.length))

// Valve удаляет реплеи через несколько недель, и для более старых матчей адреса
// не существует уже ни у кого. Держать их в очереди незачем: каждый запуск они
// занимали место в окне скана, которое нужно свежим играм.
const retentionMs=num('REPLAY_RETENTION_DAYS',21,1)*86_400_000
// Наш собственный сеанс в координаторе Valve отвечает за секунды, но он же и
// самый хрупкий: Valve ограничивает аккаунт, который спрашивает про всё подряд.
// Поэтому туда идут только те игры, которые сыграны только что.
const gcMaxAgeMs=num('REPLAY_GC_MAX_AGE_HOURS',24,1)*3_600_000
const gcLookups=num('REPLAY_GC_LOOKUPS',4)
// Остальное разбирает OpenDota по запросу: её бот сам забирает адрес в
// координаторе и публикует его за секунды — замерено на матче пятидневной
// давности. Спрашивать имеет смысл всё, что ещё не просрочено, а не только
// считанные часы: очередь из суточных матчей стояла в WAIT, пока запуск за
// запуском перечитывал одни и те же сорок записей без адреса.
const requestLimit=num('REPLAY_REQUEST_LIMIT',10)
const requestWaitMs=num('REPLAY_REQUEST_WAIT_SECONDS',120)*1000
// Каждый опрос — это запрос к OpenDota, а её квота общая на адрес раннера.
// Адрес реплея публикуется примерно через минуту и ждать его чаще, чем раз в
// двадцать секунд, нечего.
const requestPollMs=num('REPLAY_REQUEST_POLL_SECONDS',20,1)*1000
// Опрашивать ровно столько игр, сколько запуск разберёт, — значит разбирать
// одну: из сорока просмотренных адрес обычно есть у единицы, а остальные сорок
// батч уже не смотрит. Опрос стоит один запрос OpenDota, чья суточная квота
// видна в заголовках, поэтому бюджет проб привязываем к квоте, а не к лимиту
// разбора.
const probeBudget=Math.max(max,num('REPLAY_PROBE_BUDGET',max*3,1))
const quotaFloor=num('REPLAY_QUOTA_FLOOR',150)

const resolved=new Map(), ended=new Map(), paused=[]
let completed=0,noReplay=0,failures=0,throttled=0,expired=0,asked=0,gcUsed=0,gcSilent=0,probed=0
const queuedCount=queued.length
const ageMs=id=>{const at=ended.get(id);return at==null?null:Date.now()-at*1000}
const metadata=createReplayMetadataResolver()
const note=async(id,state)=>{ await status(id,state).catch(error=>console.error(`STATUS ${id}: ${error.message}`)) }
// A provider that asked us to slow down has not failed, and a batch that only
// ran into that has nothing to apologise for: the matches stay queued and the
// next run picks them up. Counting it as a failure painted every other run red
// and hid the runs that really did break.
const report=async(id,error)=>{
  const message=error instanceof Error?error.message:'unknown error'
  if(isThrottled(error)) { throttled++; console.error(`THROTTLE ${id}: ${message}`) }
  else { failures++; console.error(`RETRY ${id}: ${message}`) }
  await note(id,'retry')
}

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
  // Возраст кандидатов приходит из нашего кэша одним запросом: у OpenDota это
  // её квота, а очередь наполовину состоит из матчей, чьи реплеи Valve уже
  // удалил. Просроченное отсекаем по своему кэшу, не спрашивая провайдеров.
  const ages=await get(`/api/internal/replay/ages?ids=${candidates.join(',')}`).then(x=>x.ages??{}).catch(()=>({}))
  for(const [id,at] of Object.entries(ages)) ended.set(Number(id),Number(at))
  // Провайдеров опрашиваем с запасом против лимита разбора: адрес из очереди
  // обычно есть у одной игры из сорока, и батч, который смотрит ровно столько,
  // сколько разбирает, разбирает одну.
  for(const id of candidates) {
    if(resolved.size>=max) break
    if(replayAgeAction(ageMs(id),retentionMs)==='expired') {
      expired++
      console.log(`EXPIRED ${id}: the replay is older than anyone keeps`)
      await note(id,'expired')
      continue
    }
    if(probed>=probeBudget||metadata.remainingQuota()!==null&&metadata.remainingQuota()<=quotaFloor) continue
    probed++
    try {
      const answer=await metadata.lookup(id,{allowGc:false})
      if(answer.endedAt) ended.set(id,answer.endedAt)
      if(answer.address) { resolved.set(id,answer.address); continue }
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
      await report(id,error)
    }
  }
  // Второй проход: свежие матчи, которым OpenDota уже ищет реплей. Ждём их
  // здесь, а не в следующем запуске, потому что это игры, которые человек
  // сыграл только что и разбора которых он ждёт сейчас.
  const waitingFor=paused.slice(0,Math.max(0,max-resolved.size))
  const deadline=Date.now()+requestWaitMs
  // A provider that fell over between the passes cannot publish anything during
  // this wait either, and the coordinator pass is still ahead of us: waiting out
  // the whole window would only cost the matches it could still parse.
  let providerAlive=true
  while(waitingFor.length&&resolved.size<max&&providerAlive&&Date.now()<deadline) {
    let published=false
    for(const id of waitingFor) {
      if(resolved.has(id)) continue
      const answer=await metadata.lookup(id,{allowGc:false}).catch(async error=>{
        // A provider asking us to slow down is still a provider we are waiting
        // on, unlike one that fell over: ending the wait early would throw away
        // the very window in which it can still publish this address.
        if(!isThrottled(error)) providerAlive=false
        await report(id,error)
        return null
      })
      if(!answer) continue
      if(answer.endedAt) ended.set(id,answer.endedAt)
      if(answer.address) { resolved.set(id,answer.address); published=true; console.log(`PUBLISHED ${id}: OpenDota released the replay address`) }
    }
    if(!published&&providerAlive&&Date.now()<deadline) await delay(requestPollMs)
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
    const answer=await metadata.lookup(id,{allowGc:true}).catch(error=>{
      report(id,error)
      return null
    })
    // Молчание координатора — не «реплея нет», а «мы не спросили». Разница
    // стоит того, чтобы быть в сводке: без неё мёртвая ветка выглядела
    // отвечавшей.
    if(answer?.gcError) { gcSilent++; console.error(`GC ${id}: ${answer.gcError}`) }
    else if(answer && !answer.address) console.log(`GC ${id}: state=${answer.gcState??'неизвестен'}, адреса нет`)
    const meta=answer?.address??null
    if(meta) await parse(id,meta)
  }
} finally { metadata.close() }
console.log(`INGEST ${completed}/${candidates.length}; опрос=${probed}; без адреса реплея=${noReplay}; запрошено у OpenDota=${asked}; просрочено=${expired}; вопросов к Valve GC=${gcUsed}; без ответа Valve GC=${gcSilent}; ошибок=${failures}; приторможено=${throttled}; всего в очереди=${queuedCount}; квота OpenDota=${metadata.remainingQuota()??'неизвестна'}`)
if(failures)process.exitCode=1
