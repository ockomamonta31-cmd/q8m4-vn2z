import SteamUser from 'steam-user'
import protobuf from 'protobufjs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Keep this small wire schema independent of the training/role collector.
const proto = protobuf.parse(`syntax = "proto2";
message Request { optional uint64 match_id = 1; }
message Match {
  optional uint64 match_id = 6;
  optional uint32 cluster = 10;
  optional fixed32 replay_salt = 13;
  optional uint32 replay_state = 34;
}
message Response { optional uint32 result = 1; optional Match match = 2; }
`).root
export const gcRequest = proto.lookupType('Request')
export const gcResponse = proto.lookupType('Response')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Valve's game coordinator is the only source that answers for a match whose
 * replay has just been written, and it is the flakiest one: a session may never
 * finish the clientHello handshake, and a match request is either answered in
 * about two seconds or dropped without a reply. Neither of those is per-match
 * either, so the same question can fail and then succeed a minute later.
 *
 * Two rules follow, and they are the difference between a queue that drains and
 * one that reports forty matches as addressless without asking anything:
 *
 * - One dropped request never ends the batch. The previous version latched the
 *   first failure into a batch-wide `failure`, so a single lost packet made
 *   every later candidate answer "no replay address" instantly.
 * - The coordinator is not a bulk service. Valve throttles an account that asks
 *   about forty games every ten minutes, which is exactly what filled this
 *   queue with games old enough that the replay no longer exists. `sessions`
 *   and `budgetMs` bound one run; the caller is expected to bring only fresh
 *   matches here and to let OpenDota publish addresses for everything else.
 */
export function createReplayGc({ env = process.env, Steam = SteamUser,
  connectMs = 20_000, requestMs = 8_000, asks = 3, attempts = 3, retryMs = 1_000,
  sessions = 4, budgetMs = 180_000, onRefreshToken = () => {} } = {}) {
  const configured = Boolean(env.STEAM_REFRESH_TOKEN || (env.STEAM_ACCOUNT && env.STEAM_PASSWORD))
  // The budget bounds the asking, not the batch. Measured from process start it
  // was already gone by the time the coordinator pass ran — the OpenDota pass
  // ahead of it alone outlasts it — so every question answered "budget spent"
  // without Steam ever being contacted.
  let startedAt
  let state, opened = 0, fatal, closed = false

  const spent = () => startedAt != null && Date.now() - startedAt > budgetMs

  function endSession(error) {
    const current = state
    state = undefined
    if (!current) return
    clearInterval(current.hello)
    clearTimeout(current.deadline)
    const job = current.pending
    current.pending = undefined
    if (job) { clearTimeout(job.timer); job.reject(error ?? job.error) }
    try { current.steam.logOff() } catch {}
  }

  function open() {
    return new Promise((resolve, reject) => {
      const next = { steam: undefined, hello: undefined, deadline: undefined, pending: undefined, ready: false }
      state = next
      opened++
      let settled = false
      const settle = error => { if (settled) return; settled = true; if (error) reject(error); else resolve(next) }
      // A login or handshake failure is batch-fatal: forty candidates must not
      // trigger forty Steam logins against an account Valve already distrusts.
      // A dropped match request is not fatal, so it is retried instead.
      const fail = error => { fatal ??= error; if (state === next) endSession(error); settle(error) }
      next.steam = new Steam({
        dataDirectory: join(dirname(fileURLToPath(import.meta.url)), 'steam-data'),
        autoRelogin: false, promptForCode: false,
      })
      next.deadline = setTimeout(() => fail(new Error('Valve GC connection timed out')), connectMs)
      next.steam.on('error', error => fail(new Error(`Steam login/connection failed (${error.eresult ?? 'network'})`)))
      next.steam.on('disconnected', () => { if (!closed && state === next) fail(new Error('Steam disconnected')) })
      next.steam.on('steamGuard', () => fail(new Error('Steam Guard required; renew the bot refresh token locally')))
      next.steam.on('refreshToken', onRefreshToken)
      next.steam.on('loggedOn', () => { if (!fatal && !closed) next.steam.gamesPlayed(570, true) })
      next.steam.on('appLaunched', app => {
        if (app !== 570 || settled || closed || state !== next || next.hello) return
        const sendHello = () => {
          try { next.steam.sendToGC(570, 4006, {}, Buffer.alloc(0)) }
          catch { fail(new Error('Valve GC handshake failed')) }
        }
        next.hello = setInterval(sendHello, 5_000)
        sendHello()
      })
      next.steam.on('receivedFromGC', (app, type, body) => {
        // Only the live session may answer: a torn-down one is retried, and its
        // late reply must not be credited to the request in flight now.
        if (app !== 570 || closed || state !== next) return
        if (type === 4004) {
          next.ready = true
          clearInterval(next.hello); next.hello = undefined
          clearTimeout(next.deadline); next.deadline = undefined
          settle()
          return
        }
        if (type !== 7096 || !next.pending) return
        let response
        try { response = gcResponse.decode(body) }
        catch { endSession(new Error('Invalid Valve GC match response')); return }
        const job = next.pending
        const id = Number(response.match?.matchId ?? 0)
        // Error replies can omit match_id. Only one request is in flight.
        if (id && id !== job.id) return
        next.pending = undefined
        clearTimeout(job.timer)
        if (response.result !== 1) job.reject(new Error(`Valve GC match request failed (${response.result})`))
        else if (id !== job.id) job.reject(new Error('Valve GC returned the wrong match'))
        else job.resolve(response.match)
      })
      const login = env.STEAM_REFRESH_TOKEN ? { refreshToken: env.STEAM_REFRESH_TOKEN } : {
        accountName: env.STEAM_ACCOUNT, password: env.STEAM_PASSWORD,
        ...(env.STEAM_MACHINE_AUTH_TOKEN ? { machineAuthToken: env.STEAM_MACHINE_AUTH_TOKEN } : {}),
      }
      try { next.steam.logOn(login) }
      catch { fail(new Error('Steam login could not start')) }
    })
  }

  function ask(id) {
    const current = state
    if (!current?.ready) return Promise.reject(new Error('Valve GC session is not ready'))
    return new Promise((resolve, reject) => {
      const job = { id: Number(id), resolve, reject, error: undefined, timer: undefined, sent: 0 }
      const send = () => {
        job.sent++
        try { current.steam.sendToGC(570, 7095, {}, gcRequest.encode({ matchId: job.id }).finish()) }
        catch { clearTimeout(job.timer); current.pending = undefined; job.reject(new Error('Valve GC match request could not be sent')) }
      }
      // Silence is the normal answer: a request is either answered in about two
      // seconds or dropped. A fresh session costs a whole Steam login, so the
      // same one is asked again before it is torn down.
      const wait = () => {
        job.timer = setTimeout(() => {
          if (current.pending !== job) return
          if (job.sent < asks) { wait(); send(); return }
          current.pending = undefined
          job.error = new Error(`Valve GC match request timed out after ${job.sent} asks`)
          job.reject(job.error)
        }, requestMs)
        send()
      }
      current.pending = job
      wait()
    })
  }

  return {
    configured,
    async lookup(id) {
      if (!configured) throw new Error('Valve GC bot is not configured')
      if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('Invalid match ID')
      if (closed) throw new Error('Valve GC session is closed')
      if (fatal) throw fatal
      startedAt ??= Date.now()
      if (spent()) throw (fatal = new Error('Valve GC time budget for this run is spent'))
      let last
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          if (!state?.ready) {
            if (opened >= sessions) throw (fatal = new Error('Valve GC session limit for this run is reached'))
            endSession()
            await open()
          }
          return await ask(id)
        } catch (error) {
          last = error
          // A dropped request may belong to a session that will never answer
          // again, so the retry starts from a fresh login rather than resending
          // into the same silence.
          endSession()
          if (closed || fatal || spent() || attempt === attempts) break
          await delay(retryMs * attempt)
        }
      }
      throw fatal ?? last
    },
    close() { closed = true; endSession(); fatal ??= new Error('Valve GC session closed') },
  }
}
