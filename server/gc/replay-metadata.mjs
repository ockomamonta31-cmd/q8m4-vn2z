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
  return {
    async lookup(id) {
      if (!/^\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('Invalid match ID')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const providers = [{ name: 'OpenDota', read: async () => {
        const value = await json(`https://api.opendota.com/api/matches/${id}`, {}, controller.signal, true)
        // An empty body means the provider has no metadata yet; only a body
        // naming a different match is a real error.
        if (!value || value.match_id == null) return null
        return replayMetadata(id, value.match_id, value.cluster, value.replay_salt, 'OpenDota')
      } }]
      const stratzToken = env.STRATZ_API_TOKEN || env.VITE_STRATZ_TOKEN
      if (stratzToken) providers.push({ name: 'STRATZ', read: async () => {
        const result = await json('https://api.stratz.com/graphql', {
          method: 'POST', headers: { authorization: `Bearer ${stratzToken}`, 'content-type': 'application/json', 'user-agent': 'STRATZ_API' },
          body: JSON.stringify({ query: 'query Replay($id:Long!){match(id:$id){id clusterId replaySalt}}', variables: { id: Number(id) } }),
        }, controller.signal)
        if (result.errors?.length) throw new Error('GraphQL request failed')
        const value = result.data?.match
        if (value === null) return null
        if (!value) throw new Error('Invalid GraphQL response')
        return replayMetadata(id, value.id, value.clusterId, value.replaySalt, 'STRATZ')
      } })
      let answered = false, found = false
      const errors = []
      try {
        const requests = providers.map(async provider => {
          try {
            if (failed.has(provider.name)) throw failed.get(provider.name)
            const value = await provider.read()
            answered = true
            if (!value) throw null
            return value
          } catch (error) {
            if (error && !found) {
              errors.push(`${provider.name}: ${error.message}`)
              if (!failed.has(provider.name) && !controller.signal.aborted) log(`Replay metadata ${provider.name}: ${error.message}`)
              failed.set(provider.name, error)
            }
            throw error
          }
        })
        try { const value = await Promise.any(requests); found = true; return value }
        catch { /* All HTTP sources answered without metadata or failed. */ }
      } finally { clearTimeout(timer); controller.abort() }
      if (gc.configured) {
        try {
          const value = await gc.lookup(Number(id))
          answered = true
          if (value.replayState === 1 || value.replayState === 2) return null
          return replayMetadata(id, Number(value.matchId), value.cluster, value.replaySalt, 'Valve GC')
        } catch (error) { errors.push(`Valve GC: ${error.message}`); log(`Replay metadata Valve GC: ${error.message}`) }
      }
      if (answered) return null
      throw new Error(`Replay metadata sources unavailable: ${errors.join('; ')}`)
    },
    close() { gc.close() },
  }
}
