// IMP STRATZ как основная оценка матча + глобальная модель-дистилляция там,
// где их IMP = null.
//
// IMP (Individual Match Performance) — закрытая нейросеть STRATZ на 27 входах,
// шкала −100…+100 (https://github.com/STRATZ-Esports/knowledge-base/issues/21).
// Их формула не опубликована, значение берётся готовым из GraphQL (MatchPlayerType.imp).
//
// У части матчей IMP не рассчитан (проверено: прямой запрос match(id) тоже
// отдаёт null — данных у STRATZ просто нет). Для таких матчей используется
// глобальная модель (src/api/imp-model.json), обученная скриптом
// scripts/train-imp.mjs на тысячах ЧУЖИХ матчей (все брекеты, все ранги)
// по их реальным IMP. Признаки — вся доступная статистика: K/D/A, GPM/XPM,
// LH/DN, нетворт, уровень, урон по героям/башням/лечение, сторона, исход.
//
// Это дистилляция их модели, а не их точная формула — в UI помечается «~».
// Если модель ещё не обучена (placeholder) — встроенный фолбэк: локальная
// ridge-регрессия на матчах самого профиля.

import type { PlayerMatch } from './types'
import impModelJson from './imp-model.json'

const W = {
  kill: 0.3,
  death: 0.3,
  assist: 0.15,
  lastHit: 0.003,
  gpm: 0.002,
  xpm: 0.002,
} as const

/** Сырые баллы по публичной формуле Valve (может быть отрицательным). */
export function fantasyPoints(p: PlayerMatch['player']): number {
  return (
    p.kills * W.kill -
    p.deaths * W.death +
    p.assists * W.assist +
    p.numLastHits * W.lastHit +
    p.goldPerMinute * W.gpm +
    p.experiencePerMinute * W.xpm
  )
}

/** Цветовой класс бейджа IMP (−100…+100). */
export function scoreClass(imp: number): string {
  if (imp >= 15) return 'score-top'
  if (imp >= 0) return 'score-mid'
  if (imp <= -15) return 'score-low'
  return 'score-mid'
}

// --- Глобальная модель (обучена на чужих матчах скриптом train-imp.mjs) ---

interface GlobalImpModel {
  version: number
  trainedAt: string
  samples: number
  features: string[]
  mean: number[]
  std: number[]
  metrics: { holdoutMae: number; holdoutR: number }
  model:
    | { kind: 'ridge'; beta: number[] }
    | { kind: 'mlp'; dim: number; H: number; W1: number[][]; b1: number[]; W2: number[]; b2: number }
  placeholder?: boolean
}

const globalModel = impModelJson as GlobalImpModel

/** Признаки игрока для глобальной модели: K/D/A, скорости, GPM/XPM, LH/DN,
 * нетворт, уровень, урон/башни/лечение, сторона, исход, длительность.
 * Порядок соответствует imp-model.json (features). */
function globalFeatures(
  p: {
    kills: number
    deaths: number
    assists: number
    goldPerMinute: number
    experiencePerMinute: number
    numLastHits: number
    numDenies?: number
    networth?: number
    level?: number
    heroDamage?: number
    towerDamage?: number
    heroHealing?: number
    isRadiant?: boolean
    isVictory: boolean
  },
  durationSec: number,
): number[] {
  const d = Math.max(durationSec / 60, 1)
  const networth = p.networth ?? p.goldPerMinute * d
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
    p.numDenies ?? 0,
    networth,
    networth / (d * 100),
    p.level ?? 0,
    (p.level ?? 0) / d,
    p.heroDamage ?? 0,
    (p.heroDamage ?? 0) / d,
    (p.heroDamage ?? 0) / Math.max(networth, 1),
    p.towerDamage ?? 0,
    (p.towerDamage ?? 0) / d,
    p.heroHealing ?? 0,
    (p.heroHealing ?? 0) / d,
    p.isRadiant ? 1 : 0,
    p.isVictory ? 1 : 0,
    d,
  ]
}

function mlpForward(m: Extract<GlobalImpModel['model'], { kind: 'mlp' }>, x: number[]): number {
  const h = new Array<number>(m.H)
  for (let j = 0; j < m.H; j++) {
    let s = m.b1[j]
    for (let k = 0; k < m.dim; k++) s += x[k] * m.W1[k][j]
    h[j] = Math.tanh(s)
  }
  let out = m.b2
  for (let j = 0; j < m.H; j++) out += h[j] * m.W2[j]
  return out
}

/** Есть ли обученная (не-placeholder) глобальная модель. */
export const GLOBAL_MODEL_READY =
  !globalModel.placeholder && globalModel.samples > 0 && globalModel.features.length > 0

/** Оценка IMP глобальной моделью для любого игрока в матче. null — нет модели. */
export function predictImpGlobal(
  p: Parameters<typeof globalFeatures>[0],
  durationSec: number,
): number | null {
  if (!GLOBAL_MODEL_READY) return null
  const raw = globalFeatures(p, durationSec)
  if (raw.length !== globalModel.features.length) return null
  if (raw.some((v) => !Number.isFinite(v))) return null
  const x = raw.map((v, j) => (v - globalModel.mean[j]) / (globalModel.std[j] || 1))
  const model = globalModel.model
  const y =
    model.kind === 'ridge'
      ? [1, ...x].reduce((s, v, j) => s + v * model.beta[j], 0)
      : mlpForward(model, x)
  return Math.max(-100, Math.min(100, Math.round(y)))
}

export function globalModelInfo(): { samples: number; mae: number; r: number; trainedAt: string } | null {
  if (!GLOBAL_MODEL_READY) return null
  return {
    samples: globalModel.samples,
    mae: globalModel.metrics.holdoutMae,
    r: globalModel.metrics.holdoutR,
    trainedAt: globalModel.trainedAt,
  }
}

// --- Локальный фолбэк-оценщик (когда глобальная модель не обучена) ---

const MIN_SAMPLES = 15 // минимум матчей с известным IMP для обучения базовой модели
const MIN_SAMPLES_EXT = 40 // порог для расширенной модели (скорости, квадраты, турбо)
const LAMBDA = 1.0 // ridge-регуляризация

/** Базовые признаки: K, D, A, GPM, XPM, LH, durationMin. */
function featureRow(m: PlayerMatch): number[] {
  const p = m.player
  return [p.kills, p.deaths, p.assists, p.goldPerMinute, p.experiencePerMinute, p.numLastHits, m.durationSeconds / 60]
}

/**
 * Расширенные признаки: базовые + скорости за минуту, KDA-отношение,
 * квадрат GPM, чистый счёт (K+A−D), флаг турбо. Их IMP нелинеен
 * («больше — не всегда лучше»), поэтому добавляем нелинейности вручную.
 */
function featureRowExt(m: PlayerMatch): number[] {
  const p = m.player
  const base = featureRow(m)
  const dur = Math.max(m.durationSeconds / 60, 1)
  return [
    ...base,
    p.kills / dur,
    p.deaths / dur,
    p.assists / dur,
    p.numLastHits / dur,
    (p.kills + p.assists) / (p.deaths + 1),
    (p.goldPerMinute / 100) ** 2,
    p.kills + p.assists - p.deaths,
    m.gameMode === 'TURBO' ? 1 : 0,
  ]
}

export interface ImpEstimator {
  /** Оценка IMP (округлённая, −100…+100) или null, если признаков недостаточно. */
  predict(m: PlayerMatch): number | null
  /** Сколько матчей с их IMP использовано для обучения. */
  samples: number
  /** Корреляция предсказаний с их реальным IMP на обучающих строках (0…1). */
  fitCorr: number
}

/**
 * Обучает локальную ridge-регрессию на матчах профиля с известным IMP.
 * Возвращает null, если таких матчей меньше MIN_SAMPLES.
 */
export function fitImpEstimator(matches: PlayerMatch[]): ImpEstimator | null {
  const labeled = matches.filter((m) => m.player.imp !== null)
  if (labeled.length < MIN_SAMPLES) return null

  const extended = labeled.length >= MIN_SAMPLES_EXT
  const featurize = extended ? featureRowExt : featureRow
  const nFeatures = featurize(labeled[0]).length
  const dim = nFeatures + 1 // + bias

  // Стандартизация признаков по обучающим строкам
  const rows = labeled.map(featurize)
  const mean = new Array<number>(nFeatures).fill(0)
  const std = new Array<number>(nFeatures).fill(0)
  for (const r of rows) for (let j = 0; j < nFeatures; j++) mean[j] += r[j] / rows.length
  for (const r of rows) for (let j = 0; j < nFeatures; j++) std[j] += (r[j] - mean[j]) ** 2 / rows.length
  for (let j = 0; j < nFeatures; j++) std[j] = Math.sqrt(std[j]) || 1

  const norm = (r: number[]): number[] => [1, ...r.map((v, j) => (v - mean[j]) / std[j])]

  // Нормальные уравнения (XᵀX + λI)β = Xᵀy
  const XtX: number[][] = Array.from({ length: dim }, () => new Array<number>(dim).fill(0))
  const Xty = new Array<number>(dim).fill(0)
  for (let i = 0; i < rows.length; i++) {
    const x = norm(rows[i])
    const y = labeled[i].player.imp as number
    for (let a = 0; a < dim; a++) {
      for (let b = 0; b < dim; b++) XtX[a][b] += x[a] * x[b]
      Xty[a] += x[a] * y
    }
  }
  for (let a = 1; a < dim; a++) XtX[a][a] += LAMBDA // bias не регуляризуем

  const beta = solve(XtX, Xty)
  if (!beta) return null

  const dot = (r: number[]): number => {
    const x = norm(r)
    let y = 0
    for (let a = 0; a < dim; a++) y += beta[a] * x[a]
    return y
  }

  // Корреляция Пирсона предсказаний с их реальным IMP — мера «насколько
  // наша достройка похожа на их оценку» на тех матчах, где она известна
  const preds = rows.map(dot)
  const actuals = labeled.map((m) => m.player.imp as number)
  const fitCorr = pearson(preds, actuals)

  return {
    samples: labeled.length,
    fitCorr,
    predict(m: PlayerMatch): number | null {
      const raw = featurize(m)
      if (raw.some((v) => !Number.isFinite(v))) return null
      return Math.max(-100, Math.min(100, Math.round(dot(raw))))
    },
  }
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  const denom = Math.sqrt(vx * vy)
  return denom > 0 ? cov / denom : 0
}

/** Решение СЛАУ методом Гаусса с частичным выбором ведущего элемента. */
function solve(A: number[][], b: number[]): number[] | null {
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
