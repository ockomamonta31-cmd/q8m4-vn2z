// Собственный API-сервер аналитики Dota 2.
// (Запуск: node server/index.mjs — shebang намеренно нет, файл импортируется
// vite.config.ts и esbuild не умеет shebang в середине бандла.)
//
// Источник данных — официальный Steam Web API (Valve напрямую):
//   - GetMatchHistory(account_id)          — список матчей игрока: match_id +
//     match_seq_num (свежие матчи появляются через минуты, а не часы — в
//     отличие от парсеров вроде STRATZ)
//   - GetMatchHistoryBySequenceNum(seq, 1) — ПОЛНЫЕ данные матча: все 10
//     игроков K/D/A, GPM/XPM, LH/DN, net_worth, урон по героям/башням/лечение,
//     шмотки, ability_upgrades, duration, исход
//   - GetPlayerSummaries                   — имена/аватары
//
// ВАЖНО: GetMatchDetails у Valve мёртв — стабильный HTTP 500 на любом match_id
// (проверено и на вчерашнем матче, и на TI7). Единственный способ получить
// статистику — фид по match_seq_num, поэтому match_id → seq обязательно
// индексируется на диск (data/seq-index.json): обратно из одного только id
// он не разворачивается (ошибка линейной оценки — до 90k записей фида).
//
// Своё хранилище (server/data/): матчи неизменяемы → кэш навсегда на диске.
// Кроме Valve ни от чего не зависим; единственная внешняя доводка — полный
// список банов и линии (см. stratzDraft): Steam отдаёт picks_bans обрезанным.
//
// Запуск:  node server/index.mjs          (порт 8787, свой API_BASE)
// Или:    npm run dev                     (встроится в Vite как middleware,
//                                          тот же origin — без CORS)
//
// Ключ:   STEAM_WEB_API_KEY в stratz/.env (бесплатно: steamcommunity.com/dev/apikey)

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync, existsSync, createReadStream, statSync } from 'node:fs'
import { dirname, join, extname, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { inferReplayPositions } from './gc/infer-replay-positions.mjs'
import { impactPhases } from './gc/impact-phases.mjs'
import { buildMapPlays } from './gc/map-plays.mjs'
import { buildMatchTimeline } from './gc/build-timeline.mjs'
import { createRankResolver, rankFields } from './player-ranks.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const DATA = join(ROOT, 'data')
const PORT = Number(process.env.PORT || process.env.OWN_API_PORT || 8787)

// --- Конфиг (.env рядом с package.json) ---

function loadEnv() {
  try {
    const raw = readFileSync(join(ROOT, '..', '.env'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* .env не обязателен — ключ может быть в системном окружении */
  }
}
loadEnv()

const STEAM_KEY = process.env.STEAM_WEB_API_KEY || ''
const AUTH_SECRET = process.env.AUTH_SECRET || ''

// --- Хранилище (своя БД: JSON-файлы на диске) ---

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value))
}

/** Матч неизменяем → храним навсегда. */
function matchPath(id) {
  return join(DATA, 'matches', `${id}.json`)
}

function replayPositions(match) {
  const replay = readJson(join(DATA, 'replays', `${match.id}.json`), null)
  return Array.isArray(replay?.players) ? inferReplayPositions(match.players, replay.players) : new Map()
}

function replayPositionFor(match, player) {
  const team = match.players.filter((p) => p.isRadiant === player.isRadiant)
  const slot = (player.isRadiant ? 0 : 128) + team.indexOf(player)
  const role = replayPositions(match).get(slot)
  return role ?? { position: 0 }
}

function replayPhaseStats(match, player) {
  const replay = readJson(join(DATA, 'replays', `${match.id}.json`), null)
  const team = match.players.filter((p) => p.isRadiant === player.isRadiant)
  const slot = (player.isRadiant ? 0 : 128) + team.indexOf(player)
  const parsed = replay?.players?.find((p) => Number(p.player_slot) === slot)
  return impactPhases(parsed, match.durationSeconds)
}

/**
 * Версия формы матча на диске. Меняется, когда в normalizeSteamMatch добавляются
 * поля: старый кэш тогда просто пересобирается, а не отдаёт объект без значений.
 */
const MATCH_SCHEMA = 2

function getCachedMatch(id) {
  const m = readJson(matchPath(id), null)
  return m && m.schema === MATCH_SCHEMA ? m : null
}

function saveMatch(id, match) {
  writeJson(matchPath(id), match)
}

/** Профиль — TTL 10 минут (имя/аватар меняются). */
function profilePath(id) {
  return join(DATA, 'players', `${id}.json`)
}

function getCachedProfile(id) {
  const p = readJson(profilePath(id), null)
  if (p && Date.now() - p.ts <= 10 * 60 * 1000) return p.v
  return null
}

function saveProfile(id, v) {
  writeJson(profilePath(id), { ts: Date.now(), v })
}

/** История матчей игрока — TTL 5 минут (пополняется новыми). */
function historyPath(id) {
  return join(DATA, 'history', `${id}.json`)
}

function getCachedHistory(id) {
  const h = readJson(historyPath(id), null)
  if (h && Date.now() - h.ts <= 5 * 60 * 1000) return h.v
  return null
}

function saveHistory(id, v) {
  writeJson(historyPath(id), { ts: Date.now(), v })
}

/**
 * Индекс match_id → match_seq_num. Нужен потому, что полный матч достаётся
 * только по seq, а GetMatchDetails (поиск по id) Valve сломал.
 */
const SEQ_INDEX_PATH = join(DATA, 'seq-index.json')
const seqIndex = readJson(SEQ_INDEX_PATH, {})
let seqIndexDirty = false

function rememberSeq(matchId, seq) {
  if (!matchId || !seq || seqIndex[matchId] === seq) return
  seqIndex[matchId] = seq
  seqIndexDirty = true
}

function flushSeqIndex() {
  if (!seqIndexDirty) return
  seqIndexDirty = false
  writeJson(SEQ_INDEX_PATH, seqIndex)
}

setInterval(flushSeqIndex, 5000).unref()
process.on('exit', flushSeqIndex)

// --- Ограничитель к Steam: окно параллельных запросов ---
// Замерено на этом же ключе: окно 2 → 5.3 req/s, окно 4 → 10.8, окно 8 → 15.9
// (все 200). Больше восьми Valve не наказывает 429, а просто задерживает
// ответы: 24 запроса окном 12 вместо 1.5 с идут 31 с. Поэтому окно строго 8.

const MAX_INFLIGHT = 8
const TIMEOUT_MS = 15000

let inflight = 0
const waiters = []

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function acquire() {
  if (inflight < MAX_INFLIGHT) {
    inflight++
    return
  }
  await new Promise((res) => waiters.push(res))
}

function release() {
  inflight--
  const next = waiters.shift()
  if (!next) return
  inflight++
  next()
}

async function steamFetch(path, params) {
  if (!STEAM_KEY) {
    const err = new Error('STEAM_WEB_API_KEY не задан — создай ключ на steamcommunity.com/dev/apikey и впиши в stratz/.env')
    err.status = 503
    throw err
  }
  const url = new URL(`https://api.steampowered.com/${path}`)
  url.searchParams.set('key', STEAM_KEY)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))

  await acquire()
  try {
    let lastErr = null
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await sleep(1500 * 2 ** (attempt - 1))
      let res
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      } catch (e) {
        lastErr = e
        continue
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Steam API HTTP ${res.status}`)
        continue
      }
      if (!res.ok) {
        const err = new Error(`Steam API вернул HTTP ${res.status}`)
        err.status = res.status === 401 ? 401 : 502
        throw err
      }
      const json = await res.json().catch(() => null)
      if (!json) {
        lastErr = new Error('Steam API: пустой ответ')
        continue
      }
      return json
    }
    throw lastErr ?? new Error('Steam API недоступен')
  } finally {
    release()
  }
}

// --- Маппинг режимов Valve → строковые enum'ы, которые понимает UI ---
// Номера взяты из актуального EDOTAGAMEMODE_TYPE (odota/dotaconstants) и
// сверены с живыми данными: id 22 = рейтинговые ~40 мин (All Draft),
// id 23 = публичные ~24 мин (Turbo).

const STEAM_GAME_MODES = {
  1: 'ALL_PICK', 2: 'CAPTAINS_MODE', 3: 'RANDOM_DRAFT', 4: 'SINGLE_DRAFT',
  5: 'ALL_RANDOM', 11: 'MID_ONLY', 12: 'LEAST_PICKED', 13: 'LIMITED_HEROES',
  16: 'CAPTAINS_DRAFT', 17: 'BALANCED_DRAFT', 18: 'ABILITY_DRAFT', 19: 'EVENT',
  20: 'ARDM', 21: 'ONE_VS_ONE_MID', 22: 'ALL_DRAFT', 23: 'TURBO',
  24: 'MUTATION', 25: 'COACHES_CHALLENGE',
}
const STEAM_LOBBY_TYPES = {
  0: 'PUBLIC_MATCH', 1: 'PRACTICE', 7: 'RANKED', 8: 'MID_ONE', 9: 'COMPETITIVE',
}

function mapMode(lobbyType, gameMode) {
  const lobby = STEAM_LOBBY_TYPES[lobbyType] ?? 'PUBLIC_MATCH'
  let mode = STEAM_GAME_MODES[gameMode] ?? `MODE_${gameMode}`
  // ренжед-эллпик → тот же enum, что раньше отдавал STRATZ
  if (lobby === 'RANKED' && mode === 'ALL_PICK') mode = 'ALL_PICK_RANKED'
  return { lobby, mode }
}

// --- Нормализация матчей Steam → наши типы (см. src/api/types.ts) ---

const PRIVATE_ACCOUNT_ID = 0xffffffff

function toAccountId(steamId64) {
  return Number(BigInt(steamId64) - 76561197960265728n)
}

async function steamFriends(id) {
  const path = join(DATA, 'friends', `${id}.json`), cached = readJson(path, null)
  if (cached && Date.now() - cached.ts < 60 * 60 * 1000) return new Set(cached.ids)
  try {
    const data = await steamFetch('ISteamUser/GetFriendList/v1/', {
      steamid: String(BigInt(id) + 76561197960265728n), relationship: 'friend',
    })
    const ids = (data.friendslist?.friends ?? []).map((f) => toAccountId(f.steamid)).filter((x) => Number.isSafeInteger(x) && x > 0)
    writeJson(path, { ts: Date.now(), ids })
    return new Set(ids)
  } catch (e) {
    if (e.status === 401) throw new HttpError(403, 'Список друзей Steam скрыт. Открой его в настройках приватности Steam.')
    throw e
  }
}

function normalizeSteamMatch(raw) {
  const durMin = Math.max((raw.duration ?? 0) / 60, 1)
  // net_worth в этом фиде у ~0.7% строк нулевой или обрезанный (0, 1, 101).
  // Живые значения лежат в 0.64–1.08 от gpm×мин, поэтому ниже 0.5 — считаем оценку.
  const networthOf = (gpm, nw) => (nw > gpm * durMin * 0.5 ? nw : Math.round(gpm * durMin))
  const players = (raw.players ?? []).map((p) => ({
    // 0xFFFFFFFF = INVALID_ACCOUNT_ID: игрок скрыл историю
    steamAccountId: p.account_id === PRIVATE_ACCOUNT_ID ? 0 : (p.account_id ?? 0),
    // player_slot < 128 → Radiant
    isRadiant: (p.player_slot ?? 0) < 128,
    isVictory: ((p.player_slot ?? 0) < 128) === Boolean(raw.radiant_win),
    heroId: p.hero_id ?? 0,
    kills: p.kills ?? 0,
    deaths: p.deaths ?? 0,
    assists: p.assists ?? 0,
    goldPerMinute: p.gold_per_min ?? 0,
    experiencePerMinute: p.xp_per_min ?? 0,
    numLastHits: p.last_hits ?? 0,
    numDenies: p.denies ?? 0,
    networth: networthOf(p.gold_per_min ?? 0, p.net_worth ?? 0),
    level: p.level ?? 0,
    heroDamage: p.hero_damage ?? 0,
    towerDamage: p.tower_damage ?? 0,
    heroHealing: p.hero_healing ?? 0,
    // позиция/ранг/IMP Steam не отдаёт — модель честно работает без них
    position: 0,
    seasonRank: 0,
    imp: null,
    items: [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5].map((v) => v || null),
    backpack: [p.backpack_0, p.backpack_1, p.backpack_2].map((v) => v || null),
    neutralItem: p.item_neutral || null,
    neutralItem2: p.item_neutral2 || null,
    aghanimsScepter: Boolean(p.aghanims_scepter),
    aghanimsShard: Boolean(p.aghanims_shard),
    moonshard: Boolean(p.moonshard),
    leaverStatus: p.leaver_status ?? 0,
    // Урон с поправкой на время матча — честнее сырого: сравнивает 20- и 60-минутки
    scaledHeroDamage: p.scaled_hero_damage ?? 0,
    scaledTowerDamage: p.scaled_tower_damage ?? 0,
    scaledHeroHealing: p.scaled_hero_healing ?? 0,
    // Таймлайн прокачки: Valve отдаёт ability+время+уровень. Таймингов покупок
    // предметов в этом API нет в принципе — только финальные слоты.
    abilityUpgrades: (p.ability_upgrades ?? []).map((a) => ({
      ability: a.ability,
      time: a.time,
      level: a.level,
    })),
    stats: null,
  }))
  const { lobby, mode } = mapMode(raw.lobby_type ?? 0, raw.game_mode ?? 1)
  return {
    schema: MATCH_SCHEMA,
    id: raw.match_id ?? 0,
    didRadiantWin: raw.radiant_win ?? null,
    durationSeconds: raw.duration ?? 0,
    startDateTime: raw.start_time ?? 0,
    gameMode: mode,
    lobbyType: lobby,
    numHumanPlayers: raw.human_players ?? players.length,
    actualRank: 0,
    firstBloodSeconds: raw.first_blood_time ?? null,
    radiantScore: raw.radiant_score ?? null,
    direScore: raw.dire_score ?? null,
    towerStatusRadiant: raw.tower_status_radiant ?? null,
    towerStatusDire: raw.tower_status_dire ?? null,
    barracksStatusRadiant: raw.barracks_status_radiant ?? null,
    barracksStatusDire: raw.barracks_status_dire ?? null,
    picksBans: (raw.picks_bans ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((b) => ({
        isPick: Boolean(b.is_pick),
        isRadiant: b.team === 0,
        heroId: b.hero_id,
        order: b.order,
      })),
    players,
  }
}

// --- Работа с данными (кэш → Steam) ---

/**
 * Полный матч по match_seq_num (GetMatchDetails у Valve мёртв). Если seq не
 * передан — берём из накопленного индекса; без него матч недостижим.
 * pending: один и тот же матч из разных хендлеров качается один раз.
 */
const pendingMatches = new Map()

function ensureMatch(matchId, seq) {
  const cached = getCachedMatch(matchId)
  if (cached) return Promise.resolve(cached)
  const running = pendingMatches.get(matchId)
  if (running) return running

  const job = (async () => {
    const seqNum = seq ?? seqIndex[matchId] ?? null
    if (!seqNum) {
      const err = new Error(`Матч ${matchId}: нет match_seq_num — открой его из списка матчей игрока`)
      err.status = 404
      throw err
    }
    const json = await steamFetch('IDOTA2Match_570/GetMatchHistoryBySequenceNum/v1/', {
      start_at_match_seq_num: seqNum,
      matches_requested: 1,
    })
    // Приватные/удалённые матчи фид пропускает, поэтому сверяем id
    const raw = (json.result?.matches ?? []).find((m) => Number(m.match_id) === Number(matchId))
    if (!raw) {
      const err = new Error(`Матч ${matchId} недоступен в Steam (приватный или удалён)`)
      err.status = 404
      throw err
    }
    const match = normalizeSteamMatch(raw)
    saveMatch(matchId, match)
    return match
  })()

  job.catch(() => undefined)
  pendingMatches.set(matchId, job)
  job.finally(() => pendingMatches.delete(matchId)).catch(() => undefined)
  return job
}

/**
 * Полный драфт и линии. Steam отдаёт `picks_bans` обрезанным: из 16–18
 * автобанов доходит 5–8, а часть недосчитанных банов помечается как пики —
 * из-за этого в списке появлялся «выбранный» герой, которого в матче не было.
 * Целиком список лежит в разборе STRATZ; берём его только когда он сходится
 * с составом матча (10 пикированных героев = 10 сыгранных).
 */
const STRATZ_TOKEN = process.env.VITE_STRATZ_TOKEN || ''

async function stratzDraft(matchId) {
  if (!STRATZ_TOKEN) return null
  const path = join(DATA, 'drafts', `${matchId}.json`)
  const hit = readJson(path, null)
  if (hit) return hit.missing ? null : hit
  try {
    const res = await fetch('https://api.stratz.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${STRATZ_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'STRATZ_API' },
      body: JSON.stringify({ query: `query { match(id: ${Number(matchId)}) { pickBans { isPick order heroId bannedHeroId isRadiant } players { isRadiant heroId lane position } } }` }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) { console.error('[draft] HTTP', res.status, (await res.text()).slice(0, 120)); return null }
    const json = await res.json()
    const m = json.data?.match
    if (!m) return null
    const draft = { bans: [], picks: [], roles: {} }
    for (const b of m.pickBans ?? []) {
      if (b.isPick && Number.isInteger(b.heroId)) draft.picks.push({ heroId: b.heroId, radiant: Boolean(b.isRadiant), order: Number.isInteger(b.order) ? b.order : draft.picks.length })
      else if (!b.isPick && Number.isInteger(b.bannedHeroId)) draft.bans.push({ heroId: b.bannedHeroId, radiant: b.isRadiant === true ? true : b.isRadiant === false ? false : null })
    }
    draft.picks.sort((a, b) => a.order - b.order)
    const lanes = { SAFE_LANE: 'safelane', MID_LANE: 'mid', OFF_LANE: 'offlane' }
    for (const p of m.players ?? []) {
      const position = /^POSITION_[1-5]$/.test(p.position ?? '') ? Number(p.position.slice(9)) : 0
      if (!position) continue
      draft.roles[`${p.isRadiant ? 'r' : 'd'}:${p.heroId}`] = { lane: lanes[p.lane] ?? '', position }
    }
    if (!draft.picks.length && !Object.keys(draft.roles).length) { writeJson(path, { missing: 1 }); return null }
    writeJson(path, draft)
    return draft
  } catch (e) {
    console.error('[draft] failed', e?.name, e?.message)
    return null
  }
}

/** драфт принимается, только если его пики — ровно те 10 героев, что сыграны */
function withDraft(match, draft) {
  if (!draft || draft.picks.length !== 10) return { ...match, draft: null }
  const picked = match.players.every((p) => draft.picks.some((k) => k.heroId === p.heroId && k.radiant === p.isRadiant))
  const clash = draft.bans.some((b) => match.players.some((p) => p.heroId === b.heroId))
  return { ...match, draft: picked && !clash ? { source: 'stratz', bans: draft.bans, picks: draft.picks } : null }
}

function stratzRole(draft, team, heroId) {
  const role = draft?.roles?.[`${team}:${heroId}`]
  return role ? { position: role.position, positionSource: 'stratz', lane: role.lane || undefined } : null
}

/**
 * История матчей. Valve отдаёт окно последних ~500 публичных матчей и листает
 * его курсором start_at_match_id; за раз — не больше 100. Раньше брали только
 * первую сотню, из-за чего «Активность» и一半 статистик жили по 100 матчам.
 */
async function ensureHistory(accountId) {
  const cached = getCachedHistory(accountId)
  if (cached) return cached

  const rows = []
  const seen = new Set()
  let total = null
  let cursor = null

  for (let page = 0; page < 5; page++) {
    const params = { account_id: accountId, matches_requested: 100 }
    if (cursor) params.start_at_match_id = cursor
    const json = await steamFetch('IDOTA2Match_570/GetMatchHistory/v1/', params)
    const raw = json.result ?? {}
    const batch = raw.matches ?? []
    if (total === null) total = raw.total_results ?? null
    let fresh = 0
    for (const m of batch) {
      if (seen.has(m.match_id)) continue
      seen.add(m.match_id)
      rememberSeq(m.match_id, m.match_seq_num)
      rows.push({ id: m.match_id, seq: m.match_seq_num })
      fresh++
    }
    if (!batch.length || fresh === 0) break
    cursor = batch[batch.length - 1].match_id
    if (total !== null && rows.length >= total) break
  }

  const v = { rows, total: total ?? rows.length }
  saveHistory(accountId, v)
  flushSeqIndex()
  return v
}

/**
 * Матчи игрока из истории, качаются параллельно (окно держит steamFetch).
 * Ограничение по умолчанию — 100: агрегаты по 500 матчам были бы точнее, но
 * это 30 секунд ожидания, а «последние 100» и есть тот смысл, который показан
 * в UI на вкладках «Герои» и «Пиры».
 */
async function loadAllMatches(history, accountId, limit = 100) {
  const settled = await Promise.all(
    history.rows.slice(0, limit).map((row) =>
      ensureMatch(row.id, row.seq).catch((e) => {
        if (e.status !== 404) throw e
        return null
      }),
    ),
  )
  return settled.filter((m) => m && m.players.some((p) => p.steamAccountId === accountId))
}

/** Батч имён/аватаров (кэш 10 минут на игрока). */
async function resolveProfiles(accountIds) {
  const out = new Map()
  const missing = []
  for (const id of accountIds) {
    if (!id) continue
    const hit = getCachedProfile(id)
    if (hit) out.set(id, hit)
    else missing.push(id)
  }
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100)
    const json = await steamFetch('ISteamUser/GetPlayerSummaries/v2/', {
      steamids: chunk.map((id) => String(BigInt(id) + 76561197960265728n)).join(','),
    })
    for (const p of json.response?.players ?? []) {
      const id32 = toAccountId(p.steamid)
      const v = { name: p.personaname ?? null, avatar: p.avatarfull ?? p.avatarmedium ?? p.avatar ?? null }
      saveProfile(id32, v)
      out.set(id32, v)
    }
  }
  return out
}

const resolveRanks = createRankResolver({
  read: async (id) => readJson(join(DATA, 'ranks', id + '.json'), null),
  write: async (id, value) => writeJson(join(DATA, 'ranks', id + '.json'), value),
})

// --- Хендлеры API ---

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const handlers = {
  /** GET /api/health — статус ключа (без него показываем понятную панель). */
  'GET /api/health': async () => ({ ok: true, steamKey: Boolean(STEAM_KEY) }),

  /** GET /api/profile/:id */
  async profile(params) {
    const id = Number(params.id)
    if (!Number.isFinite(id) || id <= 0) throw new HttpError(400, 'Некорректный Steam ID')
    const [names, history, ranks] = await Promise.all([resolveProfiles([id]), ensureHistory(id), resolveRanks([id])])
    const info = names.get(id) ?? {}
    return {
      steamAccountId: id,
      name: info.name ?? `#${id}`,
      avatar: info.avatar ?? null,
      // Valve отдаёт окно последних 500 публичных матчей, а не всю историю
      matchCount: history.total ?? null,
      winCount: null,
      rank: ranks.get(id)?.tier ?? null,
      rankSource: ranks.get(id)?.source ?? null,
      rankScope: ranks.get(id)?.scope ?? null,
      rankFetchedAt: ranks.get(id)?.fetchedAt ?? null,
      rankIsCore: null,
    }
  },

  /** GET /api/player/:id/matches?take=&skip= — список матчей игрока. */
  async matches(params) {
    const id = Number(params.id)
    const take = Math.min(Number(params.take) || 25, 100)
    const skip = Math.max(Number(params.skip) || 0, 0)
    if (!Number.isFinite(id) || id <= 0) throw new HttpError(400, 'Некорректный Steam ID')

    const [history, ranks] = await Promise.all([ensureHistory(id), resolveRanks([id])])
    // Детали качаются параллельно (окно держит steamFetch), битые пропускаем
    const settled = await Promise.all(
      history.rows.slice(skip, skip + take).map((row) => ensureMatch(row.id, row.seq).catch(() => null)),
    )
    // Строка списка: только наш игрок. Состав команд не отдаём — единственная
    // модель оценки работает по линии статов самого игрока.
    const rows = settled.map((m) => {
      if (!m) return null
      const me = m.players.find((p) => p.steamAccountId === id)
      if (!me) return null
      const role = replayPositionFor(m, me)
      return {
        id: m.id,
        startDateTime: m.startDateTime,
        durationSeconds: m.durationSeconds,
        gameMode: m.gameMode,
        lobbyType: m.lobbyType,
        player: {
          steamAccountId: id,
          heroId: me.heroId,
          kills: me.kills,
          deaths: me.deaths,
          assists: me.assists,
          goldPerMinute: me.goldPerMinute,
          experiencePerMinute: me.experiencePerMinute,
          numLastHits: me.numLastHits,
          numDenies: me.numDenies,
          networth: me.networth,
          level: me.level,
          heroDamage: me.heroDamage,
          towerDamage: me.towerDamage,
          heroHealing: me.heroHealing,
          ...role,
          positionSource: role.positionSource,
          ...rankFields(me, ranks.get(id)),
          isVictory: me.isVictory,
          imp: null,
        },
      }
    })
    return rows.filter(Boolean)
  },

  /** GET /api/matches/:id — полный матч (все 10 игроков с именами). */
  async match(params) {    const id = Number(params.id)
    if (!Number.isFinite(id) || id <= 0) throw new HttpError(400, 'Некорректный ID матча')
    const match = await resolveRanks.forMatch(await ensureMatch(id))
    const [profiles, draft] = await Promise.all([
      resolveProfiles(match.players.map((p) => p.steamAccountId)),
      stratzDraft(id),
    ])
    const positions = replayPositions(match)
    const spatialReplay = readJson(join(DATA, 'replays', `${id}.json`), null)
    const mapPlays = buildMapPlays(spatialReplay, match, CONSTANTS.heroes)
    const slotByPlayer = new Map()
    for (const radiant of [true, false]) {
      match.players.filter((p) => p.isRadiant === radiant).forEach((p, i) => slotByPlayer.set(p, (radiant ? 0 : 128) + i))
    }
    return withDraft(
      {
        ...match,
        players: match.players.map((p) => {
          const parsed = positions.get(slotByPlayer.get(p)) ?? null
          const stratz = stratzRole(draft, p.isRadiant ? 'r' : 'd', p.heroId)
          return {
            ...p,
            ...(parsed ?? {}),
            ...(!parsed?.position && stratz ? stratz : {}),
            impactPhases: replayPhaseStats(match, p),
            mapPlays: mapPlays?.[slotByPlayer.get(p)],
            name: profiles.get(p.steamAccountId)?.name ?? p.name ?? null,
          }
        }),
      },
      draft,
    )
  },

  /**
   * GET /api/matches/:id/timeline — кривые преимущества и лента событий из реплея.
   * 404, если реплей этого матча ещё не разобран: интерфейс прячет секции,
   * а не показывает пустой график.
   */
  async timeline(params) {
    const id = Number(params.id)
    if (!Number.isFinite(id) || id <= 0) throw new HttpError(400, 'Некорректный ID матча')
    const replay = readJson(join(DATA, 'replays', `${id}.json`), null)
    if (!replay) throw new HttpError(404, 'Реплей этого матча ещё не разобран')
    const match = await ensureMatch(id)
    return buildMatchTimeline(replay, match, CONSTANTS.heroes)
  },

  /** GET /api/player/:id/heroes — агрегация по героям из своей базы матчей. */
  async heroes(params) {
    const id = Number(params.id)
    const take = Math.min(Number(params.take) || 100, 100)
    const history = await ensureHistory(id)
    const matches = await loadAllMatches(history, id)
    const byHero = new Map()
    for (const m of matches) {
      const me = m.players.find((p) => p.steamAccountId === id)
      if (!me) continue
      const cur = byHero.get(me.heroId) ?? { heroId: me.heroId, matchCount: 0, winCount: 0 }
      cur.matchCount++
      if (me.isVictory) cur.winCount++
      byHero.set(me.heroId, cur)
    }
    return [...byHero.values()].sort((a, b) => b.matchCount - a.matchCount).slice(0, take)
  },

  /** GET /api/player/:id/peers — из своей базы (загруженные матчи). */
  async peers(params) {
    const id = Number(params.id)
    const [history, friends] = await Promise.all([ensureHistory(id), steamFriends(id)])
    const matches = await loadAllMatches(history, id)
    const acc = new Map()
    for (const m of matches) {
      const me = m.players.find((p) => p.steamAccountId === id)
      if (!me) continue
      for (const p of m.players) {
        // 0 — игрок скрыл историю, считать его «пиром» нельзя
        if (!p.steamAccountId || p.steamAccountId === id || !friends.has(p.steamAccountId) || p.isRadiant !== me.isRadiant) continue
        let peer = acc.get(p.steamAccountId)
        if (!peer) {
          peer = { steamAccountId: p.steamAccountId, withMatchCount: 0, withWinCount: 0, againstMatchCount: 0, againstWinCount: 0 }
          acc.set(p.steamAccountId, peer)
        }
        peer.withMatchCount++
        if (me.isVictory) peer.withWinCount++
      }
    }
    const top = [...acc.values()]
      .sort((a, b) => b.withMatchCount - a.withMatchCount)
    const profiles = await resolveProfiles(top.map((p) => p.steamAccountId))
    return top.map((p) => ({
      steamAccountId: p.steamAccountId,
      name: profiles.get(p.steamAccountId)?.name ?? `#${p.steamAccountId}`,
      avatar: profiles.get(p.steamAccountId)?.avatar ?? null,
      withMatchCount: p.withMatchCount,
      withWinCount: p.withWinCount,
      againstMatchCount: p.againstMatchCount,
      againstWinCount: p.againstWinCount,
    }))
  },
}

// --- Статичные константы (свои файлы, generated scripts/gen-constants.mjs) ---

const CONSTANTS = {
  heroes: readJson(join(DATA, 'constants', 'heroes.json'), []),
  items: readJson(join(DATA, 'constants', 'items.json'), []),
}

// --- Роутер ---

function matchRoute(method, path) {
  if (method !== 'GET') return null
  let m = path.match(/^\/api\/(health)$/)
  if (m) return { handler: handlers['GET /api/health'], params: {} }
  m = path.match(/^\/api\/profile\/(\d+)$/)
  if (m) return { handler: handlers.profile, params: { id: m[1] } }
  m = path.match(/^\/api\/player\/(\d+)\/matches$/)
  if (m) return { handler: handlers.matches, params: { id: m[1] } }
  m = path.match(/^\/api\/player\/(\d+)\/heroes$/)
  if (m) return { handler: handlers.heroes, params: { id: m[1] } }
  m = path.match(/^\/api\/player\/(\d+)\/peers$/)
  if (m) return { handler: handlers.peers, params: { id: m[1] } }
  m = path.match(/^\/api\/matches\/(\d+)$/)
  if (m) return { handler: handlers.match, params: { id: m[1] } }
  m = path.match(/^\/api\/matches\/(\d+)\/timeline$/)
  if (m) return { handler: handlers.timeline, params: { id: m[1] } }
  if (path === '/api/constants/heroes') return { handler: async () => CONSTANTS.heroes, params: {} }
  if (path === '/api/constants/items') return { handler: async () => CONSTANTS.items, params: {} }
  return null
}

function signSession(steamId64, expires) {
  const payload = `${steamId64}.${expires}`
  return `${payload}.${createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url')}`
}

function readSession(req) {
  if (!AUTH_SECRET) return null
  const token = (req.headers.cookie ?? '').split(';').map((x) => x.trim()).find((x) => x.startsWith('dota_session='))?.slice(13)
  if (!token) return null
  const [steamId64, expiresText, signature] = token.split('.')
  const payload = `${steamId64}.${expiresText}`
  const expected = createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url')
  if (!/^\d{17}$/.test(steamId64 ?? '') || !/^\d+$/.test(expiresText ?? '') || Number(expiresText) < Date.now() || !signature) return null
  const a = Buffer.from(signature), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return steamId64
}

function cookie(name, value, maxAge, secure) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}

async function authMiddleware(req, res, url) {
  const secure = url.protocol === 'https:'
  const sendRedirect = (location, setCookie) => {
    res.statusCode = 302
    res.setHeader('Location', location)
    res.setHeader('Cache-Control', 'no-store')
    if (setCookie) res.setHeader('Set-Cookie', setCookie)
    res.end()
  }
  if (url.pathname === '/api/auth/steam' && req.method === 'GET') {
    if (!AUTH_SECRET) { res.statusCode = 503; res.end('AUTH_SECRET is not configured'); return true }
    const state = randomBytes(24).toString('base64url')
    const callback = new URL('/api/auth/steam/callback', url.origin)
    callback.searchParams.set('state', state)
    const auth = new URL('https://steamcommunity.com/openid/login')
    for (const [key, value] of Object.entries({
      'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'checkid_setup',
      'openid.return_to': callback.href, 'openid.realm': `${url.origin}/`,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    })) auth.searchParams.set(key, value)
    res.setHeader('Set-Cookie', cookie('openid_state', state, 600, secure))
    sendRedirect(auth.href)
    return true
  }
  if (url.pathname === '/api/auth/steam/callback' && req.method === 'GET') {
    const stateCookie = (req.headers.cookie ?? '').split(';').map((x) => x.trim()).find((x) => x.startsWith('openid_state='))?.slice(13)
    const state = url.searchParams.get('state'), returnTo = new URL('/api/auth/steam/callback', url.origin)
    returnTo.searchParams.set('state', state ?? '')
    const claimed = url.searchParams.get('openid.claimed_id') ?? ''
    const steamId = claimed.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/)?.[1]
    if (!state || state !== stateCookie || !steamId || url.searchParams.get('openid.identity') !== claimed ||
        url.searchParams.get('openid.return_to') !== returnTo.href || url.searchParams.get('openid.op_endpoint') !== 'https://steamcommunity.com/openid/login') {
      res.statusCode = 400; res.end('Steam sign-in verification failed'); return true
    }
    const assertion = new URLSearchParams()
    for (const [key, value] of url.searchParams) if (key.startsWith('openid.')) assertion.set(key, value)
    assertion.set('openid.mode', 'check_authentication')
    const verified = await fetch('https://steamcommunity.com/openid/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: assertion })
    if (!verified.ok || !(await verified.text()).split(/\r?\n/).includes('is_valid:true')) { res.statusCode = 401; res.end('Steam sign-in verification failed'); return true }
    const expires = Date.now() + 30 * 24 * 60 * 60 * 1000
    res.setHeader('Set-Cookie', [cookie('dota_session', signSession(steamId, expires), 30 * 24 * 60 * 60, secure), cookie('openid_state', '', 0, secure)])
    sendRedirect('/')
    return true
  }
  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const steam64 = readSession(req)
    if (!steam64) { res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ loggedIn: false })); return true }
    try {
      const accountId = toAccountId(steam64)
      let info = {}
      try { info = (await resolveProfiles([accountId])).get(accountId) ?? {} } catch { /* Steam OpenID identity remains valid without a Web API key */ }
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ loggedIn: true, steamAccountId: accountId, name: info.name ?? `#${accountId}`, avatar: info.avatar ?? null }))
    } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: e.message })) }
    return true
  }
  if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
    res.statusCode = 204; res.setHeader('Set-Cookie', cookie('dota_session', '', 0, secure)); res.end(); return true
  }
  return false
}

/** Connect-подобный middleware: используется и Vite-плагином, и standalone-сервером. */
export function apiMiddleware(req, res) {
  const protocol = req.socket?.encrypted ? 'https:' : 'http:'
  const url = new URL(req.url ?? '/', `${protocol}//${req.headers.host ?? 'localhost'}`)
  if (!url.pathname.startsWith('/api/')) return false
  if (url.pathname.startsWith('/api/auth/')) { authMiddleware(req, res, url).catch((e) => { res.statusCode = 500; res.end('Steam sign-in failed'); console.error('[auth]', e.message) }); return true }

  const route = matchRoute(req.method ?? 'GET', url.pathname)
  const respond = (status, body) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(body))
  }
  if (!route) {
    respond(404, { error: 'Неизвестный эндпоинт' })
    return true
  }
  for (const [k, v] of url.searchParams) route.params[k] = v
  route.handler(route.params)
    .then((data) => respond(200, data))
    .catch((e) => {
      const status = e.status ?? 500
      if (status >= 500) console.error(`[api] ${url.pathname}:`, e.message)
      respond(status, { error: e.message })
    })
  return true
}

// --- Standalone-режим (node server/index.mjs) ---

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (!STEAM_KEY) {
    console.warn('⚠️  STEAM_WEB_API_KEY не задан — эндпоинты данных ответят 503.')
    console.warn('   Бесплатный ключ: https://steamcommunity.com/dev/apikey → впиши в stratz/.env')
  }
  createServer((req, res) => {
    if (apiMiddleware(req, res)) return
    const dist = resolve(ROOT, '..', 'dist')
    const requested = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
    const candidate = resolve(dist, `.${requested}`)
    const rel = relative(dist, candidate)
    const insideDist = rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel)
    const file = insideDist && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(dist, 'index.html')
    if (!existsSync(file)) {
      res.statusCode = 404
      res.end('Build frontend first: npm run build')
      return
    }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
    createReadStream(file).pipe(res)
  }).listen(PORT, () => {
    console.log(`own-dota: http://localhost:${PORT} (API /api/health)`)
  })
}
