export function inferReplayPositions(players, replayPlayers) {
  const positions = new Map()
  const farmOrder = (team) => {
    const score = new Map(team.map((p) => [p, 0]))
    for (const [key, weight] of [['goldPerMinute', .35], ['networth', .3], ['numLastHits', .2], ['experiencePerMinute', .15]]) {
      [...team].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)).forEach((p, i) => score.set(p, score.get(p) + (team.length - i) * weight))
    }
    return [...team].sort((a, b) => score.get(b) - score.get(a))
  }

  for (const radiant of [true, false]) {
    const team = players.filter((p) => p.isRadiant === radiant)
    const slots = team.map((p, i) => ({ p, slot: (radiant ? 0 : 128) + i, parsed: replayPlayers.find((r) => Number(r.player_slot) === (radiant ? 0 : 128) + i) }))
    const midShare = ({ parsed }) => {
      let total = 0, mid = 0
      for (const [x, ys] of Object.entries(parsed?.lane_pos ?? {})) for (const [y, count] of Object.entries(ys)) {
        total += count
        if (Math.abs(Number(x) - Number(y)) <= 20) mid += count
      }
      return total ? mid / total : 0
    }
    const byMid = [...slots].sort((a, b) => midShare(b) - midShare(a))
    if (byMid.length !== 5 || midShare(byMid[0]) < .55 || midShare(byMid[0]) - midShare(byMid[1]) < .2) {
      farmOrder(team).forEach((p, i) => positions.set(slots.find((x) => x.p === p).slot, { position: i + 1, positionSource: 'stats' }))
      continue
    }
    positions.set(byMid[0].slot, { position: 2, positionSource: 'replay' })
    const other = farmOrder(team.filter((p) => p !== byMid[0].p))
    ;[1, 3, 4, 5].forEach((position, i) => positions.set(slots.find((x) => x.p === other[i]).slot, { position, positionSource: 'replay' }))
  }
  return positions
}
