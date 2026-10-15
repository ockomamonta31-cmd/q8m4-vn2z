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

// One lazy, sequential GC session per ingest batch. A failed session stays
// failed for this batch so forty candidates cannot trigger forty Steam logins.
export function createReplayGc({ env = process.env, Steam = SteamUser,
  connectMs = 35_000, requestMs = 10_000, onRefreshToken = () => {} } = {}) {
  const configured = Boolean(env.STEAM_REFRESH_TOKEN || (env.STEAM_ACCOUNT && env.STEAM_PASSWORD))
  let steam, connecting, ready = false, closed = false, failure, pending, hello, deadline
  let accept, refuse
  function stop(error) {
    failure ??= error
    ready = false
    clearInterval(hello)
    clearTimeout(deadline)
    refuse?.(failure)
    if (pending) { clearTimeout(pending.timer); pending.reject(failure); pending = undefined }
    steam?.logOff()
  }
  function connect() {
    connecting = new Promise((resolve, reject) => {
      accept = resolve; refuse = reject
      steam = new Steam({
        dataDirectory: join(dirname(fileURLToPath(import.meta.url)), 'steam-data'),
        autoRelogin: false, promptForCode: false,
      })
      deadline = setTimeout(() => stop(new Error('Valve GC connection timed out')), connectMs)
      steam.on('error', error => stop(new Error(`Steam login/connection failed (${error.eresult ?? 'network'})`)))
      steam.on('disconnected', () => {
        if (!closed && !failure) stop(new Error('Steam disconnected'))
      })
      steam.on('steamGuard', () => stop(new Error('Steam Guard required; renew the bot refresh token locally')))
      steam.on('refreshToken', onRefreshToken)
      steam.on('loggedOn', () => { if (!closed && !failure) steam.gamesPlayed(570, true) })
      steam.on('appLaunched', app => {
        if (app !== 570 || closed || failure || ready || hello) return
        const sendHello = () => {
          try { steam.sendToGC(570, 4006, {}, Buffer.alloc(0)) }
          catch { stop(new Error('Valve GC handshake failed')) }
        }
        hello = setInterval(sendHello, 5_000)
        sendHello()
      })
      steam.on('receivedFromGC', (app, type, body) => {
        if (app !== 570 || closed || failure) return
        if (type === 4004) {
          ready = true; clearInterval(hello); clearTimeout(deadline); accept(); return
        }
        if (type !== 7096 || !pending) return
        let response
        try { response = gcResponse.decode(body) }
        catch { stop(new Error('Invalid Valve GC match response')); return }
        const id = Number(response.match?.matchId ?? 0)
        // Error replies can omit match_id. Only one request is in flight.
        if (id && id !== pending.id) return
        const job = pending; pending = undefined; clearTimeout(job.timer)
        if (response.result !== 1) job.reject(new Error(`Valve GC match request failed (${response.result})`))
        else if (id !== job.id) job.reject(new Error('Valve GC returned the wrong match'))
        else job.resolve(response.match)
      })
      const login = env.STEAM_REFRESH_TOKEN ? { refreshToken: env.STEAM_REFRESH_TOKEN } : {
        accountName: env.STEAM_ACCOUNT, password: env.STEAM_PASSWORD,
        ...(env.STEAM_MACHINE_AUTH_TOKEN ? { machineAuthToken: env.STEAM_MACHINE_AUTH_TOKEN } : {}),
      }
      try { steam.logOn(login) }
      catch { stop(new Error('Steam login could not start')) }
    })
    return connecting
  }
  return {
    configured,
    async lookup(id) {
      if (!configured) throw new Error('Valve GC bot is not configured')
      if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('Invalid match ID')
      if (closed || failure) throw failure ?? new Error('Valve GC session is closed')
      await (connecting ?? connect())
      if (pending) throw new Error('Valve GC requests must be sequential')
      return new Promise((resolve, reject) => {
        pending = { id: Number(id), resolve, reject,
          timer: setTimeout(() => stop(new Error('Valve GC match request timed out')), requestMs) }
        try { steam.sendToGC(570, 7095, {}, gcRequest.encode({ matchId: Number(id) }).finish()) }
        catch { stop(new Error('Valve GC match request could not be sent')) }
      })
    },
    close() { if (!closed) { closed = true; stop(new Error('Valve GC session closed')) } },
  }
}
