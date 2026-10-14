// Фазы матча из разобранного реплея: «Начало · 0–10 мин» — это и есть линия,
// «Середина · 10–25» и «Конец · 25+» — остальная игра. Считается по минутным
// массивам реплея (lh_t, xp_t, gold_t, networth_t, hero_damage_t,
// tower_damage_t) и по журналам убийств/смертей.
//
// Общая функция: её зовёт и свой API (server/index.mjs), и бэктест оценки
// (scripts/backtest-draft.run.ts), чтобы «чем закончилась линия» в обоих
// местах считалось одинаково.

const PHASES = [[0, 600, 'Начало · 0–10 мин'], [600, 1500, 'Середина · 10–25 мин'], [1500, Infinity, 'Конец · 25+ мин']]

export function impactPhases(parsed, durationSeconds) {
  if (!parsed) return undefined
  const at = (series, seconds) => {
    let i = 0
    while (i + 1 < (parsed.times?.length ?? 0) && parsed.times[i + 1] <= seconds) i++
    return Number(series?.[i]) || 0
  }
  const count = (events, from, to) => (events ?? []).filter((e) => Number(e.time) >= from && Number(e.time) < to).length
  return PHASES.filter(([from]) => from < durationSeconds).map(([from, rawTo, label]) => {
    const to = Math.min(rawTo, durationSeconds)
    return {
      label,
      endSeconds: Math.min(to, Number(parsed.times?.at(-1)) || 0),
      kills: count(parsed.kills_log, from, to),
      deaths: count(parsed.deaths_log, from, to),
      gold: Math.max(0, at(parsed.gold_t, to) - at(parsed.gold_t, from)),
      networth: Math.max(0, at(parsed.networth_t, to) - at(parsed.networth_t, from)),
      lastHits: Math.max(0, at(parsed.lh_t, to) - at(parsed.lh_t, from)),
      experience: Math.max(0, at(parsed.xp_t, to) - at(parsed.xp_t, from)),
      heroDamage: Math.max(0, at(parsed.hero_damage_t, to) - at(parsed.hero_damage_t, from)),
      towerDamage: Math.max(0, at(parsed.tower_damage_t, to) - at(parsed.tower_damage_t, from)),
    }
  })
}
