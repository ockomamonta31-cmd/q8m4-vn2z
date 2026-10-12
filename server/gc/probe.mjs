#!/usr/bin/env node
// Диагностика GC: что этот аккаунт вообще умеет вытаскивать.
//
//   1) MatchDetailsRequest (7095) на реальные id разной давности + битый id —
//      сырые байты ответа, чтобы не путать «пусто» с «не туда декодировали.
//   2) GetPlayerMatchHistory (7408) на свой и на чужой account_id — проверяет,
//      разрешено ли боту смотреть данные ДРУГИХ людей вообще.
//   3) MatchesMinimalRequest (8063) — пакетный запрос матчей (тот же путь, по
//      которому клиент рендерит историю). Ответы печатаем и как ASCII-дампом.
//
// Запуск: node server/gc/probe.mjs [match_id ...]

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const SteamUser = require('steam-user')
const protobuf = require('protobufjs')

const DOTA_APPID = 570
const MSG_CLIENT_HELLO = 4006
const MSG_CLIENT_WELCOME = 4004
const MSG_MATCH_DETAILS = [7095, 7096]
const MSG_PLAYER_HISTORY = [7408, 7409]
const MSG_MATCHES_MINIMAL = [8063, 8064]
const STEP_TIMEOUT_MS = 10000
const SPACING_MS = 1500
// Номер сборки реального клиента (appmanifest_570.acf → buildid). Именно его
// клиент кладёт в CMsgClientHello.version; GC по нему решает, servить ли данные.
const HELLO_VERSION = Number(process.env.GC_HELLO_VERSION || 0)

// Чужой account_id берём из живого фида (см. ниже в OTHER_ACCOUNT)
const DEFAULT_MATCH_IDS = ['9040392997', '9009312460', '123456789']
const OTHER_ACCOUNT = 1474657451

const root = protobuf
  .parse(`
syntax = "proto2";
message CMsgClientHello { optional uint32 version = 1; }
message CMsgClientWelcomeLite {
  optional uint32 version = 1;
  optional bytes game_data = 2;
  repeated bytes outofdate_subscribed_caches = 3;
  repeated bytes uptodate_subscribed_caches = 4;
  optional bytes location = 5;
  optional bytes save_game_key = 6;
  optional fixed32 item_schema_crc = 7;
  optional string items_game_url = 8;
  optional uint32 gc_socache_file_version = 9;
  optional string txn_country_code = 10;
}
message CMsgGCMatchDetailsRequest { optional uint64 match_id = 1; }
message CMsgGCMatchDetailsResponse { optional uint32 result = 1; optional bytes raw_match = 2; optional uint32 vote = 3; }
message CMsgDOTAGetPlayerMatchHistory {
  optional uint32 account_id = 1;
  optional uint64 start_at_match_id = 2;
  optional uint32 matches_requested = 3;
  optional uint32 request_id = 5;
  optional bool include_practice_matches = 7;
  optional bool include_custom_games = 8;
}
message CMsgDOTAGetPlayerMatchHistoryResponse {
  message Match {
    optional uint64 match_id = 1;
    optional uint32 start_time = 2;
    optional int32 hero_id = 3;
    optional bool winner = 4;
    optional uint32 game_mode = 5;
    optional int32 rank_change = 6;
    optional uint32 previous_rank = 7;
    optional uint32 lobby_type = 8;
    optional bool solo_rank = 9;
    optional bool abandon = 10;
    optional uint32 duration = 11;
  }
  repeated Match matches = 1;
  optional uint32 request_id = 2;
}
message CMsgClientToGCMatchesMinimalRequest { repeated uint64 match_ids = 1; }
message CMsgDOTAMatchMinimalPlayer {
  optional uint32 account_id = 1; optional int32 hero_id = 2;
  optional uint32 kills = 3; optional uint32 deaths = 4; optional uint32 assists = 5;
  optional uint32 player_slot = 7; optional string pro_name = 8; optional uint32 level = 9;
}
message CMsgDOTAMatchMinimal {
  optional uint64 match_id = 1; optional fixed32 start_time = 2; optional uint32 duration = 3;
  optional uint32 game_mode = 4; repeated CMsgDOTAMatchMinimalPlayer players = 6;
  optional uint32 radiant_score = 9; optional uint32 dire_score = 10; optional uint32 lobby_type = 11;
}
message CMsgClientToGCMatchesMinimalResponse {
  optional uint32 result = 1;
  repeated uint64 match_ids = 2;
  repeated CMsgDOTAMatchMinimal matches = 3;
  optional uint64 latest_match_id = 4;
}
`).root

const T = (n) => root.lookupType(n)
const Req = {
  details: T('CMsgGCMatchDetailsRequest'),
  history: T('CMsgDOTAGetPlayerMatchHistory'),
  minimal: T('CMsgClientToGCMatchesMinimalRequest'),
}
const Res = {
  details: T('CMsgGCMatchDetailsResponse'),
  history: T('CMsgDOTAGetPlayerMatchHistoryResponse'),
  minimal: T('CMsgClientToGCMatchesMinimalResponse'),
}

const ascii = (buf) =>
  Buffer.from(buf)
    .toString('latin1')
    .replace(/[^\x20-\x7e]/g, '·')
    .slice(0, 240)

function loadEnv() {
  const out = {}
  for (const line of readFileSync(join(HERE, '..', '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const cfg = loadEnv()
const MATCH_IDS = process.argv.slice(2).filter((a) => /^\d+$/.test(a))
const ids = MATCH_IDS.length ? MATCH_IDS : DEFAULT_MATCH_IDS

const steam = new SteamUser({ dataDirectory: join(HERE, 'steam-data'), language: 'english', promptForCode: false })
const CODE_FILE = join(HERE, 'code.txt')

steam.on('error', (e) => {
  console.error(`[steam] ошибка ${e.eresult ?? ''}: ${e.message}`)
  process.exit(1)
})
steam.on('disconnected', (e) => console.log('[steam] отключён:', e))

let buildId = 0
let helloSent = false
function sendHello(via, version) {
  if (helloSent) return
  helloSent = true
  const v = version ?? (HELLO_VERSION || buildId)
  console.log(`[gc] ClientHello version=${v || 'ПУСТО'} (после ${via})`)
  steam.sendToGC(
    DOTA_APPID,
    MSG_CLIENT_HELLO,
    {},
    T('CMsgClientHello').encode(v ? { version: v } : {}).finish(),
  )
}

// Один слушатель на все GC-ответы: ждём конкретный msgType с таймаутом.
let waiting = null
let started = false
steam.on('receivedFromGC', (appid, msgType, payload) => {
  if (appid !== DOTA_APPID) return
  if (msgType === MSG_CLIENT_WELCOME) {
    const w = T('CMsgClientWelcomeLite').decode(payload)
    console.log(
      `[gc] ← ClientWelcome ${payload.length}б: version=${w.version ?? '-'} schema_crc=${w.itemSchemaCrc ?? '-'}` +
        ` items_url=${JSON.stringify(w.itemsGameUrl ?? null)} so_files=${w.gcSocacheFileVersion ?? '-'}` +
        ` country=${JSON.stringify(w.txnCountryCode ?? null)} out_of_date_caches=${w.outofdateSubscribedCaches.length}` +
        ` up_to_date=${w.uptodateSubscribedCaches.length} game_data=${w.gameData?.length ?? 0}б`,
    )
    if (!started) {
      started = true
      if (w.version && !HELLO_VERSION) {
        helloSent = false
        sendHello('welcome', w.version)
      }
      setTimeout(() => run().catch((e) => console.error('[probe] сбой:', e.stack)), 1500)
    }
    return
  }
  if (!waiting || waiting.msgType !== msgType) {
    console.log(`[gc] ← фон: ${msgType}, ${payload?.length ?? 0} байт`)
    return
  }
  const w = waiting
  waiting = null
  clearTimeout(w.timer)
  w.resolve(payload)
})

function expect(msgType, send) {
  return new Promise((resolve) => {
    waiting = {
      msgType,
      resolve,
      timer: setTimeout(() => {
        waiting = null
        resolve(null)
      }, STEP_TIMEOUT_MS),
    }
    send()
  })
}

const tick = async (ms = SPACING_MS) => new Promise((r) => setTimeout(r, ms))

/** varint для поля 1 (wire type 0) — ручной encode без схемы. */
function varint(n) {
  const out = []
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80)
    n >>>= 7
  }
  out.push(n & 0x7f)
  return out
}

async function run() {
  const own = steam.steamID?.accountid ?? null
  console.log(`\n########## 0. сессия: account_id=${own} ##########`)

  console.log('\n########## 1. MatchDetails (7095/7096) ##########')
  for (const id of ids) {
    const payload = await expect(MSG_MATCH_DETAILS[1], () =>
      steam.sendToGC(DOTA_APPID, MSG_MATCH_DETAILS[0], {}, Req.details.encode({ match_id: Number(id) }).finish()),
    )
    if (!payload) console.log(`${id}: ТИШИНА ${STEP_TIMEOUT_MS}мс`)
    else {
      const msg = Res.details.decode(payload)
      console.log(
        `${id}: result=${msg.result} payload=${payload.length}б | сырые байты: ${ascii(payload)}` +
          ` | неизвестных полей: ${(msg.$unknown ?? []).length}`,
      )
    }
    await tick()
  }

  console.log('\n########## 2. GetPlayerMatchHistory (7408/7409) ##########')
  for (const [label, accountId] of [['СВОЙ', own], ['ЧУЖОЙ', OTHER_ACCOUNT]]) {
    if (!accountId) continue
    const payload = await expect(MSG_PLAYER_HISTORY[1], () =>
      steam.sendToGC(
        DOTA_APPID,
        MSG_PLAYER_HISTORY[0],
        {},
        Req.history
          .encode({ account_id: accountId, matches_requested: 20, include_practice_matches: true, include_custom_games: true })
          .finish(),
      ),
    )
    if (!payload) {
      console.log(`${label} (${accountId}): ТИШИНА ${STEP_TIMEOUT_MS}мс`)
      continue
    }
    const msg = Res.history.decode(payload)
    console.log(`${label} (${accountId}): ${msg.matches.length} матчей, ${payload.length}б`)
    for (const m of msg.matches.slice(0, 6)) {
      console.log(
        `   ${m.matchId} hero=${m.heroId} ${m.winner ? 'W' : 'L'} prevRank=${m.previousRank} Δ${m.rankChange}` +
          ` dur=${Math.round((m.duration ?? 0) / 60)}мин lobby=${m.lobbyType}`,
      )
    }
    await tick()
  }

  console.log('\n########## 3. MatchesMinimal (8063/8064) ##########')
  const payload = await expect(MSG_MATCHES_MINIMAL[1], () =>
    steam.sendToGC(
      DOTA_APPID,
      MSG_MATCHES_MINIMAL[0],
      {},
      Req.minimal.encode({ match_ids: ids.slice(0, 2).map(BigInt) }).finish(),
    ),
  )
  if (!payload) console.log(`ТИШИНА ${STEP_TIMEOUT_MS}мс — сообщения 8063 больше нет`)
  else {
    const msg = Res.minimal.decode(payload)
    console.log(`result=${msg.result} match_ids=${msg.matchIds.length} matches=${msg.matches.length}, ${payload.length}б`)
    for (const m of msg.matches) {
      console.log(`  ${m.matchId} players=${m.players.length} dur=${m.duration}`)
      for (const p of m.players.slice(0, 10)) console.log(`    id=${p.accountId} name=${JSON.stringify(p.proName ?? null)} hero=${p.heroId}`)
    }
    console.log(`  ASCII-дамп: ${ascii(payload)}`)
  }

  console.log('\n########## 4. MatchmakingStats (7197/7198) — контрольная точка ##########')
  console.log('  Глобальный запрос без состояния аккаунта: если ответит — сессия и аккаунт для чтения годны.')
  const mm = await expect(7198, () => steam.sendToGC(DOTA_APPID, 7197, {}, Buffer.alloc(0)))
  if (!mm) console.log(`  ТИШИНА ${STEP_TIMEOUT_MS}мс`)
  else console.log(`  ответ ${mm.length}б: ${ascii(mm)}`)

  console.log('\n########## 5. GetProfileCard (7534/7535) — есть ли Dota-профиль ##########')
  for (const [label, accountId] of [['СВОЙ', own], ['ЧУЖОЙ', OTHER_ACCOUNT]]) {
    if (!accountId) continue
    const pc = await expect(7535, () =>
      steam.sendToGC(DOTA_APPID, 7534, {}, Buffer.from([0x08, ...varint(accountId)])),
    )
    if (!pc) {
      console.log(`  ${label} (${accountId}): ТИШИНА ${STEP_TIMEOUT_MS}мс`)
      continue
    }
    console.log(`  ${label} (${accountId}): ответ ${pc.length}б, result=${pc[1] ?? '?'}: ${ascii(pc)}`)
    await tick(700)
  }

  steam.logOff()
  setTimeout(() => process.exit(0), 400)
}

steam.on('loggedOn', () => {
  console.log(`[steam] залогинен, account_id=${steam.steamID?.accountid}`)
  steam.gamesPlayed(DOTA_APPID, true)
  // Первый hello — без версии; актуальную версию GC называет сам в Welcome.
  setTimeout(() => sendHello('таймер'), 600)
  setTimeout(() => {
    if (!started) {
      started = true
      console.log('[gc] ClientWelcome так и не пришёл — всё равно пробуем спрашивать')
      run().catch((e) => console.error('[probe] сбой:', e.stack))
    }
  }, 12000)
})

const code = existsSync(CODE_FILE) ? readFileSync(CODE_FILE, 'utf8').trim() : ''
const login = { accountName: cfg.STEAM_ACCOUNT, password: cfg.STEAM_PASSWORD, rememberPassword: true }
if (code) (code.length <= 5 ? (login.twoFactorCode = code) : (login.authCode = code))
if (!cfg.STEAM_ACCOUNT || !cfg.STEAM_PASSWORD) {
  console.error('В .env нет STEAM_ACCOUNT / STEAM_PASSWORD')
  process.exit(1)
}
steam.logOn(login)
