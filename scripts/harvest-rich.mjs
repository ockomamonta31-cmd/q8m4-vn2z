#!/usr/bin/env node
// Сбор rich-датасета для «честной» модели импакта.
// Читает ID матчей из scripts/imp-dataset.jsonl, тянет match(id) с полными
// stats (килы-события, смерти, варды, стаки, руны, курьеры, локации, APM,
// seasonRank игроков, actualRank матча, position, partyId) и записывает в
// scripts/rich-dataset.jsonl по строке на матч с посчитанными признаками.
//
// Запуск:  node scripts/harvest-rich.mjs
// Ходит через локальный Vite-прокси (Cloudflare режет прямые запросы).

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEED_PATH = join(ROOT, 'scripts', 'imp-dataset.jsonl')
const OUT_PATH = join(ROOT, 'scripts', 'rich-dataset.jsonl')

const PROXY = 'http://localhost:5173/graphql'
const DIRECT = 'https://api.stratz.com/graphql'
let endpoint = PROXY

function loadToken() {
  try {
    const m = readFileSync(join(ROOT, '.env'), 'utf8').match(/VITE_STRATZ_TOKEN=(\S+)/)
    if (m) return m[1].trim()
  } catch { /* нет файла */ }
  return process.env.STRATZ_TOKEN || ''
}
const TOKEN = loadToken()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let lastReq = 0

async function gql(query, variables) {
  for (let attempt = 0; ; attempt++) {
    const gap = 120 - (Date.now() - lastReq)
    if (gap > 0) await sleep(gap)
    lastReq = Date.now()
    let res
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(endpoint === DIRECT
            ? { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            : {}),
        },
        body: JSON.stringify({ query, variables }),
      })
    } catch (e) {
      if (endpoint === PROXY) { endpoint = DIRECT; continue }
      if (attempt >= 4) throw e
      await sleep(2000 * (attempt + 1))
      continue
    }
    if (res.status === 429) {
      if (attempt >= 5) throw new Error('429')
      await sleep(4000 * (attempt + 1))
      continue
    }
    if (res.status === 403 && endpoint === PROXY) { endpoint = DIRECT; continue }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    if (text.startsWith('<!DOCTYPE')) throw new Error('Cloudflare challenge')
    const json = JSON.parse(text)
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
    return json.data
  }
}

const MATCH_QUERY = `
query ($id: Long!) {
  match(id: $id) {
    id
    didRadiantWin
    durationSeconds
    gameMode
    actualRank
    players {
      steamAccountId
      steamAccount { seasonRank }
      heroId
      isRadiant
      position
      partyId
      kills deaths assists
      goldPerMinute experiencePerMinute
      numLastHits numDenies
      networth level
      heroDamage towerDamage heroHealing
      imp
      stats {
        actionsPerMinute
        tripsFountainPerMinute
        campStack
        courierKills { time }
        wardDestruction { time }
        wards { type }
        itemPurchases { itemId }
        runes { time }
        killEvents { isSolo isGank assist }
        deathEvents { goldFed isDieBack hasHealAvailable isAttemptTpOut }
        locationReport { positionX positionY }
      }
    }
  }
}`

// --- Извлечение признаков (один вектор на игрока) ---

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0)
const sum = (arr) => arr.reduce((s, v) => s + v, 0)

function playerFeatures(p, durationMin, teamKills, teamDamage, partySizes, matchRank) {
  const s = p.stats
  const k = num(p.kills), d = num(p.deaths), a = num(p.assists)
  const killEvents = s?.killEvents ?? []
  const deathEvents = s?.deathEvents ?? []
  const wards = s?.wards ?? []
  const loc = s?.locationReport ?? []
  const purchases = s?.itemPurchases ?? []

  // Движение: суммарная длина пути по отчётам позиций (единицы карты → тысячи)
  let path = 0
  for (let i = 1; i < loc.length; i++) {
    const dx = num(loc[i].positionX) - num(loc[i - 1].positionX)
    const dy = num(loc[i].positionY) - num(loc[i - 1].positionY)
    path += Math.sqrt(dx * dx + dy * dy)
  }

  // ward.type — Int: 0 = OBSERVER, 1 = SENTRY (проверено на данных:
  // ранние t<=30с варды — в основном type0, их больше всего у саппортов)
  const wardObs = wards.filter((w) => num(w.type) === 0).length
  const wardSen = wards.filter((w) => num(w.type) === 1).length
  // расходники: смоки (188) и дасты (40) — саппорт/ганк-активность
  const smokesBought = purchases.filter((ip) => num(ip.itemId) === 188).length
  const dustsBought = purchases.filter((ip) => num(ip.itemId) === 40).length

  const posNum = (() => {
    const m = String(p.position ?? '').match(/(\d)/)
    return m ? Number(m[1]) : 0
  })()

  const seasonRank = num(p.steamAccount?.seasonRank)
  const actualRank = num(matchRank)

  return {
    // базовая статистика
    k, d, a,
    kpm: k / durationMin, dpm: d / durationMin, apm: a / durationMin,
    gpm: num(p.goldPerMinute), xpm: num(p.experiencePerMinute),
    lh: num(p.numLastHits), denies: num(p.numDenies),
    networth: num(p.networth), level: num(p.level), durationMin,
    // урон/вклад
    heroDmg: num(p.heroDamage), heroDmgPerMin: num(p.heroDamage) / durationMin,
    towerDmg: num(p.towerDamage), heroHeal: num(p.heroHealing),
    dmgShare: teamDamage > 0 ? num(p.heroDamage) / teamDamage : 0,
    // качество килов/смертей
    assistsPerKill: killEvents.length ? mean(killEvents.map((e) => num(e.assist))) : k > 0 ? a / k : 0,
    soloKillRate: killEvents.length ? killEvents.filter((e) => e.isSolo).length / killEvents.length : 0,
    gankKillRate: killEvents.length ? killEvents.filter((e) => e.isGank).length / killEvents.length : 0,
    killShare: teamKills > 0 ? k / teamKills : 0,
    avgGoldFed: deathEvents.length ? mean(deathEvents.map((e) => num(e.goldFed))) : 0,
    dieBacks: deathEvents.filter((e) => e.isDieBack).length,
    diedWithHeal: deathEvents.filter((e) => e.hasHealAvailable).length,
    tpFailDeaths: deathEvents.filter((e) => e.isAttemptTpOut).length,
    // саппорт/макро/расходники
    wardsObs: wardObs, wardsSen: wardSen,
    smokesBought, dustsBought,
    dewards: (s?.wardDestruction ?? []).length,
    campStacks: sum(s?.campStack ?? []),
    runes: (s?.runes ?? []).length,
    courierKills: (s?.courierKills ?? []).length,
    // движение/активность
    pathPerMin: path / 1000 / durationMin,
    apmAvg: mean(s?.actionsPerMinute ?? []),
    fountainTrips: mean(s?.tripsFountainPerMinute ?? []),
    // контекст ранга/партии
    seasonRank, actualRank,
    rankDelta: seasonRank > 0 && actualRank > 0 ? actualRank - seasonRank : 0,
    partySize: partySizes.get(p.partyId) ?? 1,
    position: posNum,
    // служебные (не признаки модели)
    isRadiant: !!p.isRadiant,
    heroId: num(p.heroId),
    steamAccountId: num(p.steamAccountId),
    // их IMP — только для валидации нашей модели, не признак
    stratzImp: typeof p.imp === 'number' ? p.imp : null,
  }
}

const NON_FEATURES = new Set(['isRadiant', 'heroId', 'steamAccountId', 'stratzImp'])

async function processMatch(id) {
  const data = await gql(MATCH_QUERY, { id })
  const m = data.match
  if (!m || !m.players || m.players.length < 10) return null
  if (typeof m.didRadiantWin !== 'boolean') return null
  const durationMin = num(m.durationSeconds) / 60
  if (durationMin < 5) return null

  // Размеры партий: только НЕ-null partyId (null = без партии, все такие
  // игроки не считаются группой — иначе все соло-игроки склеивались в одну)
  const partySizes = new Map()
  for (const p of m.players) {
    if (p.partyId === null || p.partyId === undefined) continue
    partySizes.set(p.partyId, (partySizes.get(p.partyId) ?? 0) + 1)
  }

  const radiant = m.players.filter((p) => p.isRadiant)
  const dire = m.players.filter((p) => !p.isRadiant)
  const teamKillsR = sum(radiant.map((p) => num(p.kills)))
  const teamKillsD = sum(dire.map((p) => num(p.kills)))
  const teamDmgR = sum(radiant.map((p) => num(p.heroDamage)))
  const teamDmgD = sum(dire.map((p) => num(p.heroDamage)))

  const players = m.players.map((p) => {
    const tKills = p.isRadiant ? teamKillsR : teamKillsD
    const tDmg = p.isRadiant ? teamDmgR : teamDmgD
    return playerFeatures(p, durationMin, tKills, tDmg, partySizes, m.actualRank)
  })

  return {
    id: Number(m.id),
    didRadiantWin: m.didRadiantWin,
    gameMode: m.gameMode,
    actualRank: num(m.actualRank),
    players,
  }
}

async function main() {
  if (!existsSync(SEED_PATH)) {
    console.error(`Нет файла ${SEED_PATH} — сначала запусти train-imp.mjs (сбор)`)
    process.exit(1)
  }
  const seedIds = readFileSync(SEED_PATH, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line).id)
    .filter((id) => typeof id === 'number')

  const done = new Set()
  if (existsSync(OUT_PATH)) {
    for (const line of readFileSync(OUT_PATH, 'utf8').split('\n').filter(Boolean)) {
      try { done.add(JSON.parse(line).id) } catch { /* пропуск битой строки */ }
    }
  }

  const todo = seedIds.filter((id) => !done.has(id))
  console.log(`Матчей в сиде: ${seedIds.length}, уже собрано: ${done.size}, к сбору: ${todo.length}`)

  let ok = 0
  let skip = 0
  let err = 0
  for (let i = 0; i < todo.length; i++) {
    try {
      const row = await processMatch(todo[i])
      if (row) {
        appendFileSync(OUT_PATH, JSON.stringify(row) + '\n')
        ok++
      } else {
        skip++
      }
    } catch (e) {
      err++
      if (err > 25 && ok === 0) {
        console.error('\nСлишком много ошибок подряд — проверь прокси/токен:', e.message)
        process.exit(1)
      }
      if (e.message === '429' || /Cloudflare/.test(e.message)) {
        console.log(`\n  ошибка (${e.message}), ждём 15 с…`)
        await sleep(15000)
      }
    }
    if ((i + 1) % 25 === 0) {
      process.stdout.write(`\r${i + 1}/${todo.length} · ok=${ok} skip=${skip} err=${err}`)
    }
  }
  console.log(`\nГотово: ok=${ok}, skip=${skip}, err=${err}. Файл: ${OUT_PATH}`)
}

main().catch((e) => {
  console.error('Ошибка:', e.message)
  process.exit(1)
})
