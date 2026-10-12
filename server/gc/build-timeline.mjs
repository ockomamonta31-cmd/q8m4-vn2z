// Compact match timeline for the charts: derived from OpenDota parser output.
// Shared by the dev API (server/index.mjs) and the replay ingest
// (normalize-replay.mjs), so the Worker's D1 copy has exactly the same shape.

const BUILDING = /npc_dota_(goodguys|badguys)_(tower(\d)(?:_(top|mid|bot))?|(melee|range)_rax_(top|mid|bot)|fort)/

/** goodguys = Radiant. The name is the *victim* building, so the kill goes to the other side. */
function parseStructure(objective) {
  const hit = BUILDING.exec(objective.key ?? '')
  if (!hit) return null
  const token = hit[2]
  if (token === 'fort') return { kind: 'fort', tier: 4, lane: null }
  if (token.startsWith('tower')) return { kind: 'tower', tier: Number(token[5]), lane: hit[4] ?? null }
  return { kind: 'barracks', tier: token === 'melee_rax' ? 1 : 2, lane: hit[6] ?? null }
}

/** Siege creep and tower kills carry no player_slot, so the attacking team comes from `unit`. */
function attackerIsRadiant(objective) {
  const slot = Number(objective.player_slot)
  if (Number.isFinite(slot) && objective.player_slot != null) return slot < 128
  if (/goodguys/.test(objective.unit ?? '')) return true
  if (/badguys/.test(objective.unit ?? '')) return false
  return null
}

function heroIdOf(shortNameKey, byShortName) {
  const name = String(shortNameKey ?? '').replace('npc_dota_hero_', '')
  return byShortName.get(name) ?? byShortName.get(name.replaceAll('_', '')) ?? null
}

/**
 * @param replay  parsed replay (OpenDota shape)
 * @param match   normalized Valve match (src/api/types MatchDetails shape)
 * @param heroes  constants list, [{ id, shortName }]
 */
export function buildMatchTimeline(replay, match, heroes) {
  if (!replay || !Array.isArray(replay.players)) return null
  const byShortName = new Map(heroes.map((h) => [h.shortName, h.id]))
  const duration = Number(match.durationSeconds) || 0

  // player_slot -> heroId, so replay events can be attributed to a roster row
  const heroBySlot = new Map()
  for (const side of [true, false]) {
    match.players
      .filter((p) => p.isRadiant === side)
      .forEach((p, i) => heroBySlot.set((side ? 0 : 128) + i, p.heroId))
  }

  const times = replay.radiant_gold_adv ?? []
  const xpSeries = replay.radiant_xp_adv ?? []
  const step = times.length > 45 ? 2 : 1
  const series = times.map((gold, i) => ({
    t: Math.min(i * 60, duration),
    gold: Number(gold) || 0,
    xp: Number(xpSeries[i]) || 0,
  })).filter((_, i) => i % step === 0 || i === times.length - 1)

  const kills = []
  const firstBlood = { t: null, heroId: null }
  for (const parsed of replay.players) {
    const slot = Number(parsed.player_slot)
    if (!heroBySlot.has(slot)) continue
    for (const event of parsed.kills_log ?? []) {
      const t = Number(event.time)
      if (!Number.isFinite(t)) continue
      kills.push({ t, radiant: slot < 128, heroId: heroBySlot.get(slot), victimHeroId: heroIdOf(event.key, byShortName) })
    }
    if (parsed.firstblood_claimed && firstBlood.t === null) {
      firstBlood.t = Number(replay.objectives?.find((o) => o.type === 'CHAT_MESSAGE_FIRSTBLOOD')?.time ?? match.firstBloodSeconds ?? 0)
      firstBlood.heroId = heroBySlot.get(slot) ?? null
    }
  }
  kills.sort((a, b) => a.t - b.t)

  const structures = []
  const roshans = []
  for (const objective of replay.objectives ?? []) {
    const t = Number(objective.time)
    if (!Number.isFinite(t)) continue
    if (objective.type === 'building_kill') {
      const shape = parseStructure(objective)
      if (!shape) continue
      structures.push({
        ...shape,
        t,
        radiant: attackerIsRadiant(objective),
        heroId: objective.player_slot != null ? (heroBySlot.get(Number(objective.player_slot)) ?? null) : null,
      })
    } else if (objective.type === 'CHAT_MESSAGE_ROSHAN_KILL') {
      roshans.push({ t, radiant: Number(objective.team) === 2 })
    }
  }
  structures.sort((a, b) => a.t - b.t)

  // teamfights[].players is aligned with replay.players order, so slot lookup is positional
  const teamfights = (replay.teamfights ?? []).map((fight, index) => {
    let radiantKills = 0
    let direKills = 0
    const members = fight.players ?? []
    members.forEach((member, j) => {
      const slot = Number(replay.players[j]?.player_slot ?? j)
      const killed = Object.values(member.killed ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0)
      if (slot < 128) radiantKills += killed
      else direKills += killed
    })
    return {
      t: Number(fight.start) || 0,
      end: Number(fight.end) || Number(fight.start) || 0,
      deaths: Number(fight.deaths) || 0,
      radiantKills,
      direKills,
      index,
    }
  }).filter((fight) => fight.deaths >= 3)

  return { durationSeconds: duration, series, kills, structures, roshans, firstBlood, teamfights }
}
