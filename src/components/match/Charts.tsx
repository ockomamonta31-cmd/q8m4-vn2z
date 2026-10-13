// Графики матча на чистом SVG: без тяжёлых библиотек, чтобы первый рендер
// оставался мгновенным.

import { useMemo, useState } from 'react'
import type { MatchTimeline } from '../../api/timeline'
import type { MatchBoard } from '../../pages/match-model'
import { fmtK, playerLabel } from '../../pages/match-model'
import { fmtDuration } from '../../api/formats'
import { heroImageUrl } from '../../api/heroes'
import type { HeroInfo, MatchPlayer } from '../../api/types'

const W = 920
const H = 320
const PAD = { t: 16, r: 16, b: 28, l: 56 }

/** Гладкая кривая через Catmull-Rom, превращённый в кубические Безье. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

export function MomentumChart({ timeline, durationSeconds }: { timeline: MatchTimeline; durationSeconds: number }) {
  const [metric, setMetric] = useState<'gold' | 'xp'>('gold')
  const [hover, setHover] = useState<number | null>(null)

  const { points, max, zeroY, areaAbove, areaBelow, line, ticks } = useMemo(() => {
    const series = timeline.series
    const values = series.map((p) => (metric === 'gold' ? p.gold : p.xp))
    const peak = Math.max(1200, ...values.map((v) => Math.abs(v)))
    const max2 = Math.ceil(peak / 1000) * 1000
    const innerW = W - PAD.l - PAD.r
    const innerH = H - PAD.t - PAD.b
    const zeroY = PAD.t + innerH / 2
    const scale = (v: number) => zeroY - (v / max2) * (innerH / 2)
    const x = (t: number) => PAD.l + (Math.min(t, durationSeconds) / Math.max(durationSeconds, 1)) * innerW
    const pts = series.map((p, i) => ({ x: x(p.t), y: scale(values[i]), t: p.t, v: values[i] }))
    const line = smoothPath(pts)
    const step = durationSeconds > 2400 ? 600 : durationSeconds > 1200 ? 300 : 120
    const ticks: { x: number; label: string }[] = []
    for (let t = 0; t <= durationSeconds; t += step) ticks.push({ x: x(t), label: `${Math.round(t / 60)}` })
    return {
      points: pts,
      max: max2,
      zeroY,
      areaAbove: `${line} L ${pts[pts.length - 1].x} ${zeroY} L ${pts[0].x} ${zeroY} Z`,
      areaBelow: `${line} L ${pts[pts.length - 1].x} ${zeroY} L ${pts[0].x} ${zeroY} Z`,
      line,
      ticks,
    }
  }, [timeline, durationSeconds, metric])

  const active = hover != null ? points[hover] : null

  return (
    <section className="chart">
      <div className="chart-h">
        <div>
          <div className="chart-t">Кто был впереди по ходу матча</div>
          <div className="chart-s">Плюс — Radiant впереди, минус — Dire. Данные сняты с реплея по минутам.</div>
        </div>
        <div className="rail" role="group" aria-label="Метрика графика" style={{ height: 40, gap: 'var(--sp-24)' }}>
          {(['gold', 'xp'] as const).map((k) => (
            <button key={k} type="button" className={`rail-i${metric === k ? ' on' : ''}`} aria-selected={metric === k} onClick={() => setMetric(k)}>
              {k === 'gold' ? 'Золото' : 'Опыт'}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-box">
        <div
          className="chart-hover"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const ratio = (e.clientX - rect.left) / rect.width
            const svgX = ratio * W
            let nearest = 0
            points.forEach((p, i) => { if (Math.abs(p.x - svgX) < Math.abs(points[nearest].x - svgX)) nearest = i })
            setHover(nearest)
          }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`График преимущества по ${metric === 'gold' ? 'золоту' : 'опыту'}`}>
            <defs>
              <clipPath id="clipAbove"><rect x="0" y="0" width={W} height={zeroY} /></clipPath>
              <clipPath id="clipBelow"><rect x="0" y={zeroY} width={W} height={H - zeroY} /></clipPath>
            </defs>

            <path className="area-r" d={areaAbove} clipPath="url(#clipAbove)" />
            <path className="area-d" d={areaBelow} clipPath="url(#clipBelow)" />
            <path className="line-r" d={line} />

            <line className="zero-line" x1={PAD.l} x2={W - PAD.r} y1={zeroY} y2={zeroY} />

            <text className="tick-text" x={PAD.l - 8} y={PAD.t + 4} textAnchor="end">+{fmtK(max)}</text>
            <text className="tick-text" x={PAD.l - 8} y={zeroY + 4} textAnchor="end">0</text>
            <text className="tick-text" x={PAD.l - 8} y={H - PAD.b + 4} textAnchor="end">−{fmtK(max)}</text>
            {ticks.map((tick) => (
              <text key={tick.x} className="tick-text" x={tick.x} y={H - PAD.b + 16} textAnchor="middle">{tick.label}′</text>
            ))}

            {active && (
              <g>
                <line className="crosshair" x1={active.x} x2={active.x} y1={PAD.t} y2={H - PAD.b} />
                <circle className="cursor-dot" cx={active.x} cy={active.y} r="4" />
              </g>
            )}
          </svg>

          {active && (
            <div
              className="chart-tip"
              style={{ left: `${(active.x / W) * 100}%`, top: `${(active.y / H) * 100}%` }}
            >
              <b>{fmtDuration(active.t)}</b> · {active.v >= 0 ? 'Radiant' : 'Dire'} {fmtK(Math.abs(active.v))} {metric === 'gold' ? 'золота' : 'опыта'}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export function CompareBars({ board }: { board: MatchBoard }) {
  const rows = [
    { label: 'Убийства', r: board.radiant.kills, d: board.dire.kills, fmt: (n: number) => String(n) },
    { label: 'Нетворс', r: board.radiant.networth, d: board.dire.networth, fmt: fmtK },
    { label: 'LH', r: board.radiant.lastHits, d: board.dire.lastHits, fmt: (n: number) => String(n) },
    { label: 'Урон героям', r: board.radiant.heroDamage, d: board.dire.heroDamage, fmt: fmtK },
    { label: 'Башням', r: board.radiant.towerDamage, d: board.dire.towerDamage, fmt: fmtK },
    { label: 'Лечение', r: board.radiant.heroHealing, d: board.dire.heroHealing, fmt: fmtK },
    { label: 'Опыт/мин', r: board.radiant.experience, d: board.dire.experience, fmt: (n: number) => String(Math.round(n)) },
  ]

  return (
    <section className="chart">
      <div className="chart-h">
        <div>
          <div className="chart-t">Команды лицом к лицу</div>
          <div className="chart-s">Сумма пяти игроков. Полоса занимает долю стороны в общем значении.</div>
        </div>
      </div>
      <div className="vs">
        {rows.map((row) => {
          const total = row.r + row.d
          const rp = total > 0 ? (row.r / total) * 100 : 50
          return (
            <div className="vs-row" key={row.label}>
              <span className="vs-lbl">{row.label}</span>
              <span className={`v r${rp >= 50 ? '' : ' sub'}`}>{row.fmt(row.r)}</span>
              <span className="vs-bar" role="img" aria-label={`${row.label}: Radiant ${row.r}, Dire ${row.d}`}>
                <i className="a" style={{ width: `${rp}%` }} />
                <i className="b" style={{ width: `${100 - rp}%` }} />
              </span>
              <span className={`v d${rp < 50 ? '' : ' sub'}`}>{row.fmt(row.d)}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Горизонтальные полосы по игрокам: категория → величина, цвет = сторона. */
export function PlayerBars({ title, sub, players, pick, heroMap, format }: {
  title: string
  sub: string
  players: MatchPlayer[]
  pick: (p: MatchPlayer) => number
  heroMap: Map<number, HeroInfo>
  format: (n: number) => string
}) {
  const max = Math.max(1, ...players.map(pick))
  const sorted = [...players].sort((a, b) => pick(b) - pick(a))
  return (
    <section className="chart">
      <div className="chart-h">
        <div>
          <div className="chart-t">{title}</div>
          <div className="chart-s">{sub}</div>
        </div>
      </div>
      <div className="hbars">
        {sorted.map((p) => {
          const hero = heroMap.get(p.heroId)
          const value = pick(p)
          return (
            <div className={`hb ${p.isRadiant ? 'r' : 'd'}`} key={`${p.steamAccountId}:${p.heroId}`}>
              <span className="port xs">
                {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
              </span>
              <span className="hb-n">{playerLabel(p, hero?.name)}</span>
              <span className="hb-t" role="img" aria-label={`${p.name ?? 'Игрок'}: ${format(value)} из ${format(max)}`}>
                <i style={{ width: `${(value / max) * 100}%` }} />
              </span>
              <span className="hb-v">{format(value)}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
