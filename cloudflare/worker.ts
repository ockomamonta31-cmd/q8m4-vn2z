/// <reference types="@cloudflare/workers-types" />
import heroes from '../server/data/constants/heroes.json'
import items from '../server/data/constants/items.json'
import { createRankResolver, rankFields, validRank } from '../server/player-ranks.mjs'
import { validMapPlays } from '../server/gc/map-plays.mjs'
import { validEvidence } from '../server/gc/player-evidence.mjs'
import { coachResponse } from './coach'

interface Env { DB: D1Database; AI?: Ai; ASSETS: Fetcher; STEAM_WEB_API_KEY: string; AUTH_SECRET?: string; STRATZ_API_TOKEN?: string; REPLAY_INGEST_TOKEN?: string; GITHUB_DISPATCH_TOKEN?: string; GITHUB_REPO?: string; REPLAY_MATCHES_PER_RUN?: string }
const PRIVATE_ID = 0xffffffff
const modes: Record<number, string> = { 1:'ALL_PICK',2:'CAPTAINS_MODE',3:'RANDOM_DRAFT',4:'SINGLE_DRAFT',5:'ALL_RANDOM',11:'MID_ONLY',12:'LEAST_PICKED',13:'LIMITED_HEROES',16:'CAPTAINS_DRAFT',17:'BALANCED_DRAFT',18:'ABILITY_DRAFT',19:'EVENT',20:'ARDM',21:'ONE_VS_ONE_MID',22:'ALL_DRAFT',23:'TURBO',24:'MUTATION',25:'COACHES_CHALLENGE' }
const lobbies: Record<number, string> = { 0:'PUBLIC_MATCH',1:'PRACTICE',7:'RANKED',8:'MID_ONE',9:'COMPETITIVE' }

async function cached<T>(env: Env, key: string, ttl = Infinity): Promise<T | null> {
  const row = await env.DB.prepare('SELECT value, updated_at FROM cache WHERE key=?').bind(key).first<{value:string;updated_at:number}>()
  if (!row || Date.now() - row.updated_at > ttl) return null
  try { return JSON.parse(row.value) as T } catch { return null }
}
async function cachedPrevious<T>(env: Env, key: string): Promise<T | null> {
  const row = await env.DB.prepare('SELECT value FROM cache WHERE key=?').bind(key).first<{value:string}>()
  try { return row ? JSON.parse(row.value) as T : null } catch { return null }
}
async function save(env: Env, key: string, value: unknown) {
  await env.DB.prepare('INSERT OR REPLACE INTO cache(key,value,updated_at) VALUES(?,?,?)').bind(key, JSON.stringify(value), Date.now()).run()
}
const rankResolvers = new WeakMap<Env, ReturnType<typeof createRankResolver>>()
function rankResolver(env: Env) {
  let resolver = rankResolvers.get(env)
  if (!resolver) {
    resolver = createRankResolver({
      read: async (id: number | string) => {
        const value = await cachedPrevious<any>(env, 'rank:v1:' + id)
        const missing = !value || Date.now() - value.fetchedAt > 24 * 3600_000 || (value.tier === 0 && Date.now() - value.checkedAt > 3600_000) || (String(id).startsWith('match-') && !value.players?.length)
        if (missing && !await cachedPrevious(env, 'rank-pending:v1:' + id)) {
          await save(env, 'rank-pending:v1:' + id, { key: String(id) })
        }
        return value
      },
      write: (id: number, value: unknown) => save(env, 'rank:v1:' + id, value),
    })
    rankResolvers.set(env, resolver)
  }
  return resolver
}
const ranks = (env: Env, ids: number[]) => rankResolver(env)(ids)
const rankedMatch = (env: Env, value: any) => rankResolver(env).forMatch(value)
async function steam(env: Env, endpoint: string, params: Record<string, string | number>) {
  if (!env.STEAM_WEB_API_KEY) throw new Response(JSON.stringify({error:'Добавь STEAM_WEB_API_KEY в Worker secrets'}), {status:503})
  const url = new URL(`https://api.steampowered.com/${endpoint}`)
  url.searchParams.set('key', env.STEAM_WEB_API_KEY)
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url)
  if (!res.ok) throw new Response(JSON.stringify({error:`Steam API HTTP ${res.status}`}), {status:res.status === 401 ? 401 : 502})
  return res.json<any>()
}
async function history(env: Env, account: number) {
  const key=`history:${account}`
  const hit = await cached<{rows:{id:number;seq:number}[];total:number}>(env,key,300_000)
  if (hit) return hit
  const previous=await cachedPrevious<{rows:{id:number;seq:number}[]}>(env,key)
  const known=new Set(previous?.rows.map(x=>x.id)??[])
  const rows:{id:number;seq:number}[]=[]; let cursor=0; let total=0
  for(let page=0;page<5;page++) {
    const p:Record<string,string|number>={account_id:account,matches_requested:100}
    if(cursor) p.start_at_match_id=cursor
    const data=await steam(env,'IDOTA2Match_570/GetMatchHistory/v1/',p)
    const result=data.result??{}; total=result.total_results??rows.length
    const batch=result.matches??[]
    for(const m of batch) rows.push({id:m.match_id,seq:m.match_seq_num})
    if(batch.length<100 || !batch.length) break
    cursor=batch[batch.length-1].match_id
  }
  // Histories overlap almost completely between refreshes. Keep the stable
  // sequence index, but only insert newly-seen IDs; REPLACE rewrote ~500 D1
  // rows on every five-minute cache expiry.
  const fresh=rows.filter(x=>x.seq&&!known.has(x.id))
  if(fresh.length) await env.DB.batch(fresh.map(x=>env.DB.prepare('INSERT OR IGNORE INTO cache(key,value,updated_at) VALUES(?,?,?)').bind(`seq:${x.id}`,JSON.stringify(x.seq),Date.now())))
  const out={rows,total:total||rows.length}; await save(env,key,out); return out
}
function normalize(raw:any) {
  const dur=Math.max((raw.duration??0)/60,1)
  const players=(raw.players??[]).map((p:any)=>{
    const radiant=(p.player_slot??0)<128, gpm=p.gold_per_min??0, nw=p.net_worth??0
    return {steamAccountId:p.account_id===PRIVATE_ID?0:(p.account_id??0),isRadiant:radiant,isVictory:radiant===Boolean(raw.radiant_win),heroId:p.hero_id??0,kills:p.kills??0,deaths:p.deaths??0,assists:p.assists??0,goldPerMinute:gpm,experiencePerMinute:p.xp_per_min??0,numLastHits:p.last_hits??0,numDenies:p.denies??0,networth:nw>gpm*dur*.5?nw:Math.round(gpm*dur),level:p.level??0,heroDamage:p.hero_damage??0,towerDamage:p.tower_damage??0,heroHealing:p.hero_healing??0,position:0,seasonRank:0,imp:null,items:[p.item_0,p.item_1,p.item_2,p.item_3,p.item_4,p.item_5].map((x:number)=>x||null),backpack:[p.backpack_0,p.backpack_1,p.backpack_2].map((x:number)=>x||null),neutralItem:p.item_neutral||null,neutralItem2:p.item_neutral2||null,aghanimsScepter:Boolean(p.aghanims_scepter),aghanimsShard:Boolean(p.aghanims_shard),moonshard:Boolean(p.moonshard),leaverStatus:p.leaver_status??0,scaledHeroDamage:p.scaled_hero_damage??0,scaledTowerDamage:p.scaled_tower_damage??0,scaledHeroHealing:p.scaled_hero_healing??0,abilityUpgrades:(p.ability_upgrades??[]).map((a:any)=>({ability:a.ability,time:a.time,level:a.level})),stats:null}
  })
  const positioned=withPositionEstimates(players)
  const lobby=lobbies[raw.lobby_type]??'PUBLIC_MATCH'; let mode=modes[raw.game_mode]??`MODE_${raw.game_mode}`
  if(lobby==='RANKED'&&mode==='ALL_PICK') mode='ALL_PICK_RANKED'
  return {schema:2,id:raw.match_id??0,didRadiantWin:raw.radiant_win??null,durationSeconds:raw.duration??0,startDateTime:raw.start_time??0,gameMode:mode,lobbyType:lobby,numHumanPlayers:raw.human_players??positioned.length,actualRank:0,firstBloodSeconds:raw.first_blood_time??null,radiantScore:raw.radiant_score??null,direScore:raw.dire_score??null,towerStatusRadiant:raw.tower_status_radiant??null,towerStatusDire:raw.tower_status_dire??null,barracksStatusRadiant:raw.barracks_status_radiant??null,barracksStatusDire:raw.barracks_status_dire??null,picksBans:(raw.picks_bans??[]).slice().sort((a:any,b:any)=>a.order-b.order).map((b:any)=>({isPick:Boolean(b.is_pick),isRadiant:b.team===0,heroId:b.hero_id,order:b.order})),players:positioned}
}
function withPositionEstimates(players:any[]) {
  return players.map((p:any)=>p.positionSource==='replay'?p:{...p,position:0,positionSource:undefined,lane:undefined})
}
async function match(env:Env,id:number,seq?:number) {
  const hit=await cached<any>(env,`match:${id}`); if(hit) return {...hit,players:withPositionEstimates(hit.players??[])}
  const matchSeq=seq??await cached<number>(env,`seq:${id}`)
  if(!matchSeq) throw new Response(JSON.stringify({error:`Матч ${id}: сначала открой его из истории игрока`}),{status:404})
  const data=await steam(env,'IDOTA2Match_570/GetMatchHistoryBySequenceNum/v1/',{start_at_match_seq_num:matchSeq,matches_requested:1})
  const raw=(data.result?.matches??[]).find((m:any)=>Number(m.match_id)===id)
  if(!raw) throw new Response(JSON.stringify({error:`Матч ${id} недоступен в Steam`}),{status:404})
  const out=normalize(raw); await save(env,`match:${id}`,out); return out
}
async function purchaseEvents(env:Env,id:number):Promise<Record<string,{time:number;itemId:number}[]>|null> {
  if (!env.STRATZ_API_TOKEN) return null
  const key=`purchase-events:v2:${id}`
  const hit=await cached<Record<string,{time:number;itemId:number}[]>>(env,key)
  if(hit) return hit
  try {
    const res=await fetch('https://api.stratz.com/graphql',{method:'POST',headers:{Authorization:`Bearer ${env.STRATZ_API_TOKEN}`,'Content-Type':'application/json','User-Agent':'STRATZ_API'},body:JSON.stringify({query:`query { match(id: ${id}) { players { isRadiant heroId playbackData { purchaseEvents { time itemId } } } } }`})})
    if(!res.ok) { console.error('STRATZ purchase query HTTP',res.status); return null }
    const data=await res.json<any>()
    const players=data.data?.match?.players
    if(!players) { console.error('STRATZ purchase query returned no parsed player timeline',JSON.stringify(data.errors??[])); return null }
    const out:Record<string,{time:number;itemId:number}[]>={}
    for(const p of players) out[`${p.isRadiant?'r':'d'}:${p.heroId}`]=p.playbackData?.purchaseEvents??[]
    await save(env,key,out)
    return out
  } catch(e) { console.error('STRATZ purchase query failed',e instanceof Error?e.message:'unknown error'); return null }
}
async function replayData(env:Env,id:number):Promise<Record<string,any>|null> {
  return cached<Record<string,any>>(env,`replay-data:v1:${id}`)
}
type StratzDraft={bans:{heroId:number;radiant:boolean|null}[];picks:{heroId:number;radiant:boolean;order:number}[];roles:Record<string,{lane:string;position:number}>}
/**
 * Полный драфт и линии. Steam отдаёт `picks_bans` обрезанным (из 16 автобанов
 * приходит 5–8) и часть банов помечает как пики, поэтому список берётся из
 * разбора STRATZ и сверяется с составом матча перед показом.
 *
 * Напрямую из Worker'а в api.stratz.com не выходит: их анти-абьюз отвечает
 * «You can only use one Steam Account» на общий исходящий IP Cloudflare.
 * Строки `match-draft:v1:*` наполняет `npm run drafts:harvest` — оттуда
 * запросы проходят. Поэтому удачный ответ лежит в кэше навсегда (матч
 * неизменяем), а «данных нет» — неделю, чтобы свежий матч догрузился.
 */
async function matchDraft(env:Env,id:number):Promise<StratzDraft|null> {
  const good=await cached<StratzDraft&{missing?:1}>(env,`match-draft:v1:${id}`)
  if(good) return good.missing?null:good
  if(await cached<{missing:1}>(env,`match-draft:missing:${id}`,7*24*3600_000)) return null
  if (!env.STRATZ_API_TOKEN) return null
  try {
    const res=await fetch('https://api.stratz.com/graphql',{method:'POST',headers:{Authorization:`Bearer ${env.STRATZ_API_TOKEN}`,'Content-Type':'application/json','User-Agent':'STRATZ_API'},body:JSON.stringify({query:`query { match(id: ${id}) { pickBans { isPick order heroId bannedHeroId isRadiant } players { isRadiant heroId lane position } } }`})})
    if(!res.ok) { console.error('STRATZ draft query HTTP',res.status); return null }
    const data=await res.json<any>()
    const m=data.data?.match
    if(!m) { console.error('STRATZ draft query returned no match',JSON.stringify(data.errors??[])); return null }
    const out:StratzDraft={bans:[],picks:[],roles:{}}
    for(const b of m.pickBans??[]) {
      if(b.isPick&&Number.isInteger(b.heroId)) out.picks.push({heroId:b.heroId,radiant:Boolean(b.isRadiant),order:Number.isInteger(b.order)?b.order:out.picks.length})
      else if(!b.isPick&&Number.isInteger(b.bannedHeroId)) out.bans.push({heroId:b.bannedHeroId,radiant:b.isRadiant===true?true:b.isRadiant===false?false:null})
    }
    out.picks.sort((a,b)=>a.order-b.order)
    const lanes:Record<string,string>={SAFE_LANE:'safelane',MID_LANE:'mid',OFF_LANE:'offlane'}
    for(const p of m.players??[]) {
      const position=/^POSITION_[1-5]$/.test(p.position??'')?Number(p.position.slice(9)):0
      if(!position) continue
      out.roles[`${p.isRadiant?'r':'d'}:${p.heroId}`]={lane:lanes[p.lane]??'',position}
    }
    if(!out.picks.length&&!Object.keys(out.roles).length) { await save(env,`match-draft:missing:${id}`,{missing:1}); return null }
    await save(env,`match-draft:v1:${id}`,out)
    return out
  } catch(e) { console.error('STRATZ draft query failed',e instanceof Error?e.message:'unknown error'); return null }
}
/** драфт принимается, только если его пики — ровно те 10 героев, что сыграны */
function withDraft(x:any,d:StratzDraft|null) {
  if(!d||d.picks.length!==10) return {...x,draft:null}
  const picked=x.players.every((p:any)=>d.picks.some(k=>k.heroId===p.heroId&&k.radiant===p.isRadiant))
  const clash=d.bans.some((b)=>x.players.some((p:any)=>p.heroId===b.heroId))
  return {...x,draft:picked&&!clash?{source:'stratz',bans:d.bans,picks:d.picks}:null}
}
function stratzRole(d:StratzDraft|null,team:'r'|'d',heroId:number) {
  const role=d?.roles[`${team}:${heroId}`]
  return role?{position:role.position,positionSource:'stratz' as const,lane:(role.lane||undefined) as 'safelane'|'mid'|'offlane'|undefined}:null
}
/**
 * Матчи, которым нужен парсинг реплея. Незавершённым считается и тот, у кого
 * таймлайн лежит в кэше, но собран старой сборкой без вкладов игроков — иначе
 * такие матчи висели бы «готовыми» вечно и никогда не получили бы подробностей.
 * Драки без строк допустимы только когда драк вообще нет.
 */
async function pendingMatchIds(env:Env,limit:number):Promise<number[]> {
  const histories=await env.DB.prepare("SELECT value FROM cache WHERE key GLOB 'history:*'").all<{value:string}>()
  const matches=await env.DB.prepare("SELECT key FROM cache WHERE key GLOB 'match:*'").all<{key:string}>()
  const ids=[...new Set([...matches.results.map(row=>Number(row.key.slice(6))),...histories.results.flatMap(row=>{try{return (JSON.parse(row.value).rows??[]).map((x:any)=>Number(x.id))}catch{return []}})].filter((id:number)=>Number.isSafeInteger(id)&&id>0))].sort((a,b)=>b-a)
  const done=new Set<number>()
  // Refresh recent coaching after decision evidence changes, without re-parsing
  // the entire historical corpus on each coach release.
  const recent=new Set(ids.slice(0,20))
  // Батч по 40: на каждый матч нужно два ключа, а D1 отказывается биндить
  // слишком много параметров одним запросом ("too many SQL variables").
  for(let i=0;i<ids.length;i+=40) {
    const batch=ids.slice(i,i+40)
    const keys=batch.flatMap(id=>[`replay-data:v1:${id}`,`replay-timeline:v1:${id}`])
    const found=await env.DB.prepare(`SELECT key,value FROM cache WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all<{key:string;value:string}>()
    const store=new Map<string,any>()
    for(const row of found.results) { try { store.set(row.key,JSON.parse(row.value)) } catch {} }
    for(const id of batch) {
      const slots=store.get(`replay-data:v1:${id}`)
      const entries=slots?Object.values(slots):[]
      const positioned=entries.length===10&&entries.every((x:any)=>x.position>=1&&x.position<=5&&x.positionVersion>=2)
      const timeline=store.get(`replay-timeline:v1:${id}`)
      const fights=timeline?.teamfights??[]
      const enriched=!timeline||fights.length===0||Array.isArray(fights[0]?.lines)
      const spatial=entries.length===10&&entries.every((x:any)=>x.mapPlays?.version===1)
      const coached=entries.length===10&&entries.every((x:any)=>x.evidence?.version===1&&x.evidence?.microVersion===1&&x.mapPlays?.structures?.length)
      const decision=!recent.has(id)||entries.every((x:any)=>x.evidence?.decisionVersion===1)
      if(timeline&&positioned&&enriched&&spatial&&coached&&decision) done.add(id)
    }
  }
  return ids.filter(id=>!done.has(id)).slice(0,Math.min(100,Math.max(1,limit)))
}
async function profiles(env:Env,ids:number[]) {
  const out=new Map<number,{name:string|null;avatar:string|null}>(), missing:number[]=[]
  for(const id of [...new Set(ids)].filter(Boolean)) { const hit=await cached<any>(env,`profile:${id}`,600_000); if(hit) out.set(id,hit); else missing.push(id) }
  for(let i=0;i<missing.length;i+=100) {
    const data=await steam(env,'ISteamUser/GetPlayerSummaries/v2/',{steamids:missing.slice(i,i+100).map(id=>String(BigInt(id)+76561197960265728n)).join(',')})
    for(const p of data.response?.players??[]) { const id=Number(BigInt(p.steamid)-76561197960265728n), v={name:p.personaname??null,avatar:p.avatarfull??p.avatarmedium??p.avatar??null};out.set(id,v);await save(env,`profile:${id}`,v) }
  }
  return out
}
async function steamFriends(env:Env, account:number):Promise<Set<number>> {
  const key=`friends:${account}`, hit=await cached<number[]>(env,key,3_600_000)
  if(hit) return new Set(hit)
  try {
    const data=await steam(env,'ISteamUser/GetFriendList/v1/',{steamid:String(BigInt(account)+76561197960265728n),relationship:'friend'})
    const ids=(data.friendslist?.friends??[]).map((f:any)=>Number(BigInt(f.steamid)-76561197960265728n)).filter((x:number)=>Number.isSafeInteger(x)&&x>0)
    await save(env,key,ids)
    return new Set(ids)
  } catch(e) {
    if(e instanceof Response&&e.status===401) throw json({error:'Список друзей Steam скрыт. Открой его в настройках приватности Steam.'},403)
    throw e
  }
}
async function getMatches(env:Env,account:number,rows:{id:number;seq:number}[],skip:number,take:number) {
  const all=[]
  for(const r of rows.slice(skip,skip+take)) { try { const m=await match(env,r.id,r.seq); if(m.players.some((p:any)=>p.steamAccountId===account)) all.push(m) } catch(e) { if(!(e instanceof Response)&&e instanceof Error) throw e } }
  return all
}
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})

const encoder=new TextEncoder()
const b64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
async function sessionSignature(payload:string,secret:string) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload))))
}
function cookieValue(request:Request,name:string) { return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1)??'' }
async function sessionAccount(request:Request,secret:string) {
  const [id,expiry,signature]=cookieValue(request,'dota_session').split('.'),payload=`${id}.${expiry}`
  if(!/^\d{17}$/.test(id??'')||!/^\d+$/.test(expiry??'')||Number(expiry)<Date.now()||!signature) return null
  const expected=await sessionSignature(payload,secret)
  return signature===expected?id:null
}
function authCookie(name:string,value:string,maxAge:number) { return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}` }
async function steamAuth(request:Request,env:Env):Promise<Response|null> {
  const url=new URL(request.url),secret=env.AUTH_SECRET
  if(!url.pathname.startsWith('/api/auth/')) return null
  if(!secret) return json({error:'Steam login is not configured'},503)
  if(url.pathname==='/api/auth/steam'&&request.method==='GET') {
    const state=b64url(crypto.getRandomValues(new Uint8Array(24))),callback=new URL('/api/auth/steam/callback',url.origin)
    callback.searchParams.set('state',state)
    const auth=new URL('https://steamcommunity.com/openid/login')
    for(const [k,v] of Object.entries({'openid.ns':'http://specs.openid.net/auth/2.0','openid.mode':'checkid_setup','openid.return_to':callback.href,'openid.realm':`${url.origin}/`,'openid.identity':'http://specs.openid.net/auth/2.0/identifier_select','openid.claimed_id':'http://specs.openid.net/auth/2.0/identifier_select'})) auth.searchParams.set(k,v)
    return new Response(null,{status:302,headers:{location:auth.href,'set-cookie':authCookie('openid_state',state,600),'cache-control':'no-store'}})
  }
  if(url.pathname==='/api/auth/steam/callback'&&request.method==='GET') {
    const state=url.searchParams.get('state')??'',claimed=url.searchParams.get('openid.claimed_id')??'',steamId=claimed.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/)?.[1],returnTo=new URL('/api/auth/steam/callback',url.origin)
    returnTo.searchParams.set('state',state)
    if(!state||state!==cookieValue(request,'openid_state')||!steamId||url.searchParams.get('openid.identity')!==claimed||url.searchParams.get('openid.return_to')!==returnTo.href||url.searchParams.get('openid.op_endpoint')!=='https://steamcommunity.com/openid/login') return new Response('Steam sign-in verification failed',{status:400})
    const assertion=new URLSearchParams()
    for(const [k,v] of url.searchParams) if(k.startsWith('openid.')) assertion.set(k,v)
    assertion.set('openid.mode','check_authentication')
    const checked=await fetch('https://steamcommunity.com/openid/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:assertion})
    if(!checked.ok||!(await checked.text()).split(/\r?\n/).includes('is_valid:true')) return new Response('Steam sign-in verification failed',{status:401})
    const expires=Date.now()+30*24*60*60*1000,payload=`${steamId}.${expires}`,signature=await sessionSignature(payload,secret)
    const headers=new Headers({location:'/','cache-control':'no-store'})
    headers.append('set-cookie',authCookie('dota_session',`${payload}.${signature}`,30*24*60*60))
    headers.append('set-cookie',authCookie('openid_state','',0))
    return new Response(null,{status:302,headers})
  }
  if(url.pathname==='/api/auth/me'&&request.method==='GET') {
    const steam64=await sessionAccount(request,secret)
    if(!steam64) return json({loggedIn:false})
    const id=Number(BigInt(steam64)-76561197960265728n)
    let info:any={}
    try { info=(await profiles(env,[id])).get(id)??{} } catch { /* Steam OpenID works independently from the Steam Web API key */ }
    return json({loggedIn:true,steamAccountId:id,name:info?.name??`#${id}`,avatar:info?.avatar??null})
  }
  if(url.pathname==='/api/auth/logout'&&request.method==='POST') return new Response(null,{status:204,headers:{'set-cookie':authCookie('dota_session','',0),'cache-control':'no-store'}})
  return json({error:'Method not allowed'},405)
}

export default {
  /**
   * GitHub не отдаёт этому репозиторию запуски по cron (0 срабатываний,
   * disable/enable не помог), поэтому будильник живёт здесь, на Cloudflare,
   * и будит GitHub через repository_dispatch. Для одних рангов запускаем
   * только их сборщик, без установки зависимостей и парсера реплеев.
   */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPO) { console.error('cron: GITHUB_DISPATCH_TOKEN/GITHUB_REPO not set'); return }
    const perRun = Math.max(1, Number(env.REPLAY_MATCHES_PER_RUN) || 5)
    const pending = await pendingMatchIds(env, perRun)
    const rankPending = await env.DB.prepare("SELECT 1 AS queued FROM cache WHERE key GLOB 'rank-pending:v1:*' LIMIT 1").first()
    if (!pending.length && !rankPending) return
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        'content-type': 'application/json',
        'user-agent': 'dota-match-lab-cron',
      },
      // 204 без тела — GitHub просто ставит раннер в очередь
      body: JSON.stringify({ event_type: pending.length ? 'replay-backfill' : 'rank-refresh', client_payload: { limit: perRun, matchIds: pending } }),
    })
    if (res.status !== 204) console.error('cron: repository_dispatch failed', res.status, (await res.text()).slice(0, 300))
  },
  async fetch(request:Request,env:Env):Promise<Response> {
  const url=new URL(request.url), p=url.pathname
  if(!p.startsWith('/api/')) return env.ASSETS.fetch(request)
  if(p.startsWith('/api/auth/')) { try { return (await steamAuth(request,env))??json({error:'Not found'},404) } catch(e) { console.error('Steam auth failed',e instanceof Error?e.message:'unknown'); return json({error:'Steam login failed'},502) } }
  try {
    if(p==='/api/internal/ranks') {
      if(!env.REPLAY_INGEST_TOKEN || request.headers.get('authorization')!==`Bearer ${env.REPLAY_INGEST_TOKEN}`) return json({error:'Unauthorized'},401)
      if(request.method==='GET') {
        const rows=await env.DB.prepare("SELECT value FROM cache WHERE key GLOB 'rank-pending:v1:*' ORDER BY updated_at ASC LIMIT 10").all<{value:string}>()
        return json({pending:rows.results.flatMap((r)=>{try{return [JSON.parse(r.value)]}catch{return []}})})
      }
      if(request.method!=='POST') return json({error:'Method not allowed'},405)
      const raw=await request.text()
      if(raw.length>200_000) return json({error:'Payload too large'},413)
      let body:any;try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
      if(!Array.isArray(body.records)||body.records.length>150) return json({error:'Invalid rank records'},400)
      const records:{key:string;value:any}[]=[]
      for(const row of body.records) {
        if(!row||typeof row.key!=='string'||!/^(?:match-)?[1-9]\d{0,11}$/.test(row.key)) return json({error:'Invalid rank key'},400)
        const value=row.value, timestamp=Number(value?.fetchedAt)
        if(!Number.isFinite(timestamp)||timestamp>Date.now()+120_000||timestamp<Date.now()-7*86400_000) return json({error:'Invalid rank timestamp'},400)
        if(row.key.startsWith('match-')) {
          if(!Array.isArray(value.players)||value.players.length!==10) return json({error:'Expected ten public identities'},400)
          const slots=new Set(), heroes=new Set()
          const players=[]
          for(const p of value.players) {
            if(!p||typeof p!=='object') return json({error:'Invalid match identity'},400)
            if(!Number.isInteger(p.player_slot)||!(p.player_slot>=0&&p.player_slot<=4||p.player_slot>=128&&p.player_slot<=132)||slots.has(p.player_slot)||!Number.isInteger(p.hero_id)||p.hero_id<=0||heroes.has(p.hero_id)) return json({error:'Invalid match identity'},400)
            if(p.account_id!=null&&(!Number.isInteger(p.account_id)||p.account_id<0||p.account_id>=PRIVATE_ID)) return json({error:'Invalid account ID'},400)
            slots.add(p.player_slot);heroes.add(p.hero_id)
            players.push({account_id:p.account_id??null,hero_id:p.hero_id,player_slot:p.player_slot,rank_tier:validRank(p.rank_tier)?p.rank_tier:null,personaname:typeof p.personaname==='string'?p.personaname.slice(0,128):null})
          }
          records.push({key:row.key,value:{fetchedAt:timestamp,players}})
        } else {
          if(Number(row.key)>=PRIVATE_ID||!(value.tier===0||validRank(value.tier))) return json({error:'Invalid medal'},400)
          records.push({key:row.key,value:{tier:value.tier,source:'opendota',scope:'current',fetchedAt:timestamp,checkedAt:timestamp}})
        }
      }
      if(records.length) await env.DB.batch(records.flatMap((r)=>[
        env.DB.prepare('INSERT OR REPLACE INTO cache(key,value,updated_at) VALUES(?,?,?)').bind('rank:v1:'+r.key,JSON.stringify(r.value),Date.now()),
        env.DB.prepare('DELETE FROM cache WHERE key=?').bind('rank-pending:v1:'+r.key),
      ]))
      return json({ok:true,records:records.length})
    }
    const replayStatusUpdate=p.match(/^\/api\/internal\/replay\/(\d+)\/status$/)
    if(replayStatusUpdate) {
      if(!env.REPLAY_INGEST_TOKEN||request.headers.get('authorization')!==`Bearer ${env.REPLAY_INGEST_TOKEN}`)return json({error:'Unauthorized'},401)
      if(request.method!=='POST')return json({error:'Method not allowed'},405)
      const raw=await request.text();if(raw.length>2000)return json({error:'Payload too large'},413)
      let data:any;try{data=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
      if(!['waiting','parsing','retry','ready'].includes(data?.state))return json({error:'Invalid replay state'},400)
      await save(env,`replay-status:v1:${replayStatusUpdate[1]}`,{state:data.state,updatedAt:Date.now()})
      return json({ok:true})
    }
    const ingest=p.match(/^\/api\/internal\/replay\/(\d+)$/)
    if(ingest) {
      if(request.method!=='POST') return json({error:'Method not allowed'},405)
      if(!env.REPLAY_INGEST_TOKEN || request.headers.get('authorization')!==`Bearer ${env.REPLAY_INGEST_TOKEN}`) return json({error:'Unauthorized'},401)
      const id=Number(ingest[1]), raw=await request.text()
      // Keep each stored D1 row below its 2 MB limit, including UTF-8 text.
      if(new TextEncoder().encode(raw).length>1_900_000) return json({error:'Payload too large'},413)
      let data:any; try { data=JSON.parse(raw) } catch { return json({error:'Invalid JSON'},400) }
      if(!Array.isArray(data.players) || data.players.length!==10) return json({error:'Expected ten player timelines'},400)
      const bySlot:Record<string,{purchaseEvents:{time:number;itemId:number}[];abilityUpgrades:{ability:number;time:number;level:number}[];impactPhases?:any[];mapPlays?:any;evidence?:any;position?:number;positionSource?:'replay'|'stats';lane?:'safelane'|'mid'|'offlane';positionVersion?:number}>= {}
      for(const row of data.players) {
        const slot=Number(row.playerSlot)
        if(![0,1,2,3,4,128,129,130,131,132].includes(slot)||bySlot[String(slot)]) return json({error:'Invalid player slot'},400)
        const purchases=Array.isArray(row.purchaseEvents)?row.purchaseEvents:[], upgrades=Array.isArray(row.abilityUpgrades)?row.abilityUpgrades:[]
        const position=Number(row.position)
        if(!validEvidence(row.evidence)) return json({error:`Invalid player evidence (slot ${slot})`},400)
        if(!validMapPlays(row.mapPlays)) return json({error:'Invalid map plays'},400)
        const impactPhases=Array.isArray(row.impactPhases)?row.impactPhases.slice(0,3).filter((x:any)=>x&&typeof x.label==='string').map((x:any)=>Object.fromEntries(['label','kills','deaths','gold','networth','lastHits','experience','heroDamage','towerDamage'].map(k=>[k,k==='label'?x[k]:Math.max(0,Math.trunc(Number(x[k])||0))]))):undefined
        bySlot[String(slot)]={purchaseEvents:purchases.filter((e:any)=>Number.isFinite(e.time)&&Number.isInteger(e.itemId)).slice(0,500),abilityUpgrades:upgrades.filter((e:any)=>Number.isFinite(e.time)&&Number.isInteger(e.ability)&&Number.isInteger(e.level)).slice(0,100),impactPhases,evidence:row.evidence??undefined,mapPlays:row.mapPlays??undefined,positionVersion:Math.max(0,Math.trunc(Number(row.positionVersion)||0)),...(Number.isInteger(position)&&position>=1&&position<=5?{position,positionSource:row.positionSource==='replay'?'replay':'stats',...(row.positionSource==='replay'&&(row.lane==='safelane'||row.lane==='mid'||row.lane==='offlane')?{lane:row.lane}:{})}:{})}
      }
      const writes=[env.DB.prepare('INSERT OR REPLACE INTO cache(key,value,updated_at) VALUES(?,?,?)').bind(`replay-data:v1:${id}`,JSON.stringify(bySlot),Date.now())]
      // Global charts (advantage curve, event feed) ride along when the parser
      // run provides them; older payloads simply omit the key and the UI hides
      // those sections instead of rendering an empty chart.
      if (data.timeline && typeof data.timeline === 'object' && Array.isArray(data.timeline.series)) {
        writes.push(env.DB.prepare('INSERT OR REPLACE INTO cache(key,value,updated_at) VALUES(?,?,?)').bind(`replay-timeline:v1:${id}`,JSON.stringify(data.timeline),Date.now()))
      }
      await env.DB.batch(writes)
      return json({ok:true,matchId:id,players:Object.keys(bySlot).length,timeline:Boolean(data.timeline)})
    }
    if(p==='/api/internal/replay/pending') {
      if(request.headers.get('authorization')!==`Bearer ${env.REPLAY_INGEST_TOKEN}` || !env.REPLAY_INGEST_TOKEN) return json({error:'Unauthorized'},401)
      if(request.method!=='GET') return json({error:'Method not allowed'},405)
      return json({matchIds:await pendingMatchIds(env,Number(url.searchParams.get('limit'))||25)})
    }
    const replayMatch=p.match(/^\/api\/internal\/replay\/match\/(\d+)$/)
    if(replayMatch) {
      if(request.headers.get('authorization')!==`Bearer ${env.REPLAY_INGEST_TOKEN}` || !env.REPLAY_INGEST_TOKEN) return json({error:'Unauthorized'},401)
      if(request.method!=='GET') return json({error:'Method not allowed'},405)
      return json(await match(env,Number(replayMatch[1])))
    }
    const coach=p.match(/^\/api\/matches\/(\d+)\/coach\/(0|1|2|3|4|128|129|130|131|132)$/)
    if(coach) {
      if(request.method!=='GET') return json({error:'Method not allowed'},405)
      const id=Number(coach[1]),x=await rankedMatch(env,await match(env,id)), replay=await replayData(env,id)
      const order={r:0,d:0}
      const players=x.players.map((p:any)=>{const slot=p.isRadiant?order.r++:128+order.d++,parsed=replay?.[String(slot)];return {...p,position:parsed?.position??p.position,lane:parsed?.lane,evidence:parsed?.evidence,mapPlays:parsed?.mapPlays,impactPhases:parsed?.impactPhases}})
      return coachResponse(env,{...x,players},Number(coach[2]))
    }
    if(request.method!=='GET') return json({error:'Method not allowed'},405)
    if(p==='/api/health') return json({ok:true,steamKey:Boolean(env.STEAM_WEB_API_KEY)})
    if(p==='/api/constants/heroes') return json(heroes)
    if(p==='/api/constants/items') return json(items)
    let m=p.match(/^\/api\/profile\/(\d+)$/)
    if(m) { const id=Number(m[1]); if(!id) return json({error:'Некорректный Steam ID'},400); const [ps,h,rs]=await Promise.all([profiles(env,[id]),history(env,id),ranks(env,[id])]); const info=ps.get(id), rank=rs.get(id); return json({steamAccountId:id,name:info?.name??`#${id}`,avatar:info?.avatar??null,matchCount:h.total,winCount:null,rank:rank?.tier??null,rankSource:rank?.source??null,rankScope:rank?.scope??null,rankFetchedAt:rank?.fetchedAt??null,rankIsCore:null}) }
    m=p.match(/^\/api\/player\/(\d+)\/matches$/)
    if(m) { const id=Number(m[1]),take=Math.min(Number(url.searchParams.get('take'))||25,100),skip=Math.max(Number(url.searchParams.get('skip'))||0,0),h=await history(env,id),list=await getMatches(env,id,h.rows,skip,take),rank=(await ranks(env,[id])).get(id);return json(await Promise.all(list.map(async(x:any)=>{const me=x.players.find((p:any)=>p.steamAccountId===id),team=x.players.filter((p:any)=>p.isRadiant===me.isRadiant),slot=(me.isRadiant?0:128)+team.indexOf(me),role=(await replayData(env,x.id))?.[String(slot)];return {id:x.id,startDateTime:x.startDateTime,durationSeconds:x.durationSeconds,gameMode:x.gameMode,lobbyType:x.lobbyType,player:{steamAccountId:id,heroId:me.heroId,kills:me.kills,deaths:me.deaths,assists:me.assists,goldPerMinute:me.goldPerMinute,experiencePerMinute:me.experiencePerMinute,numLastHits:me.numLastHits,numDenies:me.numDenies,networth:me.networth,level:me.level,heroDamage:me.heroDamage,towerDamage:me.towerDamage,heroHealing:me.heroHealing,position:role?.position??0,positionSource:role?.positionSource,lane:role?.lane,evidence:role?.evidence,mapPlays:role?.mapPlays,impactPhases:role?.impactPhases,purchaseEvents:role?.purchaseEvents,teamKills:team.reduce((n:number,p:any)=>n+p.kills,0),teamDamage:team.reduce((n:number,p:any)=>n+p.heroDamage,0),...rankFields(me,rank),isVictory:me.isVictory,imp:null}}}))) }
    m=p.match(/^\/api\/matches\/(\d+)$/)
    if(m) {
      const id=Number(m[1]),x=await rankedMatch(env,await match(env,id))
      const [ps,replay,draft]=await Promise.all([profiles(env,x.players.map((p:any)=>p.steamAccountId)),replayData(env,id),matchDraft(env,id)])
      const purchases=replay?null:await purchaseEvents(env,id),teamOrd={r:0,d:0}
      const players=x.players.map((p:any)=>{const team=(p.isRadiant?'r':'d') as 'r'|'d',slot=p.isRadiant?teamOrd.r++:128+teamOrd.d++,parsed=replay?.[String(slot)],sr=stratzRole(draft,team,p.heroId),role=parsed?.position?{position:parsed.position,positionSource:parsed.positionSource,lane:parsed.lane}:parsed?.position===undefined&&sr?sr:{};return {...p,...role,name:ps.get(p.steamAccountId)?.name??p.name??null,purchaseEvents:parsed?.purchaseEvents??purchases?.[`${team}:${p.heroId}`]??null,abilityUpgrades:parsed?.abilityUpgrades?.length?parsed.abilityUpgrades:p.abilityUpgrades,impactPhases:parsed?.impactPhases,evidence:parsed?.evidence,mapPlays:parsed?.mapPlays}})
      return json(withDraft({...x,players},draft))
    }
    m=p.match(/^\/api\/matches\/(\d+)\/timeline$/)
    if(m){const id=Number(m[1]),t=await cached<unknown>(env,`replay-timeline:v1:${id}`);if(!t)return json({error:'Реплей этого матча ещё не разобран'},404);return json(t)}
    m=p.match(/^\/api\/matches\/(\d+)\/replay-status$/)
    if(m){
      const id=Number(m[1]),[replay,timeline,status]=await Promise.all([replayData(env,id),cached(env,`replay-timeline:v1:${id}`),cached<any>(env,`replay-status:v1:${id}`)])
      const rows=Object.values(replay??{})
      if(timeline&&rows.length===10&&rows.every((r:any)=>r.evidence?.microVersion===1&&r.mapPlays?.structures?.length))return json({state:'ready'})
      if(status?.state==='parsing'&&Date.now()-status.updatedAt>15*60_000)return json({state:'retry',updatedAt:status.updatedAt})
      return json(status?.state==='ready'?{state:'queued'}:status??{state:'queued'})
    }
    m=p.match(/^\/api\/player\/(\d+)\/heroes$/)
    if(m) {const id=Number(m[1]),h=await history(env,id),all=await getMatches(env,id,h.rows,0,100),agg=new Map<number,{heroId:number;matchCount:number;winCount:number}>();for(const x of all){const me=x.players.find((p:any)=>p.steamAccountId===id),a=agg.get(me.heroId)??{heroId:me.heroId,matchCount:0,winCount:0};a.matchCount++;if(me.isVictory)a.winCount++;agg.set(me.heroId,a)}return json([...agg.values()].sort((a,b)=>b.matchCount-a.matchCount).slice(0,Math.min(Number(url.searchParams.get('take'))||100,100)))}
    m=p.match(/^\/api\/player\/(\d+)\/peers$/)
    if(m) {const id=Number(m[1]),[h,friends]=await Promise.all([history(env,id),steamFriends(env,id)]),all=await getMatches(env,id,h.rows,0,100),agg=new Map<number,any>();for(const x of all){const me=x.players.find((p:any)=>p.steamAccountId===id);for(const q of x.players){if(!q.steamAccountId||q.steamAccountId===id||!friends.has(q.steamAccountId)||q.isRadiant!==me.isRadiant)continue;const a=agg.get(q.steamAccountId)??{steamAccountId:q.steamAccountId,withMatchCount:0,withWinCount:0,againstMatchCount:0,againstWinCount:0};a.withMatchCount++;if(me.isVictory)a.withWinCount++;agg.set(q.steamAccountId,a)}}const top=[...agg.values()].sort((a,b)=>b.withMatchCount-a.withMatchCount),ps=await profiles(env,top.map(x=>x.steamAccountId));return json(top.map(x=>({...x,name:ps.get(x.steamAccountId)?.name??`#${x.steamAccountId}`,avatar:ps.get(x.steamAccountId)?.avatar??null})))}
    return json({error:'Неизвестный эндпоинт'},404)
  } catch(e) { if(e instanceof Response)return e; return json({error:e instanceof Error?e.message:'Internal error'},500) }
} }
