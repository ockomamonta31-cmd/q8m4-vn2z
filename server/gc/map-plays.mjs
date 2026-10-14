// Actual trajectories + combat events. No reward for distance travelled or
// automatic bonus for losing: movement needs a recorded outcome.
import map741 from '../data/constants/map_741.json' with {type:'json'}
export const MAP_PLAYS_VERSION = 1
const distance = (a, b) => Math.hypot(a[1] - b[1], a[2] - b[2]) * 128
const nearest = (track, t) => {
  let lo = 0, hi = track.length - 1
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (track[mid][0] <= t) lo = mid; else hi = mid - 1 }
  return track[lo] && Math.abs(track[lo][0] - t) <= 5 ? track[lo] : null
}
const realHero = (e) => e[7] === true && e[9] !== true
const activeHero = (e) => e[6] === true && e[8] !== true

export function buildMapPlays(replay, match, heroes) {
  const m = replay?.movement
  if (m?.version !== 1 || Object.keys(m.tracks ?? {}).length !== 10) return null
  const slots = Object.keys(m.tracks).map(Number)
  if (slots.some(s => !Array.isArray(m.tracks[s]) || m.tracks[s].length < 60)) return null
  for (const side of [true, false]) {
    const players = match.players.filter(p => p.isRadiant === side)
    if (players.length !== 5 || players.some((p, i) => m.heroes[(side ? 0 : 128) + i] !== p.heroId)) return null
  }
  const combat = m.combat ?? []
  const structures=Array.isArray(m.structures)?m.structures.filter(s=>s.kind!=='CDOTA_BaseNPC_Watch_Tower').map(s=>{
    const landmark=map741.structures.filter(l=>l.team===s.team&&l.kind===s.kind&&Math.hypot(l.x-s.x,l.y-s.y)<4).sort((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y))[0]
    const key=s.name||landmark?.key
    const fall=key?(replay.objectives??[]).find(o=>o.type==='building_kill'&&o.key===key):null
    return {key,kind:s.kind,team:s.team,x:s.x,y:s.y,destroyedAt:fall?.time??null}
  }):undefined
  const names = new Map(heroes.map(h => ['npc_dota_hero_' + h.shortName, h.id]))
  const slotByName = new Map([...names].map(([name, id]) => [name, slots.find(s => m.heroes[s] === id)]))
  const track = (s) => m.tracks[s]
  const at = (s, t) => nearest(track(s), t)
  const deaths = combat.filter(e => e[1] === 'DEATH' && realHero(e) && slotByName.has(e[3]))
  // The whole curve is context, never assigned to a player as their own gold.
  const advantage = (t, slot) => {
    const i = Math.min(Math.max(0, Math.floor(t / 60)), (replay.radiant_gold_adv?.length ?? 1) - 1)
    return (replay.radiant_gold_adv?.[i] ?? 0) * (slot < 128 ? 1 : -1)
  }
  const snapshot = (t) => slots.flatMap(s => {
    const p = at(s, t)
    return p ? [{ slot: s, heroId: m.heroes[s], x: p[1], y: p[2], alive: p[3] === 0 }] : []
  })
  const result = {}
  for (const slot of slots) {
    const heroId = m.heroes[slot], heroName = heroes.find(h => h.id === heroId)?.shortName
    const name = 'npc_dota_hero_' + heroName
    const own = combat.filter(e => e[2] === name && activeHero(e))
    const episodes = []
    const add = (start, end, kind, verdict, facts) => {
      const p = at(slot, start), before = at(slot, Math.max(0, start - 30))
      if (!p) return
      const from = Math.max(0, start - 30), to = Math.min(match.durationSeconds, end + 10)
      const route = track(slot).filter(p => p[0] >= from && p[0] <= to && p[0] % 4 === 0).map(p => [p[0], p[1], p[2], p[3]])
      episodes.push({ t: start, end, kind, verdict, teamGold: advantage(start, slot),
        moved: before && before[3] === 0 && p[3] === 0 ? Math.round(distance(before, p)) : null,
        facts, route, heroes: snapshot(start) })
    }
    // Prove involvement in each kill using direct damage/casts to the real
    // victim AND the killer/victim position. Mere proximity earns no credit.
    const engagements = []
    for (const death of deaths) {
      const t = death[0], victim = slotByName.get(death[3])
      const self = victim === slot
      if (!self && (victim < 128) === (slot < 128)) continue
      const p = at(slot, Math.max(0, t - 2)), v = at(victim, Math.max(0, t - 2))
      const hits = own.filter(e => e[0] >= t - 15 && e[0] <= t && e[3] === death[3] && realHero(e) && ['DAMAGE', 'ABILITY'].includes(e[1]))
      const involved = !self && v && (death[2] === name || p?.[3] === 0 && distance(p, v) <= 2200 && hits.length > 0)
      if (!self && !involved) continue
      let block = engagements.at(-1)
      if (!block || t - block.end > 25) { block = { t, end: t, kills: [], deaths: [], damage: 0 }; engagements.push(block) }
      block.end = t
      if (self) block.deaths.push(t)
      else { block.kills.push(names.get(death[3])); block.damage += hits.filter(e => e[1] === 'DAMAGE').reduce((s, e) => s + (Number(e[4]) || 0), 0) }
    }
    for (const block of engagements) {
      const { t, end, kills, deaths: lost, damage } = block
      const p = at(slot, Math.max(0, t - 4))
      const nearby = p ? snapshot(Math.max(0, t - 4)).filter(h => h.alive && distance(p, [0, h.x, h.y]) <= 1800) : []
      const allies = nearby.filter(h => (h.slot < 128) === (slot < 128)).length
      const enemies = nearby.length - allies
      const before = at(slot, Math.max(0, t - 30)), now = at(slot, t)
      const rotation = before?.[3] === 0 && now?.[3] === 0 && distance(before, now) > 1800
      add(t, end, rotation ? 'rotation' : 'fight', kills.length > lost.length ? 1 : kills.length < lost.length ? -1 : 0,
        { kills: kills.length, deaths: lost.length, damage: Math.round(damage), victims: kills, allies, enemies })
    }
    // Building pressure only becomes a successful objective when that exact
    // building falls; pushing damage by itself stays an observed neutral play.
    const buildingHits = own.filter(e => e[1] === 'DAMAGE' && /npc_dota_(goodguys|badguys)_(tower|.*rax|fort)/.test(e[3]))
    const sieges = []
    for (const e of buildingHits) {
      let siege = sieges.at(-1)
      if (!siege || e[0] - siege.end > 20 || siege.target !== e[3]) { siege = { t: e[0], end: e[0], target: e[3], damage: 0 }; sieges.push(siege) }
      siege.end = e[0]; siege.damage += Number(e[4]) || 0
    }
    for (const siege of sieges) {
      if (siege.damage < 100) continue
      const fall = (replay.objectives ?? []).find(o => o.type === 'building_kill' && o.key === siege.target && o.time >= siege.t && o.time <= siege.end + 30)
      add(siege.t, siege.end, 'objective', fall ? 1 : 0, { target: siege.target, damage: Math.round(siege.damage), destroyed: Boolean(fall) })
    }
    // Lane pressure: actual enemy lane creeps killed away from one's base.
    // It remains neutral; standing in a lane is not proof that space was made.
    const waves = []
    for (const e of own.filter(e => e[1] === 'DEATH' && /npc_dota_creep_(goodguys|badguys)_(melee|ranged|siege)/.test(e[3]))) {
      const p = at(slot, e[0])
      if (!p || p[3] !== 0 || (p[1] + p[2] - 255) * (slot < 128 ? 1 : -1) < 0) continue
      let wave = waves.at(-1)
      if (!wave || e[0] - wave.end > 20) { wave = { t: e[0], end: e[0], creeps: 0 }; waves.push(wave) }
      wave.end = e[0]; wave.creeps++
    }
    for (const wave of waves) if (wave.creeps >= 4 && !episodes.some(e => Math.abs(e.t - wave.t) < 30))
      add(wave.t, wave.end, 'pressure', 0, { creeps: wave.creeps })
    episodes.sort((a, b) => a.t - b.t)
    const good = episodes.filter(e => e.verdict > 0).length, bad = episodes.filter(e => e.verdict < 0).length
    const first = track(slot)[0], last = track(slot).at(-1)
    const coverage = Math.min(1, track(slot).length * m.sampleSeconds / match.durationSeconds)
    const p15 = at(slot, 900), enemy15 = slots.filter(s => (s < 128) !== (slot < 128)).reduce((sum, s) => sum + (at(s, 900)?.[4] ?? 0), 0)
    const team15 = slots.filter(s => (s < 128) === (slot < 128)).reduce((sum, s) => sum + (at(s, 900)?.[4] ?? 0), 0)
    result[slot] = { version: MAP_PLAYS_VERSION, heroId, sampleSeconds: m.sampleSeconds, coverage,
      score: coverage >= .9 && first[0] <= 5 && last[0] >= match.durationSeconds - 10 && good + bad >= 3 && episodes.length <= 80 ? Math.round(100 * (good - bad) / (good + bad)) : null,
      good, bad, neutral: episodes.length - good - bad, teamGoldAt15: advantage(900, slot),
      networthAt15: p15?.[4] ?? null, teamNetworthAt15: team15, enemyNetworthAt15: enemy15,
      episodes: episodes.slice(0, 80),structures }
  }
  return result
}

export function validMapPlays(value) {
  if (value == null) return true
  if (value.version !== MAP_PLAYS_VERSION || !Number.isInteger(value.heroId) || value.heroId <= 0 || value.sampleSeconds !== 2 ||
      !Number.isFinite(value.coverage) || value.coverage < 0 || value.coverage > 1 ||
      ![value.good, value.bad, value.neutral].every(n => Number.isInteger(n) && n >= 0) ||
      !Array.isArray(value.episodes) || value.episodes.length > 80) return false
  if (value.score !== null && (value.coverage < .9 || value.good + value.bad < 3 ||
      value.score !== Math.round(100 * (value.good - value.bad) / (value.good + value.bad)))) return false
  if (value.score !== null && (value.good !== value.episodes.filter(e => e?.verdict === 1).length ||
      value.bad !== value.episodes.filter(e => e?.verdict === -1).length || value.neutral !== value.episodes.filter(e => e?.verdict === 0).length)) return false
  if(value.structures!=null&&(!Array.isArray(value.structures)||value.structures.length>100||value.structures.some(s=>!s||typeof s.kind!=='string'||s.kind.length>100||s.key!=null&&(typeof s.key!=='string'||s.key.length>160)||![2,3].includes(s.team)||![s.x,s.y].every(Number.isFinite)||s.destroyedAt!=null&&(!Number.isFinite(s.destroyedAt)||s.destroyedAt<0))))return false
  return value.episodes.every(e => e && Number.isFinite(e.t) && e.t >= 0 && Number.isFinite(e.end) && e.end >= e.t &&
    ['fight', 'rotation', 'objective', 'pressure'].includes(e.kind) && [-1, 0, 1].includes(e.verdict) &&
    Number.isFinite(e.teamGold) && (e.moved === null || Number.isFinite(e.moved) && e.moved >= 0) &&
    e.facts && typeof e.facts === 'object' && Object.entries(e.facts).every(([key, v]) =>
      key === 'target' ? typeof v === 'string' && v.length < 160 : key === 'destroyed' ? typeof v === 'boolean' :
      key === 'victims' ? Array.isArray(v) && v.length <= 10 && v.every(Number.isInteger) : Number.isFinite(v) && v >= 0) &&
    Array.isArray(e.route) && e.route.length <= 1000 && e.route.every(p => Array.isArray(p) && p.length === 4 && p.every(Number.isFinite)) &&
    Array.isArray(e.heroes) && e.heroes.length <= 10 && e.heroes.every(h => Number.isInteger(h.slot) && Number.isInteger(h.heroId) && Number.isFinite(h.x) && Number.isFinite(h.y) && typeof h.alive === 'boolean'))
}
