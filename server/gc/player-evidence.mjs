// Compact measured evidence shared by replay ingest and the local API.
// Missing logs remain null; purchase, use and successful detection are distinct.
export function playerEvidence(replay, slot, heroId, heroes) {
  const p = replay?.players?.find(p => Number(p.player_slot) === slot)
  if (!p) return null
  const name = 'npc_dota_hero_' + heroes.find(h => h.id === heroId)?.shortName
  const combat = replay.movement?.combat
  const own = combat?.filter(e => e[2] === name && !e[8] && (e[6] || ['ABILITY','ITEM'].includes(e[1])))
  const hostile = e => e[7] && !e[9] && e[3] !== name
  const laneOut = own?.filter(e => e[0] >= 0 && e[0] < 600 && e[1] === 'DAMAGE' && hostile(e))
  const laneIn = combat?.filter(e => e[0] >= 0 && e[0] < 600 && e[1] === 'DAMAGE' && e[3] === name && e[6] && !e[8] && !e[9])
  const sum = xs => xs?.reduce((n, e) => n + (Number(e[4]) || 0), 0) ?? null
  const fields = ['gold_t', 'networth_t', 'xp_t', 'lh_t', 'dn_t', 'hero_damage_t', 'hero_healing_t', 'tower_damage_t']
  const curve = (p.times ?? []).filter(t => t >= 0).map(t => {
    const i = p.times.indexOf(t)
    return [t, ...fields.map(f => Number.isFinite(p[f]?.[i]) ? p[f][i] : null),
      Number.isFinite(replay.radiant_gold_adv?.[i]) ? replay.radiant_gold_adv[i] * (slot < 128 ? 1 : -1) : null]
  })
  const log = key => Array.isArray(p[key]) ? p[key] : null
  const deaths = log('deaths_log')?.map(d => ({ t: d.time, goldFed: d.gold_fed ?? null, lostGold: d.gold_lost ?? null,
    secondsDead: d.time_dead ?? null, killer: d.key,
    // Require an actual buyback between this and the immediately previous death.
    dieback: (p.buyback_log ?? []).some(b => b.time < d.time && b.time > Math.max(-Infinity, ...(p.deaths_log ?? []).filter(x => x.time < d.time).map(x => x.time))) })) ?? null
  const wards = log('obs_log') && log('sen_log') ? [...p.obs_log.map(w => ({ t: w.time, type: 'observer', x: w.x ?? null, y: w.y ?? null })),
    ...p.sen_log.map(w => ({ t: w.time, type: 'sentry', x: w.x ?? null, y: w.y ?? null }))] : null
  const uses = own?.filter(e => ['ITEM', 'ABILITY'].includes(e[1])).map(e => ({ t: e[0], key: e[5], target: e[3] })) ?? null
  const fights = Array.isArray(replay.teamfights) ? replay.teamfights.map(f => {
    const line = f.players?.[slot < 128 ? slot : slot - 123]
    if (!line) return null
    const casts = combat?.filter(e => e[0] >= f.start - 5 && e[0] <= f.end && e[1] === 'ABILITY' && e[6] && e[7] && !e[8] && !e[9] && e[2] !== e[3])
    return { t: f.start, end: f.end, damage: line.damage ?? 0, healing: line.healing ?? 0, deaths: line.deaths ?? 0,
      kills: line.kills ?? Object.entries(line.killed??{}).filter(([key])=>key.startsWith('npc_dota_hero_')).reduce((n,[,v])=>n+Number(v),0),
      gold: line.gold_delta ?? null, firstCast: casts?.[0]?.[2] === name ? true : casts?.length ? false : null,
      abilities: line.ability_uses ?? null, items: line.item_uses ?? null }
  }).filter(Boolean) : null
  const tracks=replay.movement?.tracks
  const at=(s,t)=>tracks?.[s]?.findLast(p=>p[0]<=t&&t-p[0]<=3)
  const damage=events=>events.reduce((n,e)=>n+Number(e[4]||0),0)
  const keys=events=>[...new Set(events.map(e=>e[5]).filter(k=>k&&k!=='dota_unknown'))].slice(0,8)
  const laneMinutes=tracks&&combat?Array.from({length:10},(_,i)=>{
    const t=i*60,end=t+60,a=at(slot,t),b=at(slot,end)
    if(!a||!b)return null
    const out=own.filter(e=>e[0]>=t&&e[0]<end&&e[1]==='DAMAGE'&&hostile(e)),incoming=laneIn.filter(e=>e[0]>=t&&e[0]<end)
    return {t,end,lh:b[6]-a[6],xp:b[5]-a[5],damage:damage(out),taken:damage(incoming),attacks:out.filter(e=>e[5]==='dota_unknown').length,
      aliveSeconds:Math.min(60,tracks[slot].filter(p=>p[0]>=t&&p[0]<end&&p[3]===0).length*replay.movement.sampleSeconds)}
  }).filter(Boolean):null
  const deathWindows=tracks&&combat&&deaths?deaths.filter(d=>d.t>=0).slice(0,20).map(d=>{
    const from=Math.max(0,d.t-20),pos=at(slot,Math.max(0,d.t-10)),before=at(slot,from),after=at(slot,d.t+60)
    const outgoing=own.filter(e=>e[0]>=from&&e[0]<=d.t),incoming=combat.filter(e=>e[0]>=from&&e[0]<=d.t&&e[3]===name&&e[6]&&!e[8])
    const allies=Object.keys(tracks).map(Number).filter(s=>s!==slot&&(s<128)===(slot<128)).flatMap(s=>{
      const p=at(s,Math.max(0,d.t-10));return pos&&p?.[3]===0?[{heroId:replay.movement.heroes[s],distance:Math.round(Math.hypot(pos[1]-p[1],pos[2]-p[2])*128)}]:[]
    }).sort((a,b)=>a.distance-b.distance)
    const partnerName=allies[0]?'npc_dota_hero_'+heroes.find(h=>h.id===allies[0].heroId)?.shortName:null
    const partner=combat.filter(e=>e[0]>=from&&e[0]<=d.t&&e[2]===partnerName&&!e[8]&&e[7]&&!e[9]&&e[3]!==name)
    return {t:d.t,from,damage:damage(outgoing.filter(e=>e[1]==='DAMAGE'&&hostile(e))),taken:damage(incoming.filter(e=>e[1]==='DAMAGE')),
      attacks:outgoing.filter(e=>e[1]==='DAMAGE'&&hostile(e)&&e[5]==='dota_unknown').length,
      ownSpells:keys(outgoing.filter(e=>e[1]==='ABILITY')),enemySpells:keys(incoming.filter(e=>['ABILITY','DAMAGE'].includes(e[1]))),
      items:keys(outgoing.filter(e=>e[1]==='ITEM')),nearestAlly:allies[0]??null,
      allyDamage:damage(partner.filter(e=>e[1]==='DAMAGE')),allySpells:keys(partner.filter(e=>e[1]==='ABILITY')),
      lhNextMinute:before&&after?after[6]-before[6]:null,xpNextMinute:before&&after?after[5]-before[5]:null}
  }):null
  const spellWindows=tracks&&own?own.filter(e=>e[1]==='ABILITY'&&e[0]>=0&&e[5]==='clinkz_strafe').slice(0,40).map(cast=>{
    const events=own.filter(e=>e[0]>=cast[0]&&e[0]<=cast[0]+6&&e[1]==='DAMAGE')
    return {t:cast[0],key:cast[5],seconds:6,attacks:events.filter(e=>e[5]==='dota_unknown').length,damage:damage(events)}
  }):null
  return { version: 1, curve, lane: { damage: sum(laneOut), damageTaken: sum(laneIn),
    attacks: laneOut?.filter(e => e[5] === 'dota_unknown').length ?? null,
    spellHits: laneOut?.filter(e => e[5] !== 'dota_unknown').length ?? null,
    activeMinutes: laneOut ? new Set(laneOut.map(e => Math.floor(e[0] / 60))).size : null },
    deaths, wards, uses, fights,microVersion:tracks?1:null,laneMinutes,deathWindows,spellWindows,
    dewards: Number.isFinite(p.killed?.npc_dota_observer_wards) ? p.killed.npc_dota_observer_wards : log('kills_log') ? 0 : null,
    stacks: Number.isFinite(p.camps_stacked) ? p.camps_stacked : null,
    stuns: Number.isFinite(p.stuns) ? p.stuns : null,
    purchases: log('purchase_log')?.map(e => ({ t: e.time, key: e.key })) ?? null,
    itemUses: p.item_uses ?? null,
    runes: log('runes_log')?.map(e => ({ t: e.time, key: e.key })) ?? null }
}

export function validEvidence(e) {
  if (e == null) return true
  if (e.version !== 1 || !Array.isArray(e.curve) || e.curve.length > 240 || !e.lane) return false
  if (!e.curve.every(r => Array.isArray(r) && r.length === 10 && r.every(v => v === null || Number.isFinite(v)) && r[0] >= 0 && r[0] <= 14400)) return false
  for (const key of ['deaths', 'wards', 'uses', 'fights', 'purchases', 'runes']) {
    if (e[key] !== null && (!Array.isArray(e[key]) || e[key].length > 4000)) return false
  }
  for(const key of ['laneMinutes','deathWindows','spellWindows'])if(e[key]!=null&&(!Array.isArray(e[key])||e[key].length>40))return false
  if(e.microVersion!=null&&e.microVersion!==1)return false
  const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0
  if(e.laneMinutes?.some(r=>!r||!['t','end','lh','xp','damage','taken','attacks','aliveSeconds'].every(k=>finite(r[k]))||r.end<r.t||r.aliveSeconds>60))return false
  const names=xs=>Array.isArray(xs)&&xs.length<=8&&xs.every(x=>typeof x==='string'&&/^[a-z0-9_]{1,100}$/.test(x))
  if(e.deathWindows?.some(r=>!r||!['t','from','damage','taken','attacks','allyDamage'].every(k=>finite(r[k]))||r.from>r.t||r.t>14400||!['lhNextMinute','xpNextMinute'].every(k=>r[k]==null||finite(r[k]))||!['ownSpells','enemySpells','items','allySpells'].every(k=>names(r[k]))||r.nearestAlly!=null&&(!finite(r.nearestAlly.distance)||!Number.isInteger(r.nearestAlly.heroId)||r.nearestAlly.heroId<=0)))return false
  if(e.spellWindows?.some(r=>!r||!['t','seconds','attacks','damage'].every(k=>finite(r[k]))||!names([r.key])))return false
  return JSON.stringify(e).length < 180000
}
