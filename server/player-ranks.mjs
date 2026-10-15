// OpenDota's public medal is a current profile snapshot, not historical MMR.
// Cache separately from immutable matches and Steam names/avatars.
export function validRank(value) {
  if (!Number.isInteger(value)) return false
  const medal = Math.floor(value / 10), stars = value % 10
  return medal >= 1 && medal <= 7 ? stars >= 1 && stars <= 5 : medal === 8 && stars <= 5
}

export function rankCacheNeedsRefresh(key, value, time = Date.now()) {
  if (!value || !Number.isFinite(value.fetchedAt)) return true
  if (value.retryAt > time) return false
  if (String(key).startsWith('match-')) {
    const complete = value.players?.length === 10 && value.players.every(p =>
      Number.isInteger(p.account_id) && p.account_id > 0 && p.account_id < 0xffffffff)
    // Early match responses can hide IDs which become available after parsing.
    return time - value.fetchedAt >= (complete ? 24 * 3600_000 : 10 * 60_000)
  }
  return time - (value.tier ? value.fetchedAt : value.checkedAt ?? value.fetchedAt) >=
    (value.tier ? 24 * 3600_000 : 3600_000)
}

export function createRankResolver({ read, write, fetcher = fetch, now = Date.now }) {
  const pending = new Map()
  let cooldownUntil = 0
  async function one(id) {
    const stored = await read(id)
    const tier = validRank(stored?.tier) ? stored.tier : 0
    const usable = tier && now() - stored.fetchedAt <= 7 * 86400_000
    const fallback = usable ? stored : null
    if (tier && now() - stored.fetchedAt < 24 * 3600_000) return fallback
    if (!tier && stored && now() - stored.checkedAt < 3600_000) return null
    if (stored?.retryAt > now()) return fallback
    if (now() < cooldownUntil) return fallback
    try {
      const response = await fetcher('https://api.opendota.com/api/players/' + id, {
        signal: AbortSignal.timeout(4000),
      })
      if (response.status === 429) {
        console.warn('Rank API rate limited (HTTP 429)')
        const seconds = Number(response.headers.get('retry-after'))
        cooldownUntil = now() + (seconds > 0 ? Math.min(seconds, 3600) : 60) * 1000
        return fallback
      }
      if (!response.ok) throw new Error('Rank API HTTP ' + response.status)
      const body = await response.json()
      if (body.profile?.account_id !== id) throw new Error('Rank profile identity mismatch')
      const result = validRank(body.rank_tier)
        ? { tier: body.rank_tier, source: 'opendota', scope: 'current', fetchedAt: now(), checkedAt: now() }
        : { tier: 0, source: 'opendota', scope: 'current', fetchedAt: now(), checkedAt: now() }
      await write(id, result)
      return result.tier ? result : null
    } catch (error) {
      console.warn('Rank profile lookup failed:', error instanceof Error ? error.message : 'unknown error')
      // A provider outage must not make the match unavailable or erase a
      // previously observed medal. Retry later, rather than on every request.
      await write(id, { ...(stored ?? { tier: 0, fetchedAt: now(), checkedAt: now() }), retryAt: now() + 60_000 })
      return fallback
    }
  }
  async function get(id) {
    if (!pending.has(id)) pending.set(id, one(id).finally(() => pending.delete(id)))
    return pending.get(id)
  }
  async function resolve(ids) {
    const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0 && id < 0xffffffff)
    const out = new Map()
    // Bound upstream fan-out on a cold ten-player match.
    for (let i = 0; i < unique.length; i += 3) {
      await Promise.all(unique.slice(i, i + 3).map(async (id) => out.set(id, await get(id))))
    }
    return out
  }
  resolve.forMatch = async (match) => {
    const key = 'match-' + match.id
    let snapshot = await read(key)
    if (rankCacheNeedsRefresh(key, snapshot, now())) {
      try {
        const response = await fetcher('https://api.opendota.com/api/matches/' + match.id, { signal: AbortSignal.timeout(4000) })
        if (response.status === 429) cooldownUntil = now() + 60_000
        if (!response.ok) throw new Error('Match identity HTTP ' + response.status)
        const body = await response.json()
        if (Number(body.match_id) !== match.id || !Array.isArray(body.players) || body.players.length !== 10) throw new Error('Match identity mismatch')
        snapshot = { fetchedAt: now(), players: body.players.map((p) => ({
          account_id: p.account_id, hero_id: p.hero_id, player_slot: p.player_slot,
          rank_tier: p.rank_tier, personaname: p.personaname,
        })) }
        await write(key, snapshot)
      } catch (error) {
        console.warn('Match rank lookup failed:', error instanceof Error ? error.message : 'unknown error')
        snapshot = { fetchedAt: snapshot?.fetchedAt ?? 0, players: snapshot?.players ?? [], retryAt: now() + 60_000 }
        await write(key, snapshot)
      }
    }
    const players = await Promise.all(match.players.map(async (player) => {
      const publicPlayer = snapshot.players.find((p) => p.hero_id === player.heroId && (p.player_slot < 128) === player.isRadiant)
      if (!publicPlayer || (player.steamAccountId && publicPlayer.account_id !== player.steamAccountId)) return player
      const id = publicPlayer.account_id
      if (!(Number.isInteger(id) && id > 0 && id < 0xffffffff)) return player
      if (validRank(publicPlayer.rank_tier)) {
        const previous = await read(id)
        if (!previous || previous.fetchedAt < snapshot.fetchedAt) {
          await write(id, { tier: publicPlayer.rank_tier, source: 'opendota', scope: 'current',
            fetchedAt: snapshot.fetchedAt, checkedAt: snapshot.fetchedAt })
        }
      }
      return { ...player, steamAccountId: id, name: player.name ?? publicPlayer.personaname ?? null }
    }))
    const ranks = await resolve(players.map((p) => p.steamAccountId))
    return { ...match, players: players.map((p) => ({ ...p, ...rankFields(p, ranks.get(p.steamAccountId)) })) }
  }
  return resolve
}

export function rankFields(player, rank) {
  // Keep historical values if a match source actually supplied them.
  if (validRank(player.seasonRank) && player.rankScope !== 'current') {
    return { seasonRank: player.seasonRank, rankSource: player.rankSource ?? 'match', rankScope: 'match',
      ...(player.rankFetchedAt ? { rankFetchedAt: player.rankFetchedAt } : {}) }
  }
  return rank ? { seasonRank: rank.tier, rankSource: rank.source, rankScope: 'current', rankFetchedAt: rank.fetchedAt }
    : { seasonRank: 0, rankSource: null, rankScope: null, rankFetchedAt: null }
}
