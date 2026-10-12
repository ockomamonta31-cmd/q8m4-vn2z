#!/usr/bin/env node
// Parse a bounded batch of replay-ready matches from the Worker cache.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const base=process.env.REPLAY_INGEST_URL
const token=process.env.REPLAY_INGEST_TOKEN
if(!base||!token) throw new Error('REPLAY_INGEST_URL and REPLAY_INGEST_TOKEN are required')
const root=dirname(dirname(fileURLToPath(import.meta.url)))
const data=join(root,'data')
const headers={authorization:`Bearer ${token}`}
const get=async(path)=>{
  const res=await fetch(new URL(path,base),{headers,signal:AbortSignal.timeout(30_000)})
  if(!res.ok) throw new Error(`Worker HTTP ${res.status} (${path})`)
  return res.json()
}
const run=(file,...args)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[join(root,'gc',file),...args],{stdio:'inherit',env:process.env})
  child.once('error',reject)
  child.once('exit',code=>code===0?resolve():reject(new Error(`${file} exited ${code}`)))
})

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
let completed=0, noReplay=0
for(const id of candidates) {
  if(completed>=max) break
  try {
    const metaRes=await fetch(`https://api.opendota.com/api/matches/${id}`,{signal:AbortSignal.timeout(20_000)})
    if(!metaRes.ok) continue
    const meta=await metaRes.json()
    if(!/^\d+$/.test(String(meta.cluster??''))||!/^\d+$/.test(String(meta.replay_salt??''))) { noReplay++; continue }
    const match=await get(`/api/internal/replay/match/${id}`)
    if(match.players?.length!==10) continue
    await mkdir(join(data,'matches'),{recursive:true})
    await writeFile(join(data,'matches',`${id}.json`),JSON.stringify(match))
    await run('parse-replay.mjs',String(id),String(meta.cluster),String(meta.replay_salt))
    await run('normalize-replay.mjs',String(id))
    completed++
    console.log(`READY ${id}`)
  } catch(error) {
    console.error(`RETRY ${id}: ${error instanceof Error?error.message:'unknown error'}`)
  }
}
console.log(`INGEST ${completed}/${candidates.length}; реплей ещё не выложен=${noReplay}; всего в очереди=${matchIds.length}`)
