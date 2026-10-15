import { createReplayGc } from './replay-gc.mjs'

export function replayMetadata(id, matchId, cluster, salt, source) {
  const positive = value => /^\d+$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) && Number(value) > 0
  if (String(id) !== String(matchId)) throw new Error(`${source} returned the wrong match`)
  if (salt == null || salt === 0 || salt === '0') return null
  if (!positive(cluster) || !positive(salt) || Number(cluster) > 0xffffffff || Number(salt) > 0xffffffff) {
    throw new Error(`${source} returned invalid replay metadata`)
  }
  return { cluster: Number(cluster), replay_salt: Number(salt), source }
}

/**
 * When a match ended, in seconds since the epoch. Providers report the start,
 * and a game can run for over an hour, so ageing a match by its start would
 * call a two-hour-old replay stale.
 */
export function replayEndedAt(start, duration) {
  const from = Number(start), length = Number(duration)
  if (!Number.isFinite(from) || from <= 0) return null
  return Math.round(from + (Number.isFinite(length) && length > 0 ? length : 0))
}

/**
 * Whether a match is still worth asking a provider about. Valve keeps a replay
 * for a few weeks at most, so an older match has no address left to find: those
 * only burn the scan window that fresh games need.
 * An unknown age counts as fresh. Providers answer nothing at all about a match
 * they have never seen, and a game nobody can date is far more likely to be one
 * that was just played than one from last month.
 */
export function replayAgeAction(ageMs, retentionMs) {
  const age = Number(ageMs)
  if (ageMs == null || !Number.isFinite(age)) return 'ask'
  return age > Number(retentionMs) ? 'expired' : 'ask'
}

export function createReplayMetadataResolver({ env = process.env, fetcher = fetch,
  gc = createReplayGc({ env }), timeoutMs = 8_000, log = console.warn } = {}) {
  // An unavailable provider gets one attempt per batch, rather than stalling
  // every queued match. The next scheduled batch tries it again.
  const failed = new Map()
  async function json(url, options, signal, allow404 = false) {
    const response = await fetcher(url, { ...options, signal })
    if (allow404 && response.status === 404) { await response.body?.cancel(); return null }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`) }
    return response.json()
  }
  const validId = id => /^\d+$/.test(String(id)) && Number.isSafeInteger(Number(id)) && Number(id) > 0
  return {
    /**
     * Ask OpenDota to crawl one match. Their own coordinator session publishes
     * the replay address about a minute later, and their API is built for many
     * callers, unlike asking Valve about every queued game ourselves.
     */
    async request(id) {
      if (!validId(id)) throw new Error('Invalid match ID')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        await json(`https://api.opendota.com/api/request/${id}`, { method: 'POST' }, controller.signal, true)
        return true
      } finally { clearTimeout(timer) }
    },
    /**
     * Resolve one match. An answer without an address is still an answer: it
     * tells the caller the match is real and when it ended, which is what
     * decides whether asking Valve about it is worth a request.
     */
    async lookup(id, { allowGc = true } = {}) {
      if (!validId(id)) throw new Error('Invalid match ID')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      // STRATZ used to be asked here too. Its public `replaySalt` came back null
      // for every match we checked, including ones whose address Valve had
      // already handed us, so it spent a request per candidate and never helped.
      const providers = [{ name: 'OpenDota', read: async () => {
        const value = await json(`https://api.opendota.com/api/matches/${id}`, {}, controller.signal, true)
        // An empty body means the provider has no metadata yet; only a body
        // naming a different match is a real error.
        if (!value || value.match_id == null) return null
        return {
          address: replayMetadata(id, value.match_id, value.cluster, value.replay_salt, 'OpenDota'),
          endedAt: replayEndedAt(value.start_time, value.duration),
        }
      } }]
      let address = null, endedAt = null, answered = false
      const errors = []
      try {
        for (const provider of providers) {
          try {
            if (failed.has(provider.name)) throw failed.get(provider.name)
            const value = await provider.read()
            answered = true
            if (!value) continue
            address = value.address
            endedAt = value.endedAt
          } catch (error) {
            // A provider that answered without metadata is not broken.
            if (!error) continue
            errors.push(`${provider.name}: ${error.message}`)
            if (!failed.has(provider.name) && !controller.signal.aborted) {
              log(`Replay metadata ${provider.name}: ${error.message}`)
              failed.set(provider.name, error)
            }
          }
        }
      } finally { clearTimeout(timer); controller.abort() }
      if (!address && allowGc && gc.configured) {
        try {
          const value = await gc.lookup(Number(id))
          answered = true
          // The coordinator reports deleted and expired replays as a state
          // instead of an address, and only an address can be downloaded.
          if (value && value.replayState !== 1 && value.replayState !== 2) {
            address = replayMetadata(id, Number(value.matchId), value.cluster, value.replaySalt, 'Valve GC')
          }
        } catch (error) { errors.push(`Valve GC: ${error.message}`); log(`Replay metadata Valve GC: ${error.message}`) }
      }
      if (!answered && errors.length) throw new Error(`Replay metadata sources unavailable: ${errors.join('; ')}`)
      return { address, endedAt, source: address?.source ?? null }
    },
    // The caller decides whether asking Valve is worth a request at all.
    gcConfigured: gc.configured,
    close() { gc.close() },
  }
}
