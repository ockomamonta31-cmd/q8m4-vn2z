#!/usr/bin/env node
// Сбор тренировочного датасета напрямую из Valve-фида.
//
// GetMatchHistoryBySequenceNum отдаёт по 99 ПОЛНЫХ матчей за один запрос
// (1.4 МБ, ~0.9 с) — это ~100x быстрее, чем прежний harvest-rich.mjs через
// GraphQL STRATZ, и без Cloudflare.
//
// Запуск:  node scripts/harvest-valve.mjs [кол-во_матчей]
// Выход:   scripts/valve-dataset.jsonl  (одна строка = один матч)
//
// Признаки сохраняем сразу в том виде, в каком их увидит рантайм: позиций и
// сезонных рангов в Steam API нет, поэтому модели они недоступны в принципе.

import { writeFileSync, existsSync, statSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'scripts', 'valve-dataset.jsonl')
const TARGET = Number(process.argv[2] || 12000)
const WINDOW = 6
const MIN_DURATION = 300

const KEY = (readFileSync(join(ROOT, '.env'), 'utf8').match(/STEAM_WEB_API_KEY=(\S+)/) || [])[1]
if (!KEY) {
  console.error('STEAM_WEB_API_KEY не задан в .env')
  process.exit(1)
}

function feedUrl(seq) {
  const u = new URL('https://api.steampowered.com/IDOTA2Match_570/GetMatchHistoryBySequenceNum/v1/')
  u.searchParams.set('key', KEY)
  u.searchParams.set('start_at_match_seq_num', seq)
  u.searchParams.set('matches_requested', '100')
  return u
}

/** Стартовая точка: самый свежий известный seq из локального индекса. */
function latestSeq() {
  try {
    const idx = JSON.parse(readFileSync(join(ROOT, 'server', 'data', 'seq-index.json'), 'utf8'))
    return Math.max(...Object.values(idx))
  } catch {
    return null
  }
}

function usable(m) {
  if (!m || !Array.isArray(m.players) || m.players.length !== 10) return false
  if (!(m.duration >= MIN_DURATION) || typeof m.radiant_win !== 'boolean') return false
  return m.players.every((p) => p.kills !== undefined && p.hero_id > 0 && p.gold_per_min > 0)
}

function row(m) {
  return {
    id: m.match_id,
    dur: m.duration,
    win: m.radiant_win,
    mode: m.game_mode,
    lobby: m.lobby_type,
    fb: m.first_blood_time ?? null,
    rs: m.radiant_score ?? null,
    ds: m.dire_score ?? null,
    pb: (m.picks_bans ?? []).length,
    players: m.players.map((p) => ({
      h: p.hero_id,
      r: (p.player_slot ?? 0) < 128 ? 1 : 0,
      w: ((p.player_slot ?? 0) < 128) === m.radiant_win ? 1 : 0,
      k: p.kills,
      d: p.deaths,
      a: p.assists,
      g: p.gold_per_min,
      x: p.xp_per_min,
      lh: p.last_hits,
      dn: p.denies,
      nw: p.net_worth ?? 0,
      lv: p.level,
      hd: p.hero_damage ?? 0,
      td: p.tower_damage ?? 0,
      hh: p.hero_healing ?? 0,
      shd: p.scaled_hero_damage ?? 0,
      std: p.scaled_tower_damage ?? 0,
      shh: p.scaled_hero_healing ?? 0,
      ag: p.aghanims_scepter ?? 0,
      ar: p.aghanims_shard ?? 0,
      mo: p.moonshard ?? 0,
      ab: (p.ability_upgrades ?? []).length,
    })),
  }
}

let seq = latestSeq()
if (!seq) {
  console.error('Нет server/data/seq-index.json — сначала открой любого игрока в приложении')
  process.exit(1)
}
seq += 1

// Продолжаем существующий файл, а не перезаписываем
let have = 0
if (existsSync(OUT)) {
  have = readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).length
}
console.log(`старт: seq=${seq}, в файле уже ${have} матчей, цель ${TARGET}`)

let stream = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
let collected = have
let requests = 0
const t0 = Date.now()

async function grab(startSeq) {
  const res = await fetch(feedUrl(startSeq))
  requests++
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()).result?.matches ?? []
}

// Идём НАЗАД по фиду: seq растёт со временем, поэтому от свежего к старым.
async function run() {
  let cursor = seq
  let sinceWrite = 0
  while (collected < TARGET) {
    const batch = Array.from({ length: WINDOW }, (_, i) => cursor - i * 100)
    const results = await Promise.allSettled(batch.map(grab))
    const lines = []
    let minSeen = cursor
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      for (const m of r.value) {
        if (m.match_seq_num < minSeen) minSeen = m.match_seq_num
        if (!usable(m)) continue
        lines.push(JSON.stringify(row(m)))
      }
    }
    cursor = minSeen - 1
    collected += lines.length
    stream += lines.join('\n') + (lines.length ? '\n' : '')
    sinceWrite += lines.length
    if (sinceWrite >= 500) {
      writeFileSync(OUT, stream)
      sinceWrite = 0
      const rate = (collected / ((Date.now() - t0) / 1000)).toFixed(1)
      console.log(`  ${collected}/${TARGET} матчей · ${rate}/с · cursor seq=${cursor}`)
    }
  }
  writeFileSync(OUT, stream)
  console.log(`\nготово: ${collected} матчей (${(statSync(OUT).size / 1024 / 1024).toFixed(1)} МБ) за ${((Date.now() - t0) / 1000).toFixed(0)} с, запросов: ${requests}`)
}

run().catch((e) => {
  writeFileSync(OUT, stream)
  console.error('сорвалось:', e.message)
  process.exit(1)
})
