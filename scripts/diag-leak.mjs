// Почему AUC=1.000? Ищем: дубликаты матчей, утечку по одиночному признаку,
// NaN/константность скоров, пересечение train/test.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const rows = readFileSync(join(ROOT, 'scripts', 'rich-dataset.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .filter((m) => !/TURBO/.test(m.gameMode ?? ''))

// дубликаты
const ids = rows.map((m) => m.id)
const dup = ids.length - new Set(ids).size
console.log(`Матчей: ${rows.length}, уникальных id: ${new Set(ids).size}, дублей: ${dup}`)

const BASE = ['k', 'd', 'a', 'kpm', 'dpm', 'apm', 'gpm', 'xpm', 'lh', 'denies', 'networth', 'level', 'heroDmg', 'heroDmgPerMin', 'towerDmg', 'heroHeal', 'dmgShare', 'killShare']

function aucRaw(scores, labels) {
  const pairs = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s)
  let rankSum = 0, idx = 0
  while (idx < pairs.length) {
    let j = idx
    while (j < pairs.length && pairs[j].s === pairs[idx].s) j++
    const avgRank = (idx + 1 + j) / 2
    for (let k = idx; k < j; k++) if (pairs[k].y === 1) rankSum += avgRank
    idx = j
  }
  const nPos = labels.filter((y) => y === 1).length
  const nNeg = labels.length - nPos
  if (!nPos || !nNeg) return NaN
  return (rankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg)
}

// диффы команд по каждому признаку
const X = []
const y = []
for (const m of rows) {
  const rad = m.players.filter((p) => p.isRadiant)
  const dire = m.players.filter((p) => !p.isRadiant)
  if (rad.length !== 5 || dire.length !== 5) continue
  const row = BASE.map((f) => {
    const mr = rad.reduce((s, p) => s + (typeof p[f] === 'number' ? p[f] : 0), 0) / 5
    const md = dire.reduce((s, p) => s + (typeof p[f] === 'number' ? p[f] : 0), 0) / 5
    return mr - md
  })
  X.push(row)
  y.push(m.didRadiantWin ? 1 : 0)
}
console.log(`Матчей с 5+5: ${X.length}, позитивов: ${y.reduce((s, v) => s + v, 0)}`)

// одиночные AUC — ищем утечку (признак с AUC ~ 1.0)
console.log('\n=== Одиночные AUC (все матчи) ===')
for (let j = 0; j < BASE.length; j++) {
  const a = aucRaw(X.map((r) => r[j]), y)
  console.log(` ${BASE[j].padEnd(14)} ${a.toFixed(4)}`)
}

// NaN / константы
let nanCount = 0
for (const row of X) for (const v of row) if (!Number.isFinite(v)) nanCount++
console.log('\nNaN в X:', nanCount)

// пересечение train/test как в тренере (seed 11)
const perm = X.map((_, i) => i)
let s = 11
for (let i = perm.length - 1; i > 0; i--) {
  s = (s * 1664525 + 1013904223) >>> 0
  const j = s % (i + 1)
  ;[perm[i], perm[j]] = [perm[j], perm[i]]
}
const split = Math.floor(perm.length * 0.85)
const te = perm.slice(split)
const yte = te.map((i) => y[i])
console.log(`\nТест: ${yte.length}, позитивов: ${yte.reduce((a, b) => a + b, 0)}`)
const ytrSet = new Set(perm.slice(0, split))
console.log('Пересечение train/test по индексам:', te.filter((i) => ytrSet.has(i)).length)

// сколько матчей совпадают по вектору признаков между train и test (дубли содержимого)
const sig = (i) => X[i].map((v) => Math.round(v * 1000)).join(',')
const trSigs = new Set(perm.slice(0, split).map(sig))
console.log('Тестовых строк, чья копия есть в train:', te.filter((i) => trSigs.has(sig(i))).length)
