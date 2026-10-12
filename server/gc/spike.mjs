#!/usr/bin/env node
// Спайк: умеем ли вообще говорить с Game Coordinator Dota 2.
//
// Цель одна — получить CMsgGCMatchDetailsResponse на матч, где Steam Web API
// маскирует игроков (account_id = 0xFFFFFFFF), и посмотреть:
//   1. вернёт ли GC настоящие account_id всех десятерых;
//   2. вернёт ли replay_salt (ключ к .dem-реплею).
//
// Запуск:  node server/gc/spike.mjs [match_id]
// Если Steam попросит код Steam Guard — скрипт создаст server/gc/NEED-CODE.txt,
// а код нужно положить в server/gc/code.txt и запустить снова.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const SteamUser = require('steam-user')
const protobuf = require('protobufjs')

const DOTA_APPID = 570
// Dota-ный enum EDOTAGCMsg начинается с 7000, а рукопожатие живёт в общем
// базовом EGCBaseClientMsg — том же, что использует CS2 (4006/4007).
const MSG_CLIENT_HELLO = 4006
const MSG_CLIENT_WELCOME = 4004
const MSG_SERVER_HELLO = 4007
const MSG_MATCH_DETAILS_REQUEST = 7095
const MSG_MATCH_DETAILS_RESPONSE = 7096
const MSG_PLAYER_HISTORY_REQUEST = 7408
const MSG_PLAYER_HISTORY_RESPONSE = 7409

const MATCH_ID = BigInt(process.argv[2] || '9012835702')
// OpenDota кодирует match_id как Number(matchId) и получает result=2 при
// «не найдено». BigInt у protobufjs для uint64 иногда даёт не тот байт-стрим,
// поэтому шлём числом, как работаетый клиент.
const MATCH_ID_NUM = Number(MATCH_ID)
const CODE_FILE = join(HERE, 'code.txt')
const NEED_FILE = join(HERE, 'NEED-CODE.txt')

function env() {
  const raw = readFileSync(join(HERE, '..', '..', '.env'), 'utf8')
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const cfg = env()
if (!cfg.STEAM_ACCOUNT || !cfg.STEAM_PASSWORD) {
  console.error('В .env нет STEAM_ACCOUNT / STEAM_PASSWORD')
  process.exit(1)
}

const root = new protobuf.Root().loadSync(join(HERE, 'dota-match.proto'))
const Req = root.lookupType('CMsgGCMatchDetailsRequest')
const Res = root.lookupType('CMsgGCMatchDetailsResponse')
const HistReq = root.lookupType('CMsgDOTAGetPlayerMatchHistory')
const HistRes = root.lookupType('CMsgDOTAGetPlayerMatchHistoryResponse')

const steam = new SteamUser({
  dataDirectory: join(HERE, 'steam-data'),
  language: 'english',
  // Не вешаемся на интерактивном промпте: без кода падаем сразу и понятно.
  promptForCode: false,
})

steam.on('error', (e) => {
  console.error(`[steam] ошибка ${e.eresult ?? ''}: ${e.message}`)
  process.exit(1)
})

steam.on('disconnected', (e) => console.log('[steam] отключён:', e))

steam.on('steamguard', (details, submitCode) => {
  console.log(`[steam] нужен код Steam Guard (нужно имя машины: ${details.codeNeedsMachineName})`)
  if (existsSync(CODE_FILE)) {
    const code = readFileSync(CODE_FILE, 'utf8').trim()
    console.log(`[steam] беру код ${code} из code.txt`)
    if (existsSync(NEED_FILE)) unlinkSync(NEED_FILE)
    submitCode(code)
    return
  }
  writeFileSync(NEED_FILE, `код Steam Guard для ${cfg.STEAM_ACCOUNT}\n`)
  console.log(`[steam] нет кода — положи его в ${CODE_FILE} и запусти снова`)
  process.exit(2)
})

steam.on('loggedOn', (details) => {
  const own = steam.steamID?.accountid ?? null
  console.log(`[steam] залогинен, account_id=${own}, запускаю Dota ${DOTA_APPID}...`)
  if (existsSync(NEED_FILE)) unlinkSync(NEED_FILE)
  steam.gamesPlayed(DOTA_APPID, true)
  // Спрашиваем Web API про СОБСТВЕННЫЕ матчи бота: если GC отдаст свой, но не
  // чужой — дело в правах аккаунта, а не в формате запроса.
  if (own && STEAM_KEY) {
    fetch(`https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/v1/?key=${STEAM_KEY}&account_id=${own}&matches_requested=5`)
      .then((r) => r.json())
      .then((j) => {
        const mine = j.result?.matches?.[0]?.match_id
        console.log(mine ? `[steam] свой матч бота: ${mine}` : '[steam] у бота пока нет матчей в истории')
        if (mine) OWN_MATCH_ID = Number(mine)
      })
      .catch(() => {})
  }
})

steam.on('appLaunched', (appid) => {
  if (appid !== DOTA_APPID) return
  console.log('[gc] Dota запущена, шлю ClientHello (4006)...')
  try {
    steam.sendToGC(DOTA_APPID, MSG_CLIENT_HELLO, {}, Buffer.alloc(0))
  } catch (e) {
    console.error('[gc] hello не ушёл:', e.message)
  }
  // Запрос уйдёт по ClientWelcome (4004) — как у OpenDota; таймер страхует,
  // если welcome не придёт.
  setTimeout(() => { if (!asked) ask('таймер') }, 8000)
})

// Что вообще присылает GC — пригодится, если Дота требует рукопожатие.
steam.on('receivedFromGC', (appid, msgType, payload) => {
  if (appid !== DOTA_APPID) return
  if (msgType === MSG_MATCH_DETAILS_RESPONSE) {
    report(payload)
    return
  }
  if (msgType === MSG_PLAYER_HISTORY_RESPONSE) {
    reportHistory(payload)
    return
  }
  console.log(`[gc] ← сообщение ${msgType}${msgType === MSG_SERVER_HELLO ? ' (ServerHello)' : ''}, ${payload?.length ?? 0} байт`)
  if (msgType === MSG_CLIENT_WELCOME) {
    console.log('[gc] ClientWelcome — сессия готова, спрашиваю матч')
    ask('ClientWelcome')
  }
})

let asked = false
let OWN_MATCH_ID = null
const STEAM_KEY = cfg.STEAM_WEB_API_KEY || ''

function ask(via) {
  if (asked) return
  asked = true
  for (const id of [MATCH_ID_NUM, OWN_MATCH_ID].filter(Boolean)) {
    const body = Req.encode({ match_id: id }).finish()
    const tag = id === OWN_MATCH_ID ? 'СВОЙ' : 'чужой'
    console.log(`[gc] → MatchDetailsRequest(${id}) [${tag}] после ${via}`)
    try {
      steam.sendToGC(DOTA_APPID, MSG_MATCH_DETAILS_REQUEST, {}, body)
    } catch (e) {
      console.error('[gc] sendToGC не прошёл:', e.message)
      process.exit(1)
    }
  }
}

function reportHistory(payload) {
  const msg = HistRes.decode(payload)
  console.log(`\n[gc] ← MatchHistoryResponse, матчей: ${msg.matches.length}`)
  for (const m of msg.matches.slice(0, 12)) {
    console.log(
      `  ${m.matchId}  hero ${String(m.heroId).padStart(3)}  ${m.winner ? 'W' : 'L'}` +
        `  ранг был ${m.previousRank ?? '—'} (Δ${m.rankChange ?? 0})` +
        `  ${m.duration ? Math.round(m.duration / 60) + 'мин' : ''}  solo=${m.soloRank}  abandon=${m.abandon}`,
    )
  }
  if (msg.matches.length) {
    console.log('\n✅ GC отдаёт данные, включая ранг на момент матча — тот, которого нет в Web API.')
  } else {
    console.log('[gc] список пуст — аккаунту не разрешён чужой history')
  }
  steam.logOff()
  setTimeout(() => process.exit(0), 400)
}

let responses = 0
function report(payload) {
  // Сырые байты важнее декода: если ответ длинный, матч в нём есть, а значит
  // виновата наша схема, а не отказ Valve.
  const bytes = payload?.length ?? 0
  console.log(`[gc] ← сырой ответ: ${bytes} байт, первые ${Math.min(bytes, 48)}: ${Buffer.from(payload ?? []).subarray(0, 48).toString('hex')}`)
  const msg = Res.decode(payload)
  responses++
  const which = responses === 1 ? 'чужой' : `#${responses}`
  console.log(`\n[gc] ← MatchDetailsResponse (${which}), result=${msg.result}`)
  const m = msg.match
  if (!m) {
    console.log('[gc] match пуст')
    return
  }
  console.log(`[gc] игроков: ${m.players.length}, длительность ${m.duration}, cluster ${m.cluster}`)
  console.log(`[gc] replay_salt: ${m.replaySalt} (${m.replaySalt ? 'ЕСТЬ' : 'ПУСТО'})`)
  console.log('\naccount_id из GC против того, что отдаёт Web API:')
  for (const p of m.players.slice(0, 10)) {
    const masked = p.accountId === 4294967295 || !p.accountId
    console.log(`  hero ${String(p.heroId).padStart(3)}  id ${String(p.accountId).padStart(11)}  ${masked ? 'тоже скрыт' : 'РЕАЛЬНЫЙ id'}`)
  }
  if (existsSync(NEED_FILE)) unlinkSync(NEED_FILE)
  steam.logOff()
  setTimeout(() => process.exit(0), 500)
}

setTimeout(() => {
  console.error('[gc] 75 секунд тишины — ответа нет. Скорее всего Дота требует рукопожатие до запросов.')
  process.exit(4)
}, 75000)

// Код Steam Guard: 5 символов — это приложение-код (twoFactor), длиннее — письмо.
const code = existsSync(CODE_FILE) ? readFileSync(CODE_FILE, 'utf8').trim() : ''
const login = { accountName: cfg.STEAM_ACCOUNT, password: cfg.STEAM_PASSWORD, rememberPassword: true }
if (code) {
  if (code.length <= 5) login.twoFactorCode = code
  else login.authCode = code
  console.log(`[steam] пробую код ${code} как ${login.twoFactorCode ? 'twoFactor' : 'email'}`)
} else {
  console.log('[steam] кода Steam Guard нет (server/gc/code.txt пуст) — если Steam его запросит, скрипт остановится')
}

steam.logOn(login)
