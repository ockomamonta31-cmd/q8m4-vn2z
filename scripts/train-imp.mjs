#!/usr/bin/env node
// Сбор обучающей выборки IMP со STRATZ + обучение модели (ridge и MLP),
// веса сохраняются в src/api/imp-model.json.
//
// Данные: батчи matchId → matches(ids:) — 10 игроков с их реальным IMP в каждом
// матче. Окно ID берётся вокруг последнего известного матча (~10 дней истории,
// все брекеты и ранги представлены naturally через публичные матчи).
//
// Запуск:  node scripts/train-imp.mjs [seedMatchId]
// Требует VITE_STRATZ_TOKEN в stratz/.env. Ходит в api.stratz.com напрямую.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadToken() {
  try {
    const env = readFileSync(join(ROOT, '.env'), 'utf8')
    const m = env.match(/VITE_STRATZ_TOKEN=(\S+)/)
    if (m) return m[1].trim()
  } catch { /* нет файла */ }
  return process.env.STRATZ_TOKEN || ''
}

const TOKEN = loadToken()
if (!TOKEN) {
  console.error('Нет токена: добавь VITE_STRATZ_TOKEN в stratz/.env')
  process.exit(1)
}

// Cloudflare блокирует прямые запросы из Node (403); идём через локальный
// Vite-прокси, который уже работает (если dev-сервер запущен).
const PROXY = 'http://localhost:5173/graphql'
const DIRECT = 'https://api.stratz.com/graphql'
let endpoint = PROXY
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let lastReq = 0
async function gql(query, variables) {
  for (let attempt = 0; ; attempt++) {
    const gap = 150 - (Date.now() - lastReq)
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
      // Прокси недоступен — пробуем прямой доступ
      if (endpoint === PROXY) {
        console.log('\n  прокси недоступен, переключаемся на прямой API')
        endpoint = DIRECT
        continue
      }
      if (attempt >= 4) throw e
      await sleep(2000 * (attempt + 1))
      continue
    }
    if (res.status === 429) {
      if (attempt >= 5) throw new Error('429: лимит исчерпан даже с backoff')
      const wait = 4000 * (attempt + 1)
      console.log(`  429, ждём ${wait} мс…`)
      await sleep(wait)
      continue
    }
    if (res.status === 403) {
      // Cloudflare: на прокси это маловероятно; на прямом доступе — смена стратегии
      if (endpoint === PROXY) {
        endpoint = DIRECT
        continue
      }
      if (attempt >= 3) throw new Error('403: Cloudflare блокирует')
      await sleep(3000 * (attempt + 1))
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    if (text.startsWith('<!DOCTYPE')) throw new Error('Cloudflare-челлендж')
    const json = JSON.parse(text)
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
    return json.data
  }
}

// --- Сбор выборки ---

const TARGET_ROWS = Number(process.argv[2]) || 12000 // целевых игроко-строк (~1200 матчей)

// Сбор через историю игроков: player(id).matches отдаёт матчи со всеми 10
// игроками и их IMP. Пул сидов: про-игроки (высокий скилл) + пиры и случайные
// игроки из найденных матчей (весь спектр рангов, включая ранг игрока).
const PRO_QUERY = `
{
  constants {
    proSteamAccounts {
      id
      name
    }
  }
}`

const PLAYER_MATCHES_QUERY = `
query ($id: Long!, $take: Int!, $skip: Int!) {
  player(steamAccountId: $id) {
    matches(request: { take: $take, skip: $skip }) {
      id
      durationSeconds
      gameMode
      numHumanPlayers
      players {
        steamAccountId
        heroId
        isRadiant
        isVictory
        kills
        deaths
        assists
        goldPerMinute
        experiencePerMinute
        numLastHits
        numDenies
        networth
        level
        heroDamage
        towerDamage
        heroHealing
        imp
      }
    }
  }
}`

async function harvest(seedId) {
  const matches = []
  const seenMatches = new Set()
  const seenPlayers = new Set([seedId])
  const queue = [seedId]

  // Пул сидов: про-игроки + сам сид
  try {
    const data = await gql(PRO_QUERY)
    const pros = (data.constants?.proSteamAccounts ?? []).map((p) => p.id)
    // Перемешиваем, чтобы взять репрезентативную выборку
    for (let i = pros.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pros[i], pros[j]] = [pros[j], pros[i]]
    }
    for (const id of pros.slice(0, 20)) {
      if (!seenPlayers.has(id)) {
        seenPlayers.add(id)
        queue.push(id)
      }
    }
    console.log(`  про-игроков в пуле: ${Math.min(20, pros.length)}`)
  } catch (e) {
    console.log(`  про-игроки недоступны (${e.message}), продолжаем без них`)
  }

  let requests = 0
  while (matches.length * 10 < TARGET_ROWS && requests < 300) {
    // Из найденных матчей засеваем новых игроков (весь спектр рангов)
    for (const m of matches.slice(-30)) {
      for (const p of m.players ?? []) {
        if (p?.steamAccountId && !seenPlayers.has(p.steamAccountId) && Math.random() < 0.25) {
          seenPlayers.add(p.steamAccountId)
          queue.push(p.steamAccountId)
        }
      }
    }
    const id = queue.shift()
    if (id === undefined) break
    const skip = Math.floor(Math.random() * 12) * 50 // случайное окно истории
    requests++
    let data
    try {
      data = await gql(PLAYER_MATCHES_QUERY, { id, take: 50, skip })
    } catch (e) {
      console.log(`  игрок ${id}: ошибка (${e.message}), пропускаем`)
      continue
    }
    let added = 0
    for (const m of data.player?.matches ?? []) {
      if (!m || seenMatches.has(m.id)) continue
      if (m.numHumanPlayers !== 10) continue
      if (!/^ALL_PICK|^CAPTAINS|^RANKED|^TURBO/.test(m.gameMode ?? '')) continue
      seenMatches.add(m.id)
      matches.push(m)
      added++
    }
    process.stdout.write(
      `\r собрано матчей: ${matches.length} (строк: ${matches.length * 10}), запросов: ${requests}, в очереди: ${queue.length}`,
    )
    if (added === 0 && queue.length === 0) break
  }
  console.log()
  return matches
}

// --- Признаки и модель ---

// Признаки на игрока: все из их IMP-входов, что у нас есть из GraphQL,
// плюс производные (скорости, отношение урона к нетворту и т.д.)
function features(p, durationMin) {
  const d = Math.max(durationMin, 1)
  return [
    p.kills,
    p.deaths,
    p.assists,
    p.kills / d,
    p.deaths / d,
    p.assists / d,
    p.goldPerMinute,
    p.experiencePerMinute,
    p.numLastHits,
    p.numLastHits / d,
    p.numDenies,
    p.networth,
    p.networth / (d * 100),
    p.level,
    p.level / d,
    p.heroDamage,
    p.heroDamage / d,
    p.heroDamage / Math.max(p.networth, 1),
    p.towerDamage,
    p.towerDamage / d,
    p.heroHealing,
    p.heroHealing / d,
    p.isRadiant ? 1 : 0,
    p.isVictory ? 1 : 0,
    d,
  ]
}

const FEATURE_NAMES = [
  'kills', 'deaths', 'assists', 'kpm', 'dpm', 'apm',
  'gpm', 'xpm', 'lastHits', 'lhpn', 'denies', 'networth', 'networthPerMin100',
  'level', 'levelPerMin', 'heroDamage', 'heroDmgPerMin', 'heroDmgPerNetworth',
  'towerDamage', 'towerDmgPerMin', 'heroHealing', 'healingPerMin',
  'isRadiant', 'isVictory', 'durationMin',
]

function standardize(rows) {
  const n = rows.length
  const dim = rows[0].length
  const mean = new Array(dim).fill(0)
  const std = new Array(dim).fill(0)
  for (const r of rows) for (let j = 0; j < dim; j++) mean[j] += r[j] / n
  for (const r of rows) for (let j = 0; j < dim; j++) std[j] += (r[j] - mean[j]) ** 2 / n
  for (let j = 0; j < dim; j++) std[j] = Math.sqrt(std[j]) || 1
  return { mean, std, z: (r) => r.map((v, j) => (v - mean[j]) / std[j]) }
}

function solve(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    if (Math.abs(M[pivot][col]) < 1e-12) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / M[col][col]
      if (f === 0) continue
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

function trainRidge(X, y, lambda) {
  const dim = X[0].length + 1
  const XtX = Array.from({ length: dim }, () => new Array(dim).fill(0))
  const Xty = new Array(dim).fill(0)
  for (let i = 0; i < X.length; i++) {
    const x = [1, ...X[i]]
    for (let a = 0; a < dim; a++) {
      for (let b = 0; b < dim; b++) XtX[a][b] += x[a] * x[b]
      Xty[a] += x[a] * y[i]
    }
  }
  for (let a = 1; a < dim; a++) XtX[a][a] += lambda * X.length
  return solve(XtX, Xty)
}

// Небольшой MLP: dim → 16 tanh → 1, обучение Adam.
function trainMLP(X, y, epochs = 60) {
  const dim = X[0].length
  const H = 16
  const rnd = (() => { let s = 42; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) })()
  const scale1 = Math.sqrt(2 / dim)
  const scale2 = Math.sqrt(2 / H)
  const W1 = Array.from({ length: dim }, () => Array.from({ length: H }, () => (rnd() * 2 - 1) * scale1))
  const b1 = new Array(H).fill(0)
  const W2 = Array.from({ length: H }, () => (rnd() * 2 - 1) * scale2)
  let b2 = 0

  const mW1 = W1.map((r) => r.map(() => 0)); const vW1 = W1.map((r) => r.map(() => 0))
  const mb1 = b1.map(() => 0); const vb1 = b1.map(() => 0)
  const mW2 = W2.map(() => 0); const vW2 = W2.map(() => 0)
  const mB2 = [0]; const vB2 = [0]
  const lr = 0.01, beta1 = 0.9, beta2 = 0.999, eps = 1e-8

  const N = X.length
  const bs = 256
  let t = 0
  for (let epoch = 0; epoch < epochs; epoch++) {
    const perm = Array.from({ length: N }, (_, i) => i)
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[perm[i], perm[j]] = [perm[j], perm[i]] }
    for (let start = 0; start < N; start += bs) {
      t++
      const idx = perm.slice(start, start + bs)
      const gW1 = W1.map((r) => r.map(() => 0)); const gb1 = new Array(H).fill(0)
      const gW2 = new Array(H).fill(0); let gb2 = 0
      for (const i of idx) {
        const x = X[i]
        const h = new Array(H)
        for (let j = 0; j < H; j++) {
          let s = b1[j]
          for (let k = 0; k < dim; k++) s += x[k] * W1[k][j]
          h[j] = Math.tanh(s)
        }
        let out = b2
        for (let j = 0; j < H; j++) out += h[j] * W2[j]
        const err = out - y[i]
        for (let j = 0; j < H; j++) {
          const dOut = (err * 2) / idx.length
          gW2[j] += dOut * h[j]
          gb2 += dOut
          const dH = dOut * W2[j] * (1 - h[j] * h[j])
          gb1[j] += dH
          for (let k = 0; k < dim; k++) gW1[k][j] += dH * x[k]
        }
      }
      const upd = (m, v, g, i2) => {
        m[i2] = beta1 * m[i2] + (1 - beta1) * g
        v[i2] = beta2 * v[i2] + (1 - beta2) * g * g
        return (lr * (m[i2] / (1 - beta1 ** t))) / (Math.sqrt(v[i2] / (1 - beta2 ** t)) + eps)
      }
      for (let k = 0; k < dim; k++) for (let j = 0; j < H; j++) W1[k][j] -= upd(mW1[k], vW1[k], gW1[k][j], j)
      for (let j = 0; j < H; j++) { b1[j] -= upd(mb1, vb1, gb1[j], j); W2[j] -= upd(mW2, vW2, gW2[j], j) }
      b2 -= upd(mB2, vB2, gb2, 0)
    }
  }
  return {
    predict(x) {
      const h = new Array(H)
      for (let j = 0; j < H; j++) {
        let s = b1[j]
        for (let k = 0; k < dim; k++) s += x[k] * W1[k][j]
        h[j] = Math.tanh(s)
      }
      let out = b2
      for (let j = 0; j < H; j++) out += h[j] * W2[j]
      return out
    },
    export() {
      return { kind: 'mlp', dim, H, W1, b1, W2, b2 }
    },
  }
}

function mlpPredict(model, x) {
  const h = new Array(model.H)
  for (let j = 0; j < model.H; j++) {
    let s = model.b1[j]
    for (let k = 0; k < model.dim; k++) s += x[k] * model.W1[k][j]
    h[j] = Math.tanh(s)
  }
  let out = model.b2
  for (let j = 0; j < model.H; j++) out += h[j] * model.W2[j]
  return out
}

function mae(preds, actual) {
  let s = 0
  for (let i = 0; i < preds.length; i++) s += Math.abs(preds[i] - actual[i])
  return s / preds.length
}

function pearson(a, b) {
  const n = a.length
  const ma = a.reduce((s, v) => s + v, 0) / n
  const mb = b.reduce((s, v) => s + v, 0) / n
  let cov = 0, va = 0, vb = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb
    cov += da * db; va += da * da; vb += db * db
  }
  const den = Math.sqrt(va * vb)
  return den > 0 ? cov / den : 0
}

// --- Запуск ---

const DATASET_PATH = join(ROOT, 'scripts', 'imp-dataset.jsonl')

async function main() {
  const seedId = Number(process.argv[3]) || 1858036696
  let matches
  // Повторное обучение — из кэша датасета, без походов в API
  if (process.argv.includes('--reuse') && existsSync(DATASET_PATH)) {
    matches = readFileSync(DATASET_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    console.log(`Датасет из кэша: ${matches.length} матчей`)
  } else {
    console.log(`Сбор данных (цель: ${TARGET_ROWS} строк), сид-игрок ${seedId}…`)
    matches = await harvest(seedId)
    console.log(`Матчей собрано: ${matches.length}`)
    writeFileSync(DATASET_PATH, matches.map((m) => JSON.stringify(m)).join('\n'))
    console.log(`Датасет закэширован: ${DATASET_PATH}`)
  }

  const rows = []
  const labels = []
  for (const m of matches) {
    const durMin = (m.durationSeconds ?? 0) / 60
    if (durMin < 5) continue
    for (const p of m.players ?? []) {
      if (!p || typeof p.imp !== 'number') continue // обучаемся только на их реальных IMP
      rows.push(features(p, durMin))
      labels.push(p.imp)
    }
  }
  console.log(`Обучающих строк (с их IMP): ${rows.length}`)
  if (rows.length < 500) {
    console.error('Слишком мало данных для обучения.')
    process.exit(1)
  }

  const { mean, std, z } = standardize(rows)
  const X = rows.map(z)

  // Разбивка 85/15
  const perm = X.map((_, i) => i)
  let s = 7
  for (let i = perm.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[perm[i], perm[j]] = [perm[j], perm[i]]
  }
  const split = Math.floor(perm.length * 0.85)
  const tr = perm.slice(0, split)
  const te = perm.slice(split)
  const Xtr = tr.map((i) => X[i]); const ytr = tr.map((i) => labels[i])
  const Xte = te.map((i) => X[i]); const yte = te.map((i) => labels[i])

  console.log('Обучение ridge…')
  const beta = trainRidge(Xtr, ytr, 0.5)
  const ridgePreds = Xte.map((x) => [1, ...x].reduce((s2, v, j) => s2 + v * beta[j], 0))
  const ridgeMae = mae(ridgePreds, yte)
  const ridgeR = pearson(ridgePreds, yte)
  console.log(`  ridge: MAE=${ridgeMae.toFixed(2)}  r=${ridgeR.toFixed(3)}`)

  console.log('Обучение MLP (16 скрытых, Adam)…')
  const mlp = trainMLP(Xtr, ytr, 60)
  const mlpPreds = Xte.map((x) => mlpPredict(mlp.export(), x))
  const mlpMae = mae(mlpPreds, yte)
  const mlpR = pearson(mlpPreds, yte)
  console.log(`  mlp:   MAE=${mlpMae.toFixed(2)}  r=${mlpR.toFixed(3)}`)

  const useMlp = mlpMae < ridgeMae
  const model = {
    version: 1,
    trainedAt: new Date().toISOString(),
    samples: rows.length,
    features: FEATURE_NAMES,
    mean,
    std,
    metrics: {
      holdoutMae: Number((useMlp ? mlpMae : ridgeMae).toFixed(3)),
      holdoutR: Number((useMlp ? mlpR : ridgeR).toFixed(3)),
      ridgeMae: Number(ridgeMae.toFixed(3)),
      mlpMae: Number(mlpMae.toFixed(3)),
    },
    model: useMlp ? mlp.export() : { kind: 'ridge', beta },
  }

  const outPath = join(ROOT, 'src', 'api', 'imp-model.json')
  writeFileSync(outPath, JSON.stringify(model))
  const kb = (statSize(outPath) / 1024).toFixed(0)
  console.log(`\nЛучшая модель: ${model.model.kind} (MAE ${model.metrics.holdoutMae}, r=${model.metrics.holdoutR})`)
  console.log(`Сохранено: ${outPath} (${kb} kB), строк: ${rows.length}`)
}

function statSize(p) {
  return existsSync(p) ? readFileSync(p).length : 0
}

main().catch((e) => {
  console.error('Ошибка:', e.message)
  process.exit(1)
})
