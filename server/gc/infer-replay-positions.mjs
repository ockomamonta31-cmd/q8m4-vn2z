export function inferReplayPositions(players, replayPlayers) {
  const positions = new Map()
  const farmOrder = (team) => {
    const score = new Map(team.map((p) => [p, 0]))
    for (const [key, weight] of [['goldPerMinute', .35], ['networth', .3], ['numLastHits', .2], ['experiencePerMinute', .15]]) {
      [...team].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)).forEach((p, i) => score.set(p, score.get(p) + (team.length - i) * weight))
    }
    return [...team].sort((a, b) => score.get(b) - score.get(a))
  }
  // Final net worth often promotes a snowballing pos 4 above their pos 3.
  // Use the first ten replay minutes to split each duo lane instead.
  const laneFarmOrder = (lane) => {
    const at = (parsed, field) => {
      const series = parsed?.[field]
      if (!Array.isArray(series) || !series.length) return null
      const times = parsed.times ?? series.map((_, i) => i * 60)
      let index = 0
      while (index + 1 < times.length && Number(times[index + 1]) <= 600) index++
      return Number(series[index]) || 0
    }
    const fields = [['lh_t', .5], ['networth_t', .3], ['xp_t', .12], ['gold_t', .08]]
    const available = fields.filter(([key]) => lane.some((x) => at(x.parsed, key) !== null))
    if (!available.length) return farmOrder(lane.map((x) => x.p)).map((p) => lane.find((x) => x.p === p))
    const score = new Map(lane.map((x) => [x, 0]))
    for (const [key, weight] of available) {
      const divisor = available.reduce((sum, [, w]) => sum + w, 0)
      ;[...lane].sort((a, b) => (at(b.parsed, key) ?? 0) - (at(a.parsed, key) ?? 0))
        .forEach((x, i) => score.set(x, score.get(x) + ((lane.length - i) / lane.length) * weight / divisor))
    }
    // Early support purchases break close lane-farm ties without over-weighting one ward.
    for (const x of lane) {
      const supportBuys = (x.parsed?.purchase_log ?? []).filter((e) => Number(e.time) <= 600 && /ward_observer|ward_sentry|smoke_of_deceit|dust_of_appearance/.test(String(e.key))).length
      score.set(x, score.get(x) - Math.min(supportBuys, 3) * .035)
    }
    return [...lane].sort((a, b) => score.get(b) - score.get(a))
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
    const safeShare = ({ parsed }) => {
      let total = 0, safe = 0
      for (const [x, ys] of Object.entries(parsed?.lane_pos ?? {})) for (const [y, count] of Object.entries(ys)) {
        total += count
        if ((Number(x) - Number(y)) * (radiant ? 1 : -1) > 20) safe += count
      }
      return total ? safe / total : 0
    }
    const byMid = [...slots].sort((a, b) => midShare(b) - midShare(a))
    if (byMid.length !== 5 || midShare(byMid[0]) < .55 || midShare(byMid[0]) - midShare(byMid[1]) < .2) {
      farmOrder(team).forEach((p, i) => positions.set(slots.find((x) => x.p === p).slot, { position: i + 1, positionSource: 'stats' }))
      continue
    }
    positions.set(byMid[0].slot, { position: 2, positionSource: 'replay', lane: 'mid' })
    const other = slots.filter((x) => x.p !== byMid[0].p)
    const byLane = [...other].sort((a, b) => safeShare(b) - safeShare(a))
    if (safeShare(byLane[1]) < .5 || safeShare(byLane[2]) > .5) {
      farmOrder(team.filter((p) => p !== byMid[0].p)).forEach((p, i) => positions.set(slots.find((x) => x.p === p).slot, { position: [1, 3, 4, 5][i], positionSource: 'stats' }))
      continue
    }
    const safeLane = laneFarmOrder(byLane.slice(0, 2))
    const offLane = laneFarmOrder(byLane.slice(2))
    positions.set(safeLane[0].slot, { position: 1, positionSource: 'replay', lane: 'safelane' })
    positions.set(safeLane[1].slot, { position: 5, positionSource: 'replay', lane: 'safelane' })
    positions.set(offLane[0].slot, { position: 3, positionSource: 'replay', lane: 'offlane' })
    positions.set(offLane[1].slot, { position: 4, positionSource: 'replay', lane: 'offlane' })
  }
  return positions
}
