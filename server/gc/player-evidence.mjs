// Compact measured evidence shared by replay ingest and the local API.
// Missing logs remain null; purchase, use and successful detection are distinct.
export function playerEvidence(replay, slot, heroId, heroes) {
  const p = replay?.players?.find(p => Number(p.player_slot) === slot)
  if (!p) return null
  const name = 'npc_dota_hero_' + heroes.find(h => h.id === heroId)?.shortName
  const combat = replay.movement?.combat
  const own = combat?.filter(e => e[2] === name && e[6] && !e[8])
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
  return { version: 1, curve, lane: { damage: sum(laneOut), damageTaken: sum(laneIn),
    attacks: laneOut?.filter(e => e[5] === 'dota_unknown').length ?? null,
    spellHits: laneOut?.filter(e => e[5] !== 'dota_unknown').length ?? null,
    activeMinutes: laneOut ? new Set(laneOut.map(e => Math.floor(e[0] / 60))).size : null },
    deaths, wards, uses, fights,
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
  return JSON.stringify(e).length < 180000
}
