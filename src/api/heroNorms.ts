import norms from '../../server/data/constants/hero_norms.json'
import type { MatchPlayer } from './types'

// How strong players perform on one hero, from our own pool of parsed Ancient+
// games. Final match numbers only: the dataset has no per-minute series, so
// this is a pace reference, not a lane review.
export interface HeroNorm {
  n: number
  scope: 'position' | 'hero'
  metrics: Record<string, number[]>
}

const roundTo = (value: number, digits: number) => Number(value.toFixed(digits))

// Ranked at the precision the report shows, so "2.0 против медианы 2.0" cannot
// come out as "выше медианы" from a floating point remainder.
const rankOf = (percentiles: number[], value: number, digits: number) => {
  const p = percentiles.map(x => roundTo(x, digits)), v = roundTo(value, digits)
  if (v < p[0]) return 0
  if (v < p[1]) return 1
  if (v < p[2]) return 2
  if (v < p[3]) return 3
  if (v < p[4]) return 4
  return 5
}
export const standingRank = (percentiles: number[], value: number, digits = 0) => rankOf(percentiles, value, digits)
export const standing = (percentiles: number[], value: number, digits = 0) => {
  const p = percentiles.map(x => roundTo(x, digits)), v = roundTo(value, digits)
  if (v === p[2]) return 'ровно на медиане'
  return ['ниже 10-го перцентиля', 'между 10-м и 25-м перцентилем', 'ниже медианы', 'выше медианы', 'выше 75-го перцентиля', 'выше 90-го перцентиля'][rankOf(percentiles, value, digits)]
}

export function heroNorm(heroId: number, position: number): HeroNorm | null {
  const entry = (norms.heroes as Record<string, { n: number; metrics: Record<string, number[]>; position?: Record<string, { n: number; metrics: Record<string, number[]> }> }>)[String(heroId)]
  if (!entry) return null
  const byPosition = position ? entry.position?.[String(position)] : null
  return byPosition ? { n: byPosition.n, scope: 'position', metrics: byPosition.metrics } : { n: entry.n, scope: 'hero', metrics: entry.metrics }
}

export const normsCohort = norms.cohort

const MINUTES = (p: MatchPlayer, durationSeconds: number) => (durationSeconds > 0 ? durationSeconds / 60 : 0)

/** Player value for a norm metric, or null when the replay did not measure it. */
export function measuredValue(p: MatchPlayer, metric: string, durationSeconds: number): number | null {
  const minutes = MINUTES(p, durationSeconds)
  const evidence = p.evidence
  switch (metric) {
    case 'gpm': return p.goldPerMinute ?? null
    case 'xpm': return p.experiencePerMinute ?? null
    case 'networth': return p.networth ?? null
    case 'lhPerMin': return minutes ? p.numLastHits / minutes : null
    case 'heroDmgPerMin': return minutes ? p.heroDamage / minutes : null
    case 'towerDmgPerMin': return minutes ? p.towerDamage / minutes : null
    case 'deathsPer10': return minutes ? (p.deaths / minutes) * 10 : null
    default: return null
  }
}

export const NORM_LABELS: Record<string, { name: string; lowerIsBetter?: boolean; advice: string }> = {
  gpm: { name: 'золото в минуту', advice: 'Темп фарма — единственная метрика, которую видно на графике нетворта. Если отставание по золоту идёт вместе с отставанием по добиваниям, ищи потерянные волны, а не плохие драки.' },
  xpm: { name: 'опыт в минуту', advice: 'Опыт приходит из тех же волн, что и золото, плюс из драк. Разрыв по опыту при нормальном золоте обычно означает, что ты фармил в одиночку вместо участия в убийствах рядом.' },
  networth: { name: 'нетворт к концу матча', advice: 'Итоговый нетворт собран из всего матча. Разбирай его вместе с таймингами предметов ниже: важен не размер, а когда предметы оказались в руках.' },
  lhPerMin: { name: 'добиваний в минуту', advice: 'Добивания в минуту — самый честный счётчик использования времени. Провал здесь не про механику, а про маршрут: где ты стоял между драками и волнами.' },
  heroDmgPerMin: { name: 'урона по героям в минуту', advice: 'Урон зависит от роли и длительности драк. Смотри его вместе с числом смертей: много урона без убийств — это размены без результата.' },
  towerDmgPerMin: { name: 'урона по строениям в минуту', advice: 'Урон по строениям показывает, превращались ли выигранные драки в объекты. Ноль при преимуществе команды — повод посмотреть, куда уходило время после боя.' },
  deathsPer10: { name: 'смертей за 10 минут', lowerIsBetter: true, advice: 'Смерти на 10 минут — обратный счётчик темпа: каждая потеря это золото сопернику и время вне карты. Сравни с эпизодами смертей ниже.' },
}
