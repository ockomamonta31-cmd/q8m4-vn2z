// Our heuristic, not STRATZ's proprietary algorithm. Compare the resources of
// the initial lane group at 10:00; rotations/jungle income still belong to them.
export const LANE_RESULT_LABELS = {
  stomp: 'Разгромная победа', win: 'Победа', draw: 'Ничья',
  loss: 'Поражение', stomp_loss: 'Разгромное поражение',
}

export function startingLanes(replay) {
  const lanes = new Map()
  for (const p of replay?.players ?? []) {
    const slot = Number(p.player_slot), votes = [0, 0, 0]
    const vote = (x, y, count = 1) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || x + y < 190 || x + y > 330) return
      votes[Math.abs(x - y) <= 20 ? 1 : x > y ? 2 : 0] += count
    }
    const track = replay?.movement?.tracks?.[slot]
    if (Array.isArray(track)) {
      for (const [t, x, y, dead] of track) if (t >= 60 && t <= 300 && dead === 0) vote(x, y)
    } else {
      for (const [x, ys] of Object.entries(p.lane_pos ?? {}))
        for (const [y, count] of Object.entries(ys)) vote(Number(x), Number(y), Number(count))
    }
    const total = votes.reduce((a, b) => a + b, 0)
    const sorted = votes.map((n, i) => ({ n, i })).sort((a, b) => b.n - a.n)
    if (total >= 45 && sorted[0].n / total >= .6 && (sorted[0].n - sorted[1].n) / total >= .2)
      lanes.set(slot, ['top', 'mid', 'bottom'][sorted[0].i])
  }
  return lanes
}

export function laneOutcome(players, player, durationSeconds) {
  if (durationSeconds < 600 || players.length !== 10) return null
  // Never sum an incomplete group or replace an unknown lane with farm rank.
  const corridor = p => p.startingLane ?? (p.positionSource !== 'stats' && p.lane
    ? p.lane === 'mid' ? 'mid' : (p.lane === 'safelane') === p.isRadiant ? 'bottom' : 'top'
    : null)
  const lane = corridor(player)
  if (!lane || players.some(p => !corridor(p))) return null
  const group = radiant => players.filter(p => p.isRadiant === radiant && corridor(p) === lane)
  const totals = team => {
    if (!team.length) return null
    const phases = team.map(p => p.impactPhases?.find(x => x.label.startsWith('Начало')))
    if (phases.some(p => !p || p.endSeconds < 600 || !Number.isFinite(p.endSeconds)
      || !Number.isFinite(p.gold) || !Number.isFinite(p.experience))) return null
    return { gold: phases.reduce((n, p) => n + p.gold, 0), xp: phases.reduce((n, p) => n + p.experience, 0) }
  }
  const own = group(player.isRadiant), enemy = group(!player.isRadiant)
  const a = totals(own), b = totals(enemy)
  if (!a || !b || a.gold <= 0 || b.gold <= 0 || a.xp <= 0 || b.xp <= 0) return null
  const edge = (x, y) => 200 * (x - y) / (x + y)
  const goldEdge = edge(a.gold, b.gold), xpEdge = edge(a.xp, b.xp)
  // LH/kills are already reflected in income/XP: don't count them twice.
  // ponytail: fixed thresholds are a heuristic; calibrate with labelled lanes later.
  const score = .65 * goldEdge + .35 * xpEdge
  const decisive = Math.abs(score) >= 30 && goldEdge * Math.sign(score) >= 10 && xpEdge * Math.sign(score) >= 10
  const result = Math.abs(score) < 10 ? 'draw' : score > 0 ? decisive ? 'stomp' : 'win' : decisive ? 'stomp_loss' : 'loss'
  return { version: 1, result, lane, score: Math.round(score * 10) / 10,
    goldDelta: Math.round(a.gold - b.gold), xpDelta: Math.round(a.xp - b.xp),
    allyHeroIds: own.map(p => p.heroId), enemyHeroIds: enemy.map(p => p.heroId) }
}
