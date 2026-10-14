// Shared assessment. Match and history rows supply observed team totals;
// isolated rows use estimated shares only when those totals are unavailable.

import type { ImpactInput } from './impact'
import { globalModelInfo, predictImpGlobal, type ImpEstimator } from './performance'
import type { PlayerMatch } from './types'
import { assessPlayer } from './assessment'

export type ImpactScore = {
  value: number
  /** model — наша модель, imp — оценка источника, estimate — предсказание фолбэка */
  source: 'replay' | 'model' | 'imp' | 'estimate'
  note: string
}

type ImpactRow = ImpactInput & { imp: number | null; isVictory: boolean }

export function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`
}

export function resolveImpact(
  row: ImpactRow,
  durationSec: number,
  seasonRank: number | null,
): ImpactScore | null {
  const assessment = assessPlayer(row, durationSec, seasonRank)
  if (assessment) {
    return {
      value: assessment.value,
      source: 'model',
      note: assessment.note + (row.teamKills === undefined ? ' Убийства команды оценены: данных команды нет.' : ''),
    }
  }

  if (row.imp !== null) {
    return { value: row.imp, source: 'imp', note: 'Оценка источника: −100…+100 за вклад в победу.' }
  }

  const estimate = predictImpGlobal(row, durationSec)
  if (estimate !== null) {
    const info = globalModelInfo()
    return {
      value: estimate,
      source: 'estimate',
      note: info
        ? `Предсказание модели-фолбэка: обучена на ${info.samples.toLocaleString('ru-RU')} записях игроков, MAE ±${info.mae}. Для этого игрока точная оценка не посчитана.`
        : 'Предсказание модели-фолбэка.',
    }
  }

  return null
}

/** Фолбэк списка матчей: локальная модель на истории самого профиля. */
export function localImpact(estimator: ImpEstimator | null, match: PlayerMatch): ImpactScore | null {
  if (!estimator) return null
  const value = estimator.predict(match)
  if (value === null) return null
  return {
    value,
    source: 'estimate',
    note: `Локальная модель на ${estimator.samples} матчах профиля, корреляция ${estimator.fitCorr.toFixed(2)}.`,
  }
}
