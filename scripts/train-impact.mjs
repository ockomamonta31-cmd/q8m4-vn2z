#!/usr/bin/env node
// «Честная» модель импакта. В отличие от IMP STRATZ (их закрытая нейросеть)
// здесь прозрачная схема:
//
// 1) Win-модель: P(победа Radiant | статистика всех 10 игроков).
//    Обучается на реальных исходах матчей, НЕ на их IMP. Признаки — только
//    работа игрока (урон, килы-качество, варды, стаки, руны, движение…);
//    ранг и isVictory в признаки НЕ входят (ранг обрабатывается baseline'ом,
//    исход — это разметка).
// 2) Импакт игрока = насколько ЕГО присутствие сдвигает шанс победы команды
//    относительно ТИПИЧЕСКОГО игрока ЕГО же ранга и позиции (baseline из
//    датасета). Так честно учитываются:
//    - ворованные килы: модель сама взвесит killShare vs dmgShare по данным;
//    - саппорт-работа: варды/деворды/стаки/руны/курьеры — признаки;
//    - рыцарь в пати с легендами: baseline — рыцарский, играешь на уровне
//      легенд → большой плюс;
//    - смурф: низкий seasonRank, играет сильно выше → большой плюс;
//    - аккаунтер: высокий seasonRank, играет ниже baseline своего ранга → минус.
//
// Два уровня признаков: base (доступно везде) и rich (+качество килов,
// саппорт, движение — только со страницы матча).
//
// Запуск:  node scripts/train-impact.mjs   (нужен scripts/rich-dataset.jsonl)

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_PATH = join(ROOT, 'scripts', 'rich-dataset.jsonl')
const OUT_PATH = join(ROOT, 'src', 'api', 'impact-model.json')

if (!existsSync(DATA_PATH)) {
  console.error(`Нет ${DATA_PATH} — сначала запусти scripts/harvest-rich.mjs`)
  process.exit(1)
}

// --- Загрузка данных ---

const rows = readFileSync(DATA_PATH, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  // Турбо искажает статистику (деньги/опыт ×2) — учимся на обычных режимах
  .filter((m) => !/TURBO/.test(m.gameMode ?? ''))

console.log(`Матчей: ${rows.length}`)
const playerRows = rows.flatMap((m) => m.players.map((p) => ({ ...p, matchId: m.id })))
console.log(`Игроко-строк: ${playerRows.length}`)

// --- Признаки ---

const BASE_FEATURES = [
  'k', 'd', 'a', 'kpm', 'dpm', 'apm',
  'gpm', 'xpm', 'lh', 'denies', 'networth', 'level',
  'heroDmg', 'heroDmgPerMin', 'towerDmg', 'heroHeal',
  'dmgShare', 'killShare',
]

const RICH_FEATURES = [
  ...BASE_FEATURES,
  'assistsPerKill', 'soloKillRate', 'gankKillRate',
  'avgGoldFed', 'dieBacks', 'diedWithHeal', 'tpFailDeaths',
  'wardsObs', 'wardsSen', 'dewards', 'campStacks', 'runes', 'courierKills',
  'smokesBought', 'dustsBought',
  'pathPerMin', 'apmAvg', 'fountainTrips',
]

function vec(p, features) {
  return features.map((f) => {
    const v = p[f]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  })
}

// --- Математика: ridge, MLP, метрики ---

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

function trainMLP(X, y, epochs, H, seed, Xval, yval) {
  const dim = X[0].length
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
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
  const bs = 128
  let t = 0

  // Ранний останов по holdout BCE: без него веса «взрываются» на линейно
  // разделимых пост-фактум статах, tanh насыщается (все градиенты ≈0),
  // и атрибуция вырождается — разные игроки получают одинаковый P.
  const predictRaw = (x) => {
    const h = new Array(H)
    for (let j = 0; j < H; j++) {
      let acc = b1[j]
      for (let k = 0; k < dim; k++) acc += x[k] * W1[k][j]
      h[j] = Math.tanh(acc)
    }
    let out = b2
    for (let j = 0; j < H; j++) out += h[j] * W2[j]
    return out
  }
  const bce = (xv, yv) => {
    let l = 0
    for (let i = 0; i < xv.length; i++) {
      const p = Math.min(1 - 1e-7, Math.max(1e-7, sigmoid(predictRaw(xv[i]))))
      const t = smooth(yv[i])
      l -= t * Math.log(p) + (1 - t) * Math.log(1 - p)
    }
    return l / xv.length
  }
  let bestLoss = Infinity
  let stale = 0
  let bestW = null
  const smooth = (v) => 0.05 + 0.9 * v
  const snapshot = () => ({
    W1: W1.map((r) => r.slice()), b1: b1.slice(), W2: W2.slice(), b2,
  })
  const restore = (sn) => {
    for (let k = 0; k < dim; k++) for (let j = 0; j < H; j++) W1[k][j] = sn.W1[k][j]
    for (let j = 0; j < H; j++) { b1[j] = sn.b1[j]; W2[j] = sn.W2[j] }
    b2 = sn.b2
  }

  for (let epoch = 0; epoch < epochs; epoch++) {
    const perm = Array.from({ length: N }, (_, i) => i)
    for (let i = N - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0
      const j = s % (i + 1)
      ;[perm[i], perm[j]] = [perm[j], perm[i]]
    }
    for (let start = 0; start < N; start += bs) {
      t++
      const idx = perm.slice(start, start + bs)
      const gW1 = W1.map((r) => r.map(() => 0)); const gb1 = new Array(H).fill(0)
      const gW2 = new Array(H).fill(0); let gb2 = 0
      for (const i of idx) {
        const x = X[i]
        const h = new Array(H)
        for (let j = 0; j < H; j++) {
          let acc = b1[j]
          for (let k = 0; k < dim; k++) acc += x[k] * W1[k][j]
          h[j] = Math.tanh(acc)
        }
        let out = b2
        for (let j = 0; j < H; j++) out += h[j] * W2[j]
        // BCE-градиент: p = sigmoid(out), dL/dout = (p - y) — лосс логистический,
        // не MSE по сырым логитам (иначе логиты растут бесконечно).
        // Label smoothing (y ∈ [0.05, 0.95]) ограничивает |logit| ≤ log(19) ≈ 3:
        // финальные статы почти детерминированно определяют исход (AUC=1),
        // и без ограничения P сидит на 0/1, а атрибуция ΔP вырождается
        // в две константы — все игроки получают одинаковый балл.
        const p = sigmoid(out)
        const err = (p - (0.05 + 0.9 * y[i])) * 2
        for (let j = 0; j < H; j++) {
          const dOut = (err * 2) / idx.length
          gW2[j] += dOut * h[j]
          gb2 += dOut
          const dH = dOut * W2[j] * (1 - h[j] * h[j])
          gb1[j] += dH
          for (let k = 0; k < dim; k++) gW1[k][j] += dH * x[k]
        }
      }
      const upd = (m, v, g, j2) => {
        m[j2] = beta1 * m[j2] + (1 - beta1) * g
        v[j2] = beta2 * v[j2] + (1 - beta2) * g * g
        return (lr * (m[j2] / (1 - beta1 ** t))) / (Math.sqrt(v[j2] / (1 - beta2 ** t)) + eps)
      }
      for (let k = 0; k < dim; k++) for (let j = 0; j < H; j++) W1[k][j] -= upd(mW1[k], vW1[k], gW1[k][j], j)
      for (let j = 0; j < H; j++) {
        b1[j] -= upd(mb1, vb1, gb1[j], j)
        W2[j] -= upd(mW2, vW2, gW2[j], j)
      }
      b2 -= upd(mB2, vB2, gb2, 0)
      // AdamW: слабый decay удерживает веса, tanh остаётся в рабочей зоне
      const wd = 0.05
      for (let k = 0; k < dim; k++) for (let j = 0; j < H; j++) W1[k][j] -= lr * wd * W1[k][j]
      for (let j = 0; j < H; j++) W2[j] -= lr * wd * W2[j]
    }
    if (Xval && Xval.length) {
      const vl = bce(Xval, yval)
      if (vl < bestLoss - 1e-5) { bestLoss = vl; bestW = snapshot(); stale = 0 } else stale++
      if (stale >= 15) break
    }
  }
  if (bestW) restore(bestW)
  return {
    kind: 'mlp', dim, H, W1, b1, W2, b2,
    predict(x) {
      const h = new Array(H)
      for (let j = 0; j < H; j++) {
        let acc = b1[j]
        for (let k = 0; k < dim; k++) acc += x[k] * W1[k][j]
        h[j] = Math.tanh(acc)
      }
      let out = b2
      for (let j = 0; j < H; j++) out += h[j] * W2[j]
      return out
    },
    export() { return { kind: 'mlp', dim, H, W1, b1, W2, b2 } },
  }
}

function ridgeModel(beta, mean, std) {
  return {
    kind: 'ridge',
    predict(x) {
      const z = [1, ...x.map((v, j) => (v - mean[j]) / (std[j] || 1))]
      return z.reduce((s, v, j) => s + v * beta[j], 0)
    },
  }
}

const sigmoid = (v) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, v))))

// Калибровка температуры на holdout: P = sigmoid(logit / T), минимум log-loss.
// T ≥ 1 только сглаживает (не у sharpening): наша цель — не максимум log-loss
// качества, а осмысленная атрибуция; T<1 снова насыщает sigmoid и ΔP
// вырождается в «всё или ничего».
function calibrateT(logits, labels) {
  let bestT = 1
  let bestLL = Infinity
  for (let T = 1; T <= 20; T += 0.05) {
    let ll = 0
    for (let i = 0; i < logits.length; i++) {
      const p = Math.min(1 - 1e-7, Math.max(1e-7, sigmoid(logits[i] / T)))
      ll -= labels[i] ? Math.log(p) : Math.log(1 - p)
    }
    if (ll < bestLL) { bestLL = ll; bestT = T }
  }
  return { T: bestT, logLoss: bestLL / logits.length }
}

function auc(scores, labels) {
  const pairs = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s)
  let rankSum = 0
  let idx = 0
  while (idx < pairs.length) {
    let j = idx
    while (j < pairs.length && pairs[j].s === pairs[idx].s) j++
    const avgRank = (idx + 1 + j) / 2
    for (let k = idx; k < j; k++) if (pairs[k].y === 1) rankSum += avgRank
    idx = j
  }
  const nPos = labels.filter((y) => y === 1).length
  const nNeg = labels.length - nPos
  return (rankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg)
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

const clamp01 = (v) => Math.max(0, Math.min(1, v))

// Ранк-бакеты: ключи кратны 10 (10…80). «45» не существует — это ловушка.
const bucketOf = (rank) => Math.max(10, Math.min(80, Math.round((rank || 45) / 10) * 10))

// --- Обучение одного уровня (base/rich) ---

function trainLevel(name, featureNames) {
  console.log(`\n=== Уровень ${name} (${featureNames.length} признаков) ===`)
  let features = featureNames

  // Дифф-векторы команд: mean(radiant) - mean(dire)
  const X = []
  const y = []
  const matchCtx = [] // контекст для атрибуции
  for (const m of rows) {
    const rad = m.players.filter((p) => p.isRadiant)
    const dire = m.players.filter((p) => !p.isRadiant)
    if (rad.length !== 5 || dire.length !== 5) continue
    const vR = rad.map((p) => vec(p, features))
    const vD = dire.map((p) => vec(p, features))
    const meanR = features.map((_, j) => vR.reduce((s, v) => s + v[j], 0) / 5)
    const meanD = features.map((_, j) => vD.reduce((s, v) => s + v[j], 0) / 5)
    X.push(meanR.map((v, j) => v - meanD[j]))
    y.push(m.didRadiantWin ? 1 : 0)
    matchCtx.push({ id: m.id, vR, vD, wRadiant: m.didRadiantWin, playersR: rad, playersD: dire, actualRank: m.actualRank })
  }

  // Стандартизация (с защитой от NaN — иначе всё обучение в мусор)
  let dim = X[0].length
  let nanRows = 0
  for (const x of X) {
    if (x.some((v) => !Number.isFinite(v))) nanRows++
  }
  if (nanRows > 0) {
    console.log(`  ВНИМАНИЕ: ${nanRows} строк с NaN/Inf — заменены на 0`)
    for (const x of X) for (let j = 0; j < x.length; j++) if (!Number.isFinite(x[j])) x[j] = 0
  }

  // Вырожденные признаки: дифф команд по «доле» (dmgShare/killShare) == 0
  // МАТЕМАТИЧЕСКИ (сумма долей своей команды = 1 для обеих команд), std —
  // только шум округления. z = diff/std взрывается до 1e14, tanh насыщается
  // и вся атрибуция вырождается в две константы. Исключаем такие признаки.
  const keepIdx = []
  for (let j = 0; j < dim; j++) {
    const mu = X.reduce((s, x) => s + x[j], 0) / X.length
    const sd = Math.sqrt(X.reduce((s, x) => s + (x[j] - mu) ** 2, 0) / X.length)
    if (sd > 1e-6) keepIdx.push(j)
  }
  if (keepIdx.length < dim) {
    const dropped = features.filter((_, j) => !keepIdx.includes(j))
    console.log(`  исключены вырожденные признаки (std диффа ≈ 0): ${dropped.join(', ')}`)
    features = keepIdx.map((j) => features[j])
    for (let i = 0; i < X.length; i++) X[i] = keepIdx.map((j) => X[i][j])
    for (const ctx of matchCtx) {
      ctx.vR = ctx.vR.map((v) => keepIdx.map((j) => v[j]))
      ctx.vD = ctx.vD.map((v) => keepIdx.map((j) => v[j]))
    }
    dim = keepIdx.length
  }
  const mean = new Array(dim).fill(0)
  const std = new Array(dim).fill(0)
  for (const x of X) for (let j = 0; j < dim; j++) mean[j] += x[j] / X.length
  for (const x of X) for (let j = 0; j < dim; j++) std[j] += (x[j] - mean[j]) ** 2 / X.length
  for (let j = 0; j < dim; j++) std[j] = Math.sqrt(std[j]) || 1
  const Xz = X.map((x) => x.map((v, j) => (v - mean[j]) / std[j]))

  // Разбивка по матчам 85/15
  const perm = Xz.map((_, i) => i)
  let s = 11
  for (let i = perm.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[perm[i], perm[j]] = [perm[j], perm[i]]
  }
  const split = Math.floor(perm.length * 0.85)
  const tr = perm.slice(0, split)
  const te = perm.slice(split)
  const Xtr = tr.map((i) => Xz[i]); const ytr = tr.map((i) => y[i])
  const Xte = te.map((i) => Xz[i]); const yte = te.map((i) => y[i])

  // Ridge
  const beta = trainRidge(Xtr, ytr, 0.5)
  const ridgePred = Xte.map((x) => [1, ...x].reduce((acc, v, j) => acc + v * beta[j], 0))
  const ridgeAuc = auc(ridgePred, yte)

  // MLP (BCE + weight decay + ранний останов по holdout)
  const mlp = trainMLP(Xtr, ytr, 250, 16, 777, Xte, yte)
  const mlpPred = Xte.map((x) => mlp.predict(x))
  const mlpAuc = auc(mlpPred, yte)

  // Диагностика NaN/константности скоров — иначе AUC «1.000» ничего не значит
  const stat = (arr) => {
    const nan = arr.filter((v) => !Number.isFinite(v)).length
    const fin = arr.filter(Number.isFinite)
    return `NaN=${nan} min=${fin.length ? Math.min(...fin).toFixed(4) : '-'} max=${fin.length ? Math.max(...fin).toFixed(4) : '-'}`
  }
  console.log(`  ridgePred: ${stat(ridgePred)}`)
  console.log(`  mlpPred:   ${stat(mlpPred)}`)
  console.log(`  beta NaN: ${beta.filter((v) => !Number.isFinite(v)).length}/${beta.length}`)
  const w1nan = mlp.export().W1.flat().filter((v) => !Number.isFinite(v)).length
  console.log(`  W1 NaN: ${w1nan}, W2 NaN: ${mlp.export().W2.filter((v) => !Number.isFinite(v)).length}, b2=${mlp.export().b2}`)

  const useMlp = mlpAuc >= ridgeAuc
  // Сравниваем не только AUC (он у обоих 1.0), но и log-loss после калибровки —
  // насыщенный MLP даёт одинаковые P для разных игроков (хуже для атрибуции)
  const tRidge = calibrateT(ridgePred, yte)
  const tMlp = calibrateT(mlpPred, yte)
  console.log(`  ridge AUC=${ridgeAuc.toFixed(3)} logloss=${tRidge.logLoss.toFixed(3)}  mlp AUC=${mlpAuc.toFixed(3)} logloss=${tMlp.logLoss.toFixed(3)}`)
  const useMlpFinal = tMlp.logLoss < tRidge.logLoss - 0.005
  if (useMlpFinal !== useMlp) console.log(`  → log-loss выбирает ${useMlpFinal ? 'mlp' : 'ridge'}`)

  // Калибровка температуры на holdout: без неё P сидит на 0/1 и ΔP — бинарный
  const chosenLogits = useMlpFinal ? mlpPred : ridgePred
  const { T, logLoss } = calibrateT(chosenLogits, yte)
  console.log(`  калибровка: T=${T.toFixed(2)}, log-loss=${logLoss.toFixed(3)} → модель: ${useMlpFinal ? 'mlp' : 'ridge'}`)

  const win = useMlpFinal
    ? { ...mlp.export(), mean, std, T }
    : { kind: 'ridge', beta, mean, std, T }

  const predictWin = (diff) => {
    const z = diff.map((v, j) => (v - mean[j]) / (std[j] || 1))
    const logit = useMlpFinal
      ? mlp.predict(z)
      : [1, ...z].reduce((acc, v, j) => acc + v * beta[j], 0)
    const pred = sigmoid(logit / T)
    if (!Number.isFinite(pred) && !predictWin._logged) {
      predictWin._logged = true
      const badZ = z.filter((v) => !Number.isFinite(v)).length
      const badMean = mean.filter((v) => !Number.isFinite(v)).length
      const badStd = std.filter((v) => !Number.isFinite(v) || v === 0).length
      const badDiff = diff.filter((v) => !Number.isFinite(v)).length
      console.log(`  DEBUG predictWin NaN: badZ=${badZ}/${z.length} badMean=${badMean} badStd=${badStd} badDiff=${badDiff} diffLen=${diff.length} dim=${dim}`)
    }
    return pred
  }

  // --- Baselines: (позиция, ранг-бакет) → средний вектор + глобальные ---
  const posMean = {} // позиция → средний вектор (все ранги)
  const posCount = {}
  const cell = {} // "pos:bucket" → {sum, n}
  for (const p of playerRows) {
    const pos = p.position >= 1 && p.position <= 5 ? p.position : 0
    const rank = p.seasonRank
    if (!posMean[pos]) { posMean[pos] = new Array(features.length).fill(0); posCount[pos] = 0 }
    const v = vec(p, features)
    for (let j = 0; j < features.length; j++) posMean[pos][j] += v[j]
    posCount[pos]++
    if (rank > 0) {
      const bucket = bucketOf(rank)
      const key = `${pos}:${bucket}`
      if (!cell[key]) cell[key] = { sum: new Array(features.length).fill(0), n: 0 }
      for (let j = 0; j < features.length; j++) cell[key].sum[j] += v[j]
      cell[key].n++
    }
  }
  for (const pos of Object.keys(posMean)) {
    for (let j = 0; j < features.length; j++) posMean[pos][j] /= posCount[pos]
  }
  const baselines = {}
  for (const [key, { sum, n }] of Object.entries(cell)) {
    // shrinkage к среднему по позиции при малой выборке
    const [pos, bucket] = key.split(':').map(Number)
    const alpha = n / (n + 40)
    baselines[key] = sum.map((s2, j) => alpha * (s2 / n) + (1 - alpha) * (posMean[pos]?.[j] ?? 0))
  }
  // baseline "все позиции" для ранг-бакета (для импутированных матчей)
  const bucketAll = {}
  for (const p of playerRows) {
    const rank = p.seasonRank
    if (rank <= 0) continue
    const bucket = bucketOf(rank)
    if (!bucketAll[bucket]) bucketAll[bucket] = { sum: new Array(features.length).fill(0), n: 0 }
    const v = vec(p, features)
    for (let j = 0; j < features.length; j++) bucketAll[bucket].sum[j] += v[j]
    bucketAll[bucket].n++
  }
  const rankBuckets = {}
  for (const [bucket, { sum, n }] of Object.entries(bucketAll)) {
    rankBuckets[bucket] = sum.map((v) => v / n)
  }

  function nearestExisting(target) {
    const keys = Object.keys(rankBuckets).map(Number)
    if (!keys.length) return null
    return keys.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
  }
  function baselineFor(pos, seasonRank) {
    const bucket = bucketOf(seasonRank || 45)
    const key = `${pos}:${bucket}`
    if (pos >= 1 && pos <= 5 && baselines[key]) return baselines[key]
    if (rankBuckets[bucket]) return rankBuckets[bucket]
    // ближайший существующий ранг-бакет
    const near = nearestExisting(bucket)
    return (near !== null ? rankBuckets[near] : null) ?? posMean[pos] ?? new Array(features.length).fill(0)
  }
  function lobbyBaseline(actualRank) {
    const near = nearestExisting(bucketOf(actualRank || 45))
    return near !== null ? rankBuckets[near] : undefined
  }

  // --- Атрибуция на обучающих матчах (реальный контекст команд) ---
  const impacts = []
  for (const ctx of matchCtx) {
    const meanR = features.map((_, j) => ctx.vR.reduce((s2, v) => s2 + v[j], 0) / 5)
    const meanD = features.map((_, j) => ctx.vD.reduce((s2, v) => s2 + v[j], 0) / 5)
    const diffBase = meanR.map((v, j) => v - meanD[j])
    const pBase = predictWin(diffBase)
    for (let team = 0; team < 2; team++) {
      const vecs = team === 0 ? ctx.vR : ctx.vD
      const players = team === 0 ? ctx.playersR : ctx.playersD
      const otherMean = team === 0 ? meanD : meanR
      for (let i = 0; i < 5; i++) {
        const p = players[i]
        const base = baselineFor(p.position, p.seasonRank)
        // заменяем игрока на baseline его ранга/позиции
        const newTeamMean = vecs.reduce(
          (acc, vv, ii) => acc.map((s2, j) => s2 + (ii === i ? base[j] : vv[j]) / 5),
          new Array(features.length).fill(0),
        )
        const diffNew = team === 0
          ? newTeamMean.map((v, j) => v - otherMean[j])
          : otherMean.map((v, j) => v - newTeamMean[j])
        const pNew = predictWin(diffNew)
        // импакт на шанс СВОЕЙ команды победить
        const impact = team === 0 ? pBase - pNew : pNew - pBase
        if (!Number.isFinite(impact) && impacts.length < 3) {
          console.log(`  DEBUG NaN: match=${ctx.id} team=${team} i=${i} pBase=${pBase} pNew=${pNew} pos=${p.position} rank=${p.seasonRank} baseNaN=${base.some((v) => !Number.isFinite(v))} diffBaseNaN=${diffBase.some((v) => !Number.isFinite(v))}`)
        }
        impacts.push({
          impact, matchId: ctx.id,
          stratzImp: p.stratzImp, won: team === 0 ? ctx.wRadiant : !ctx.wRadiant,
          seasonRank: p.seasonRank, position: p.position,
        })
      }
    }
  }

  // Масштаб: шкала в «процентных пунктах шанса победы» — ΔP × 100.
  // Самая честная и интерпретируемая шкала: "+12" = «этот игрок относительно
  // типичного игрока своего ранга/позиции поднял шанс победы команды на
  // 12 процентов». Без искусственной нормировки на перцентили.
  const scale = 100

  // Метрики честности
  const corrPairs = impacts.filter((i) => typeof i.stratzImp === 'number')
  const corr = pearson(corrPairs.map((i) => i.impact * scale), corrPairs.map((i) => i.stratzImp))
  const winMean = impacts.filter((i) => i.won).map((i) => i.impact * scale)
  const lossMean = impacts.filter((i) => !i.won).map((i) => i.impact * scale)
  const avg = (arr) => (arr.length ? arr.reduce((s2, v) => s2 + v, 0) / arr.length : 0)
  // Дисперсия импактов: если все одинаковые — атрибуция мертва
  const allImp = impacts.map((i) => i.impact * scale)
  const sd = Math.sqrt(allImp.reduce((s2, v) => s2 + (v - avg(allImp)) ** 2, 0) / allImp.length)
  const absSorted = impacts.map((i) => Math.abs(i.impact)).sort((a, b) => a - b)
  const p95 = absSorted[Math.floor(absSorted.length * 0.95)] || 0.01
  console.log(`  масштаб: шкала процентных пунктов шанса (ΔP×100), p95|ΔP|=${p95.toFixed(4)}`)
  console.log(`  разброс импактов: sd=${sd.toFixed(1)}, min=${Math.min(...allImp).toFixed(1)}, max=${Math.max(...allImp).toFixed(1)}`)
  console.log(`  корреляция с их IMP: r=${corr.toFixed(3)} (ожидаем умеренную — мы считаем иначе)`)
  console.log(`  средний импакт победителей: ${avg(winMean).toFixed(1)}, проигравших: ${avg(lossMean).toFixed(1)}`)

  return {
    name,
    features,
    win,
    baselines,
    posMean,
    rankBuckets,
    scale,
    metrics: {
      auc: Number((useMlpFinal ? mlpAuc : ridgeAuc).toFixed(4)),
      ridgeAuc: Number(ridgeAuc.toFixed(4)),
      mlpAuc: Number(mlpAuc.toFixed(4)),
      corrWithStratzImp: Number(corr.toFixed(4)),
      winAvgImpact: Number(avg(winMean).toFixed(2)),
      lossAvgImpact: Number(avg(lossMean).toFixed(2)),
    },
  }
}

// --- Синтетические проверки честности ---

function makePredictor(level) {
  const { win, scale } = level
  const mean = win.mean
  const std = win.std
  const T = win.T || 1
  const f = (diff) => {
    const z = diff.map((v, j) => (v - mean[j]) / (std[j] || 1))
    let out
    if (win.kind === 'mlp') {
      const h = new Array(win.H)
      for (let j = 0; j < win.H; j++) {
        let acc = win.b1[j]
        for (let k = 0; k < win.dim; k++) acc += z[k] * win.W1[k][j]
        h[j] = Math.tanh(acc)
      }
      out = win.b2
      for (let j = 0; j < win.H; j++) out += h[j] * win.W2[j]
    } else {
      out = [1, ...z].reduce((s, v, j) => s + v * win.beta[j], 0)
    }
    return sigmoid(out / T)
  }
  return { f, scale }
}

function syntheticChecks(level) {
  console.log(`\n=== Синтетика (${level.name}) ===`)
  syntheticChecks._debug = process.env.SYN_DEBUG === '1'
  const { f, scale } = makePredictor(level)
  const feats = level.features
  // ключей 45 не бывает — берём ближайший существующий
  const pickBucket = (target) => {
    const keys = Object.keys(level.rankBuckets).map(Number)
    if (!keys.length) return new Array(feats.length).fill(0)
    const want = bucketOf(target)
    return level.rankBuckets[keys.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a))]
      ?? new Array(feats.length).fill(0)
  }
  const base = pickBucket(45)
  const idx = (name) => feats.indexOf(name)
  /** Ячейка «типичный игрок позиции pos ранга rank» — внутри распределения данных. */
  const cell = (pos, rank) => {
    const key = `${pos}:${bucketOf(rank)}`
    if (level.baselines[key]) return level.baselines[key].slice()
    return pickBucket(rank).slice()
  }
  /** Копия вектора; значения-функции считаются от текущего значения признака. */
  const vary = (vec, over) => {
    const v = vec.slice()
    for (const [k, val] of Object.entries(over)) {
      const i = idx(k)
      if (i >= 0) v[i] = typeof val === 'function' ? val(v[i]) : val
    }
    return v
  }
  const lobby = pickBucket(45)

  const impactOf = (myVec, myPos, myRank, lobbyVec) => {
    const base2 = (() => {
      const key = `${myPos}:${bucketOf(myRank)}`
      return level.baselines[key] ?? pickBucket(myRank)
    })()
    const others = new Array(feats.length).fill(0)
    for (let j = 0; j < feats.length; j++) others[j] = (lobbyVec[j] * 5 - myVec[j]) / 4
    const meanR = myVec.map((v, j) => (v + others[j] * 4) / 5)
    const diffBase = meanR.map((v, j) => v - lobbyVec[j])
    const pBase = f(diffBase)
    const swapped = base2.map((v, j) => (v + others[j] * 4) / 5)
    const diffNew = swapped.map((v, j) => v - lobbyVec[j])
    const pNew = f(diffNew)
    if (syntheticChecks._debug) {
      const stdv = level.win.std
      const n1 = diffNew.filter((v, j) => Math.abs(v) > (stdv?.[j] || 1)).length
      console.log(`      [dbg] pBase=${pBase.toFixed(4)} pNew=${pNew.toFixed(4)} |diffNew|>1σ: ${n1}/${diffNew.length}`)
    }
    return (pBase - pNew) * scale
  }

  // 1) Вор килов vs честный керри: одинаковый KDA, разный реальный вклад
  const kda = { k: 14, d: 3, a: 5, killShare: 0.4 }
  const carCell = cell(1, 45)
  const stealer = vary(carCell, { ...kda, dmgShare: 0.15, heroDmg: (v) => v * 0.5, heroDmgPerMin: (v) => v * 0.5, towerDmg: (v) => v * 0.5 })
  const honest = vary(carCell, { ...kda, dmgShare: 0.38, heroDmg: (v) => v * 1.4, heroDmgPerMin: (v) => v * 1.4, towerDmg: (v) => v * 1.6 })
  const iSteal = impactOf(stealer, 1, 45, lobby)
  const iHonest = impactOf(honest, 1, 45, lobby)
  console.log(`  вор килов (KDA 14/3/5, доля урона 15%): ${iSteal.toFixed(1)}`)
  console.log(`  честный керри (KDA 14/3/5, доля 38%):  ${iHonest.toFixed(1)}   ${iHonest > iSteal ? 'OK ← честный выше' : 'ПРОБЛЕМА: вор выше'}`)

  // 2) Саппорт с макро-работой vs без неё: одинаковые KDA/GPM
  if (idx('wardsObs') >= 0) {
    const supKda = { k: 2, d: 6, a: 21, gpm: 380 }
    const supCell = cell(5, 45)
    const wardGuy = vary(supCell, { ...supKda, wardsObs: 14, wardsSen: 6, dewards: 5, campStacks: 8, runes: 6, courierKills: 1 })
    const lazySup = vary(supCell, { ...supKda, wardsObs: 1, wardsSen: 0, dewards: 0, campStacks: 0, runes: 1, courierKills: 0 })
    const iWard = impactOf(wardGuy, 5, 45, lobby)
    const iLazy = impactOf(lazySup, 5, 45, lobby)
    console.log(`  саппорт с вардами/стаками/рунами: ${iWard.toFixed(1)}`)
    console.log(`  саппорт без макро-работы:          ${iLazy.toFixed(1)}   ${iWard > iLazy ? 'OK ← с вкладом выше' : 'ПРОБЛЕМА: ленивый выше'}`)
  } else {
    console.log('  (rich-признаки недоступны — пропуск проверки саппорта)')
  }

  // 3) Игрок низкого ранга в лобби выше своего ранга («рыцарь среди легенд»):
  //    бакет 20 в данных реально слабее лобби (gpm 400 vs 475) — играет на
  //    уровне лобби → большой плюс; играет как типичный для ранга → ≈0
  const lowCell = cell(3, 20)
  const atLobby = lowCell.map((v, j) => v + (lobby[j] - v) * 0.9)
  const crusaAboveLobby = impactOf(atLobby, 3, 20, lobby)
  const crusaTypical = impactOf(lowCell, 3, 20, lobby)
  console.log(`  игрок ранга 20, играющий на уровне лобби (50): ${crusaAboveLobby.toFixed(1)}   ${crusaAboveLobby > 5 ? 'OK' : 'ПРОБЛЕМА'}`)
  console.log(`  игрок ранга 20, играющий как типичный для ранга:   ${crusaTypical.toFixed(1)}   ${Math.abs(crusaTypical) < 1 ? 'OK ← ровно 0, сам себе базлайн' : 'ПРОБЛЕМА'}`)

  // 4) Смурф/аккаунтер: статы выше/ниже базлайна объявленного ранга
  const smurfVec = vary(cell(2, 25), { gpm: (v) => v * 1.2, xpm: (v) => v * 1.2, networth: (v) => v * 1.2, heroDmg: (v) => v * 1.3, k: (v) => v + 4, dmgShare: (v) => v + 0.08 })
  const buyerVec = vary(cell(2, 65), { gpm: (v) => v * 0.8, xpm: (v) => v * 0.8, networth: (v) => v * 0.8, heroDmg: (v) => v * 0.7, k: (v) => Math.max(0, Math.round(v * 0.6)), dmgShare: (v) => v * 0.7 })
  const smurf = impactOf(smurfVec, 2, 25, lobby)
  const buyer = impactOf(buyerVec, 2, 65, lobby)
  console.log(`  смурф (ранг 25, статы выше ранга):     ${smurf.toFixed(1)}   ${smurf > 0 ? 'OK' : 'ПРОБЛЕМА'}`)
  console.log(`  аккаунтер (ранг 65, статы ниже ранга): ${buyer.toFixed(1)}   ${buyer < 0 ? 'OK' : 'ПРОБЛЕМА'}`)

  return { iSteal, iHonest }
}

// --- Запуск ---

const base = trainLevel('base', BASE_FEATURES)
const rich = trainLevel('rich', RICH_FEATURES)

syntheticChecks(base)
syntheticChecks(rich)

const model = {
  version: 2,
  kind: 'impact-win',
  trainedAt: new Date().toISOString(),
  matches: rows.length,
  players: playerRows.length,
  base,
  rich,
}

writeFileSync(OUT_PATH, JSON.stringify(model))
const kb = (readFileSync(OUT_PATH).length / 1024).toFixed(0)
console.log(`\nСохранено: ${OUT_PATH} (${kb} kB)`)
console.log(`base: AUC=${base.metrics.auc}, corr(IMP)=${base.metrics.corrWithStratzImp}`)
console.log(`rich: AUC=${rich.metrics.auc}, corr(IMP)=${rich.metrics.corrWithStratzImp}`)
