// Одна и та же оценка в списке матчей и на странице матча: наша модель,
// если она не посчитала — IMP источника, иначе предсказание модели-фолбэка.

import { IMPACT_MODEL_READY, impactModelInfo, personalImpact, type ImpactInput } from './impact'
import { globalModelInfo, predictImpGlobal, type ImpEstimator } from './performance'
import type { PlayerMatch } from './types'

export type ImpactScore = {
  value: number
  /** model — наша модель, imp — оценка источника, estimate — предсказание фолбэка */
  source: 'model' | 'imp' | 'estimate'
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
  const model = IMPACT_MODEL_READY ? personalImpact({ ...row, position: 0 }, durationSec, seasonRank) : null
  if (model !== null) {
    const info = impactModelInfo()
    return {
      value: model,
      source: 'model',
      note: `Насколько статы выше типичных для этой позиции и уровня.${info ? ` Модель: ${info.matches.toLocaleString('ru-RU')} матчей, AUC ${info.auc.toFixed(2)}.` : ''}`,
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
        ? `Предсказание модели-фолбэка: обучена на ${info.samples.toLocaleString('ru-RU')} матчах, MAE ±${info.mae}. Для этого игрока точная оценка не посчитана.`
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
