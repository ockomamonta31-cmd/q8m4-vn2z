// Shared model; the match page additionally supplies observed team totals
// and event statistics when available. Histories use estimated team shares.

import { IMPACT_MODEL_READY, impactModelInfo, personalImpact, type ImpactInput } from './impact'
import { globalModelInfo, predictImpGlobal, type ImpEstimator } from './performance'
import type { PlayerMatch } from './types'

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
  const plays = row.mapPlays
  if (plays?.version === 1 && plays.score === null) return null
  if (plays?.version === 1 && plays.score !== null) return {
    value: plays.score,
    source: 'replay',
    note: `Баланс подтверждённых эпизодов: ${plays.good} положительных разменов и объектов, ${plays.bad} отрицательных. Маршруты из реплея каждые ${plays.sampleSeconds} с. Это индекс результатов эпизодов, не обученная оценка правильности решений.`,
  }
  const model = IMPACT_MODEL_READY ? personalImpact(row, durationSec, seasonRank) : null
  if (model !== null) {
    const info = impactModelInfo()
    return {
      value: model,
      source: 'model',
      note: `Сравнение статистики с нормой героя и роли для похожей длительности.${row.seasonRank > 0 || (seasonRank ?? 0) > 0 ? ' Ранг учтён.' : ' Ранг неизвестен: общая норма роли.'}${row.teamKills === undefined ? ' Участие в боях рассчитано с оценкой убийств команды.' : ''}${info ? ` Обучение: ${info.matches.toLocaleString('ru-RU')} матчей.` : ''}`,
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
        ? `Предсказание модели-фолбэка: обучена на ${info.matches.toLocaleString('ru-RU')} матчах (${info.samples.toLocaleString('ru-RU')} игроков), MAE ±${info.mae}. Для этого игрока точная оценка не посчитана.`
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
