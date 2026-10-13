import { useMemo } from 'react'
import type { PlayerMatch } from '../api/types'

const DAY_LABELS = ['Пн', '', 'Ср', '', 'Пт', '', 'Вс']
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const WEEKS = 26

/** Матчи по дням за последние 26 недель; яркость — плотность игры в этот день. */
export default function ActivityHeatmap({ matches }: { matches: PlayerMatch[] }) {
  const { cells, weeks, total, activeDays, bestDay } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of matches) {
      const key = new Date(m.startDateTime * 1000).toISOString().slice(0, 10)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    // колонка = неделя, строка = день недели; неделя начинается с понедельника
    const end = new Date()
    const endDow = (end.getDay() + 6) % 7
    const start = new Date(end)
    start.setDate(end.getDate() - endDow - (WEEKS - 1) * 7)

    const cells: { key: string; count: number }[] = []
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10)
      cells.push({ key, count: counts.get(key) ?? 0 })
    }

    const weekStarts: string[] = []
    for (let w = 0; w < WEEKS; w++) {
      const week = cells.slice(w * 7, w * 7 + 7).find((c) => c.count > 0)
      weekStarts.push(week ? MONTHS[new Date(week.key).getMonth()] : '')
    }
    for (let w = 1; w < WEEKS; w++) if (weekStarts[w] === weekStarts[w - 1]) weekStarts[w] = ''

    let best = { key: '', count: 0 }
    for (const [key, count] of counts) if (count > best.count) best = { key, count }

    return {
      cells,
      weeks: weekStarts,
      total: [...counts.values()].reduce((a, b) => a + b, 0),
      activeDays: counts.size,
      bestDay: best.count ? best : null,
    }
  }, [matches])

  const level = (count: number) => (count === 0 ? '' : count <= 1 ? 'l1' : count <= 3 ? 'l2' : count <= 6 ? 'l3' : 'l4')

  return (
    <section className="panel heat-panel">
      <div className="heat-summary">
        <div className="hs-lead">
          <span className="hs-label">Матчей в истории</span>
          <b className="hs-value">{total}</b>
          <span className="hs-note">со всех загруженных страниц</span>
        </div>
        <div className="hs-rows">
          <div className="hs-row">
            <span>Активных дней</span>
            <b>{activeDays}</b>
            <small>за {WEEKS} недель</small>
          </div>
          <div className="hs-row">
            <span>Самый плотный день</span>
            <b>{bestDay ? bestDay.count : '—'}</b>
            <small>{bestDay ? new Date(bestDay.key).toLocaleDateString('ru-RU') : 'нет игранных дней'}</small>
          </div>
        </div>
      </div>

      <div className="heat-shell">
        <div className="heat-days" aria-hidden="true">
          {DAY_LABELS.map((label, i) => <span key={i}>{label}</span>)}
        </div>
        <div className="heat-scroll">
          <div className="heat-months" aria-hidden="true">
            {weeks.map((label, i) => <span key={i}>{label}</span>)}
          </div>
          <div className="heat">
            {cells.map((c) => (
              <span
                key={c.key}
                className={`heat-cell ${level(c.count)}`}
                title={`${new Date(c.key).toLocaleDateString('ru-RU')} — матчей: ${c.count}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="heat-legend">
        <span>меньше</span>
        <span className="heat-cell" />
        <span className="heat-cell l1" />
        <span className="heat-cell l2" />
        <span className="heat-cell l3" />
        <span className="heat-cell l4" />
        <span>больше</span>
      </div>
    </section>
  )
}
