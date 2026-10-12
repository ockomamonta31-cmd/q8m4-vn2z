import { useMemo } from 'react'
import type { PlayerMatch } from '../api/types'

const DAY_LABELS = ['Пн', '', 'Ср', '', 'Пт', '', 'Вс']

/** Тепловая карта: матчи по дням за последние 26 недель (в духе GitHub-contribution). */
export default function ActivityHeatmap({ matches }: { matches: PlayerMatch[] }) {
  const { cells, total, activeDays, bestDay } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of matches) {
      const key = new Date(m.startDateTime * 1000).toISOString().slice(0, 10)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    // сетка: недели по колонкам, понедельник — начало строки
    const today = new Date()
    const end = new Date(today)
    const endDow = (end.getDay() + 6) % 7
    const start = new Date(end)
    start.setDate(end.getDate() - endDow - 25 * 7)

    const cells: { key: string; count: number }[] = []
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10)
      cells.push({ key, count: counts.get(key) ?? 0 })
    }
    let best = { key: '', count: 0 }
    for (const [key, count] of counts) {
      if (count > best.count) best = { key, count }
    }
    return {
      cells,
      total: [...counts.values()].reduce((a, b) => a + b, 0),
      activeDays: counts.size,
      bestDay: best.count ? best : null,
    }
  }, [matches])

  function level(count: number): string {
    if (count === 0) return ''
    if (count <= 1) return 'heat-1'
    if (count <= 3) return 'heat-2'
    if (count <= 6) return 'heat-3'
    return 'heat-4'
  }

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-tile">
          <div className="tile-label">Матчей в истории</div>
          <div className="tile-value">{total}</div>
          <div className="tile-sub">с учётом загруженных страниц</div>
        </div>
        <div className="stat-tile">
          <div className="tile-label">Активных дней</div>
          <div className="tile-value">{activeDays}</div>
          <div className="tile-sub">за последние 26 недель</div>
        </div>
        <div className="stat-tile">
          <div className="tile-label">Самый плотный день</div>
          <div className="tile-value">{bestDay ? bestDay.count : 0}</div>
          <div className="tile-sub">{bestDay ? new Date(bestDay.key).toLocaleDateString('ru-RU') : 'нет данных'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'repeat(7, 13px)',
            gap: 3,
            fontSize: 10,
            color: 'var(--muted)',
            lineHeight: '13px',
          }}
        >
          {DAY_LABELS.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
        <div className="heatmap">
          {cells.map((c) => (
            <span
              key={c.key}
              className={`heat-cell ${level(c.count)}`}
              title={`${new Date(c.key).toLocaleDateString('ru-RU')}: ${c.count} матч(ей)`}
            />
          ))}
        </div>
      </div>
      <div className="heat-legend">
        меньше
        <span className="heat-cell" />
        <span className="heat-cell heat-1" />
        <span className="heat-cell heat-2" />
        <span className="heat-cell heat-3" />
        <span className="heat-cell heat-4" />
        больше
      </div>
    </div>
  )
}
