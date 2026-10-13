// Модель ролей по экономике матча.
//
// Зачем: у старых матчей нет ни разобранного реплея, ни позиций у STRATZ
// (у 8759138207, например, STRATZ отдаёт пустые lane/position). Раньше в этом
// случае роли просто сортировались по нетворсу — и в катке, где саппорт отъелся,
// а оффлейнер слит, это путает керри с мидером и ставит линию не туда.
//
// Учимся на том, что у нас уже есть: 800+ матчей с настоящими позициями.
// Признаки — только числа самого матча, нормированные внутри команды (иначе
// метадрафт и длительность всё ломают). К экономике добавляется prior по герою:
// «Инвокер почти не бывает пятёркой» — это тоже измерено по нашей базе.
//
// Выход — server/data/constants/role_model.json:
//   { features, mean, std, W[5][f], b[5], prior[heroId][5], ... }
//
// Запуск: node scripts/build-role-model.mjs [--holdout=0.2]

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MATCHES = join(ROOT, 'server', 'data', 'matches')
const DRAFTS = join(ROOT, 'server', 'data', 'drafts')
const OUT = join(ROOT, 'server', 'data', 'constants', 'role_model.json')
const HOLDOUT = Number((process.argv.find((a) => a.startsWith('--holdout=')) ?? '').slice(10) || 0.2)

const FEATURES = [
  'lhPerMin', 'dnPerMin', 'gpmRatio', 'xpmRatio', 'nwRatio', 'levelRatio',
  'towerPerMin', 'healPerMin', 'dmgPerMin', 'killPerMin', 'deathPerMin',
  'assistPerMin', 'items', 'aghanim', 'creepDenyShare',
]

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[(s.length - 1) >> 1] : 1
}

/** Признаки игрока относительно его же команды. */
function featurize(p, team, durationMinutes) {
  const med = (pick) => median(team.map((t) => num(pick(t))))
  const d = Math.max(1, durationMinutes)
  const items = (p.items?.length ?? 0) + (p.backpack?.length ?? 0)
  const lh = num(p.numLastHits)
  const dn = num(p.numDenies)
  return {
    lhPerMin: lh / d,
    dnPerMin: dn / d,
    gpmRatio: num(p.goldPerMinute) / Math.max(1, med((t) => t.goldPerMinute)),
    xpmRatio: num(p.experiencePerMinute) / Math.max(1, med((t) => t.experiencePerMinute)),
    nwRatio: num(p.networth) / Math.max(1, med((t) => t.networth)),
    levelRatio: num(p.level) / Math.max(1, med((t) => t.level)),
    towerPerMin: num(p.towerDamage) / d,
    healPerMin: num(p.heroHealing) / d,
    dmgPerMin: num(p.scaledHeroDamage) / d,
    killPerMin: num(p.kills) / d,
    deathPerMin: num(p.deaths) / d,
    assistPerMin: num(p.assists) / d,
    items,
    aghanim: num(p.aghanimsScepter) > 0 ? 1 : 0,
    creepDenyShare: lh + dn > 0 ? dn / (lh + dn) : 0,
  }
}

const toVector = (f) => FEATURES.map((k) => f[k])

/** Все матчи, где позиции известны хотя бы у 8 игроков. */
function dataset() {
  const rows = []
  for (const file of readdirSync(MATCHES)) {
    const id = Number(file.replace('.json', ''))
    if (!Number.isSafeInteger(id) || !existsSync(join(DRAFTS, `${id}.json`))) continue
    let match
    let draft
    try {
      match = JSON.parse(readFileSync(join(MATCHES, file), 'utf8'))
      draft = JSON.parse(readFileSync(join(DRAFTS, `${id}.json`), 'utf8'))
    } catch { continue }
    const players = match.players ?? []
    if (players.length !== 10 || !(match.durationSeconds > 0)) continue
    const min = match.durationSeconds / 60
    for (const radiant of [true, false]) {
      const side = players.filter((p) => p.isRadiant === radiant)
      const known = side.filter((p) => draft.roles?.[`${radiant ? 'r' : 'd'}:${p.heroId}`]?.position)
      if (known.length < 4) continue
      rows.push({
        id,
        side,
        labels: side.map((p) => (draft.roles[`${radiant ? 'r' : 'd'}:${p.heroId}`]?.position ?? 0)),
        feats: side.map((p) => featurize(p, side, min)),
      })
    }
  }
  return rows
}

const data = dataset()
if (data.length < 200) throw new Error(`слишком мало размеченных команд: ${data.length}`)

// сплит по матчам, чтобы одна игра не светилась в обучении и проверке
const byMatch = new Map()
for (const row of data) byMatch.set(row.id, [...(byMatch.get(row.id) ?? []), row])
const ids = [...byMatch.keys()].sort((a, b) => (a % 7) - (b % 7))
const cut = Math.floor(ids.length * (1 - HOLDOUT))
const trainRows = ids.slice(0, cut).flatMap((id) => byMatch.get(id))
const testRows = ids.slice(cut).flatMap((id) => byMatch.get(id))

const flat = (rows) => rows.flatMap((r) => r.feats.map((f, i) => ({ x: toVector(f), y: r.labels[i] - 1, hero: r.side[i].heroId })))
const train = flat(trainRows)
const test = flat(testRows)

// стандартизация по обучающей выборке
const n = FEATURES.length
const mean = new Array(n).fill(0)
const std = new Array(n).fill(1)
for (const s of train) for (let i = 0; i < n; i++) mean[i] += s.x[i] / train.length
for (let i = 0; i < n; i++) {
  let v = 0
  for (const s of train) v += (s.x[i] - mean[i]) ** 2
  std[i] = Math.sqrt(v / train.length) || 1
}
const norm = (x) => x.map((v, i) => (v - mean[i]) / std[i])

/** prior: как часто герой играется на каждой роли по нашей же базе. */
function buildPrior(rows) {
  const byHero = new Map()
  const total = [0, 0, 0, 0, 0]
  for (const r of rows) {
    r.labels.forEach((label, i) => {
      if (!label) return
      const acc = byHero.get(r.side[i].heroId) ?? [0, 0, 0, 0, 0]
      acc[label - 1] += 1
      total[label - 1] += 1
      byHero.set(r.side[i].heroId, acc)
    })
  }
  const sum = total.reduce((a, b) => a + b, 0) || 1
  const prior = {}
  for (const [hero, acc] of byHero) {
    const s = acc.reduce((a, b) => a + b, 0)
    // сглаживание: 3 «виртуальные» команды по общему распределению ролей
    prior[hero] = acc.map((c, i) => Math.log((c + 3 * (total[i] / s)) / (s + 3)))
  }
  return { prior, fallback: total.map((c) => Math.log(c / sum)) }
}
const { prior: priorCounts, fallback: priorFallback } = buildPrior(trainRows)

// --- softmax-регрессия (мультиномиальная логистическая), градиентный спуск
const W = Array.from({ length: 5 }, () => new Array(n).fill(0))
const b = new Array(5).fill(0)
const LR = 0.3
const EPOCHS = 600
const L2 = 1e-4

const scores = (x) => {
  const out = new Array(5)
  for (let c = 0; c < 5; c++) {
    let s = b[c]
    const row = W[c]
    for (let i = 0; i < n; i++) s += row[i] * x[i]
    out[c] = s
  }
  return out
}
const softmax = (s) => {
  const m = Math.max(...s)
  const e = s.map((v) => Math.exp(v - m))
  const sum = e.reduce((a, v) => a + v, 0)
  return e.map((v) => v / sum)
}

for (let epoch = 0; epoch < EPOCHS; epoch++) {
  const gW = Array.from({ length: 5 }, () => new Array(n).fill(0))
  const gb = new Array(5).fill(0)
  for (const s of train) {
    const x = norm(s.x)
    const p = softmax(scores(x))
    for (let c = 0; c < 5; c++) {
      const err = p[c] - (s.y === c ? 1 : 0)
      gb[c] += err / train.length
      for (let i = 0; i < n; i++) gW[c][i] += (err * x[i] + L2 * W[c][i]) / train.length
    }
  }
  for (let c = 0; c < 5; c++) {
    b[c] -= LR * gb[c]
    for (let i = 0; i < n; i++) W[c][i] -= LR * gW[c][i]
  }
}

/** Пять ролей в команде — это перестановка: назначаем жадно по лучшим баллам. */
const laneOfPos = (pos) => (pos === 2 ? 'mid' : pos === 1 || pos === 5 ? 'safelane' : pos >= 1 ? 'offlane' : '')

function assign(rows, { usePrior }) {
  let hit = 0
  let laneHit = 0
  let total = 0
  for (const r of rows) {
    const pairs = []
    r.feats.forEach((f, i) => {
      const s = scores(norm(toVector(f)))
      const pr = usePrior ? (priorCounts[r.side[i].heroId] ?? priorFallback) : [0, 0, 0, 0, 0]
      for (let c = 0; c < 5; c++) pairs.push({ p: i, c, v: s[c] + pr[c] })
    })
    pairs.sort((a, b) => b.v - a.v)
    const usedP = new Set()
    const usedC = new Set()
    const guess = new Array(r.feats.length).fill(0)
    for (const pair of pairs) {
      if (usedP.has(pair.p) || usedC.has(pair.c)) continue
      usedP.add(pair.p)
      usedC.add(pair.c)
      guess[pair.p] = pair.c + 1
    }
    r.labels.forEach((label, i) => {
      if (!label) return
      total += 1
      if (guess[i] === label) hit += 1
      if (laneOfPos(guess[i]) === laneOfPos(label)) laneHit += 1
    })
  }
  return { hit, total, accuracy: total ? hit / total : 0, laneAccuracy: total ? laneHit / total : 0 }
}

/** Как ошибается текущий порядок фарма — базовая линия, с которой сравниваем. */
function farmOrder(rows) {
  let hit = 0
  let laneHit = 0
  let total = 0
  for (const r of rows) {
    const order = [...r.side]
      .map((p, i) => ({ i, nw: num(p.networth), gpm: num(p.goldPerMinute) }))
      .sort((a, b) => b.nw - a.nw || b.gpm - a.gpm)
    order.forEach((o, rank) => {
      if (!r.labels[o.i]) return
      total += 1
      if (rank + 1 === r.labels[o.i]) hit += 1
      if (laneOfPos(rank + 1) === laneOfPos(r.labels[o.i])) laneHit += 1
    })
  }
  return { hit, total, accuracy: total ? hit / total : 0, laneAccuracy: total ? laneHit / total : 0 }
}

const evals = {
  economyOnly: assign(testRows, { usePrior: false }),
  economyPlusHero: assign(testRows, { usePrior: true }),
  farmOrder: farmOrder(testRows),
}

const chosen = evals.economyPlusHero.accuracy >= evals.economyOnly.accuracy ? 'economyPlusHero' : 'economyOnly'

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({
  v: 1,
  generated: new Date().toISOString().slice(0, 10),
  source: 'Обучено на наших матчах с известными позициями (STRATZ lane/position + разобранные реплеи)',
  note: 'Роли 1–5 по экономике матча, когда позиций нет ни в реплее, ни у STRATZ. Признаки нормированы внутри команды; к логистической модели добавлен prior на роль самого героя, измеренный по этой же базе.',
  features: FEATURES,
  mean,
  std,
  W,
  b,
  prior: priorCounts,
  priorFallback,
  usePrior: chosen === 'economyPlusHero',
  accuracy: evals[chosen].accuracy,
  laneAccuracy: evals[chosen].laneAccuracy,
  baselines: {
    economyOnly: evals.economyOnly.accuracy,
    economyPlusHero: evals.economyPlusHero.accuracy,
    farmOrder: evals.farmOrder.accuracy,
    farmOrderLane: evals.farmOrder.laneAccuracy,
  },
  samples: { train: train.length, test: test.length, teams: data.length },
}))

const pct = (x) => `${(x * 100).toFixed(1)}%`
console.log(`размеченных команд: ${data.length}, игроков: ${train.length + test.length} (обучение ${train.length} / проверка ${test.length})`)
console.log('точность на проверке — роль 1–5:')
console.log('  порядок фарма (как было):', pct(evals.farmOrder.accuracy))
console.log('  только экономика:        ', pct(evals.economyOnly.accuracy))
console.log('  экономика + роль героя:  ', pct(evals.economyPlusHero.accuracy))
console.log('точность по линии (лёгкая/мид/сложная):')
console.log('  порядок фарма:', pct(evals.farmOrder.laneAccuracy), '→ модель:', pct(evals[chosen].laneAccuracy))
console.log('выбрана:', chosen)
console.log(`${OUT} — ${(JSON.stringify(readFileSync(OUT, 'utf8')).length / 1024).toFixed(0)} КБ`)
