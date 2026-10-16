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

/**
 * A provider that answered "too many requests" is not a provider that is down:
 * the same call succeeds again a minute later. The difference decides whether a
 * batch loses the source for the rest of the run or waits it out.
 */
export function isThrottled(error) {
  return error?.throttled === true
}

export function createReplayMetadataResolver({ env = process.env, fetcher = fetch,
  gc = createReplayGc({ env }), timeoutMs = 8_000, log = console.warn } = {}) {
  // How long to keep away from a provider that asked us to slow down. Its own
  // `retry-after` wins when it sends one.
  const throttleMs = Math.max(1, Number(env.REPLAY_THROTTLE_SECONDS) || 30) * 1000
  // An unavailable provider gets one attempt per batch, rather than stalling
  // every queued match. The next scheduled batch tries it again.
  const failed = new Map()
  const throttled = waitMs => Object.assign(new Error('HTTP 429'), { throttled: true, waitMs })
  // OpenDota reports what is left of the caller's quota in headers. The runner
  // shares its address with every other project on GitHub's pool, so without
  // this number a batch that spent the day's limit looks exactly like a provider
  // that is down.
  let remainingDay = null
  async function json(url, options, signal, allow404 = false) {
    const response = await fetcher(url, { ...options, signal })
    const left = response.headers?.get?.('x-rate-limit-remaining-day')
    if (left != null) { const value = Number(left); if (Number.isFinite(value)) remainingDay = value }
    if (allow404 && response.status === 404) { await response.body?.cancel(); return null }
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 429 || response.status === 503) {
        const retry = Number(response.headers?.get?.('retry-after'))
        throw throttled(Number.isFinite(retry) && retry > 0 ? retry * 1000 : throttleMs)
      }
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  }
  /**
   * Remember a failure so the rest of the batch does not pay for it again. An
   * outage lasts the whole run; a throttle expires, because the provider that
   * turned us away a moment ago is the one that can still answer.
   */
  const park = (name, error) => failed.set(name, {
    error,
    until: isThrottled(error) ? Date.now() + (error.waitMs ?? throttleMs) : Infinity,
  })
  const parked = name => {
    const entry = failed.get(name)
    return entry && entry.until > Date.now() ? entry.error : null
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
      // Asking the coordinator is the same provider, so a provider that just
      // asked us to slow down does not get this call either.
      const wait = parked('OpenDota')
      if (wait) throw wait
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
            const wait = parked(provider.name)
            if (wait) throw wait
            const value = await provider.read()
            failed.delete(provider.name)
            answered = true
            if (!value) continue
            address = value.address
            endedAt = value.endedAt
          } catch (error) {
            // A provider that answered without metadata is not broken.
            if (!error) continue
            errors.push({ provider: provider.name, error })
            // Our own timeout is exactly the failure worth remembering. The
            // clock aborts this controller before the catch runs, so keying the
            // cache on the signal kept it empty and made every candidate in the
            // batch pay the full timeout again. The abort in `finally` below
            // runs after this loop, so it is not what is seen here.
            if (!failed.has(provider.name) || !parked(provider.name)) {
              log(`Replay metadata ${provider.name}: ${error.message}`)
              park(provider.name, error)
            }
          }
        }
      } finally { clearTimeout(timer); controller.abort() }
      let gcError = null, gcState = null
      if (!address && allowGc && gc.configured) {
        try {
          const value = await gc.lookup(Number(id))
          answered = true
          gcState = value?.replayState ?? null
          // The coordinator reports deleted and expired replays as a state
          // instead of an address, and only an address can be downloaded.
          // Valve's own enum: 0 = REPLAY_AVAILABLE, 1 = NOT_RECORDED, 2 = EXPIRED.
          if (value && value.replayState !== 1 && value.replayState !== 2) {
            address = replayMetadata(id, Number(value.matchId), value.cluster, value.replaySalt, 'Valve GC')
          }
        } catch (error) {
          errors.push({ provider: 'Valve GC', error })
          // Не только в warn: молчание координатора уже проходило мимо сводки,
          // потому что 404 от OpenDota выставлял answered и глушил бросок.
          gcError = error.message
          log(`Replay metadata Valve GC: ${error.message}`)
        }
      }
      if (!answered && errors.length) {
        const error = new Error(`Replay metadata sources unavailable: ${errors.map(entry => `${entry.provider}: ${entry.error.message}`).join('; ')}`)
        // Only a batch where every source merely asked us to slow down is a
        // throttle. Anything else is a real failure and stays one.
        error.throttled = errors.every(entry => isThrottled(entry.error))
        throw error
      }
      return { address, endedAt, source: address?.source ?? null, gcError, gcState }
    },
    // The caller decides whether asking Valve is worth a request at all.
    gcConfigured: gc.configured,
    // Quota left for the address this run was given, or null if no provider
    // answered with a header yet.
    remainingQuota: () => remainingDay,
    close() { gc.close() },
  }
}
