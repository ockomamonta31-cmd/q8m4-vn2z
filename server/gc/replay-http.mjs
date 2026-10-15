import { setTimeout as delay } from 'node:timers/promises'

// Read the body inside the retry window too: a server may send headers and stall.
export async function replayJson(url, options = {}, {
  timeoutMs = 30_000, allow404 = false, fetcher = fetch, sleep = delay,
} = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let retryable = true
    try {
      const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
      if (response.status === 404 && allow404) { await response.body?.cancel(); return null }
      retryable = response.status === 429 || response.status >= 500
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`HTTP ${response.status} (${new URL(url).pathname})`)
      }
      retryable = true
      return await response.json()
    } catch (error) {
      const transient = retryable && (error instanceof TypeError ||
        ['TimeoutError', 'AbortError'].includes(error?.name) || /^HTTP (429|5\d\d) /.test(error?.message))
      if (!transient || attempt === 2) throw error
      console.warn(`Temporary replay request failure (${new URL(url).pathname}); retry ${attempt + 1}/2`)
      await sleep(1000 * 2 ** attempt)
    }
  }
}
