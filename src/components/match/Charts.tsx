// Графики матча на чистом SVG: без тяжёлых библиотек, чтобы первый рендер
// оставался мгновенным, а кривая advantage анимировалась через pathLength.

import { useMemo, useState } from 'react'
import type { MatchTimeline } from '../../api/timeline'
import type { MatchBoard } from '../../pages/match-model'
import { fmtK, playerLabel } from '../../pages/match-model'
import { fmtDuration } from '../../api/formats'
import { heroImageUrl } from '../../api/heroes'
import type { HeroInfo, MatchPlayer } from '../../api/types'
import { useReducedMotion } from '../primitives'

const W = 920
const H = 300
const PAD = { t: 14, r: 14, b: 26, l: 52 }

/** Гладкая кривая через Catmull-Rom с转化为 кубическими Безье. */
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
  const reduced = useReducedMotion()

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
    const base = zeroY
    const step = durationSeconds > 2400 ? 600 : durationSeconds > 1200 ? 300 : 120
    const ticks: { x: number; label: string }[] = []
    for (let t = 0; t <= durationSeconds; t += step) ticks.push({ x: x(t), label: `${Math.round(t / 60)}` })
    return {
      points: pts,
      max: max2,
      zeroY: base,
      areaAbove: `${line} L ${pts[pts.length - 1].x} ${base} L ${pts[0].x} ${base} Z`,
      areaBelow: `${line} L ${pts[pts.length - 1].x} ${base} L ${pts[0].x} ${base} Z`,
      line,
      ticks,
    }
  }, [timeline, durationSeconds, metric])

  const active = hover != null ? points[hover] : null

  return (
    <section className="chart-card panel">
      <div className="chart-head">
        <div>
          <div className="chart-title">Кто был впереди по ходу матча</div>
          <div className="chart-sub">Плюс — Radiant впереди, минус — Dire. Данные сняты с реплея по минутам.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
          <div className="chart-legend">
            <span className="legend-item"><i style={{ background: 'var(--radiant)' }} />Radiant</span>
            <span className="legend-item"><i style={{ background: 'var(--dire)' }} />Dire</span>
          </div>
          <div className="tabs" role="group" aria-label="Метрика графика" style={{ margin: 0, padding: 2 }}>
            {(['gold', 'xp'] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`tab${metric === key ? ' active' : ''}`}
                style={{ padding: '5px 12px' }}
                aria-pressed={metric === key}
                onClick={() => setMetric(key)}
              >
                {key === 'gold' ? 'Золото' : 'Опыт'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-scroll">
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
        <svg className="svg-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`График преимущества по ${metric === 'gold' ? 'золоту' : 'опыту'}`}>
          <defs>
            <linearGradient id="gradR" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--radiant)" stopOpacity=".38" />
              <stop offset="100%" stopColor="var(--radiant)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gradD" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="var(--dire)" stopOpacity=".38" />
              <stop offset="100%" stopColor="var(--dire)" stopOpacity="0" />
            </linearGradient>
            <clipPath id="clipAbove"><rect x="0" y="0" width={W} height={zeroY} /></clipPath>
            <clipPath id="clipBelow"><rect x="0" y={zeroY} width={W} height={H - zeroY} /></clipPath>
          </defs>

          {[-1, -0.5, 0.5, 1].map((k) => (
            <line key={k} className="grid-line" x1={PAD.l} x2={W - PAD.r} y1={zeroY - k * (zeroY - PAD.t)} y2={zeroY - k * (zeroY - PAD.t)} />
          ))}

          <path className={`area-r fade-in${reduced ? '' : ''}`} d={areaAbove} clipPath="url(#clipAbove)" />
          <path className="area-d fade-in" d={areaBelow} clipPath="url(#clipBelow)" />
          <path
            className={`line-r${reduced ? '' : ' draw'}`}
            d={line}
            pathLength={1}
            style={{ strokeDasharray: 1, strokeDashoffset: reduced ? 0 : 1, animation: reduced ? undefined : 'draw 1000ms var(--ease-out) forwards' }}
          />

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
    { label: 'Нетворт', r: board.radiant.networth, d: board.dire.networth, fmt: fmtK },
    { label: 'LH', r: board.radiant.lastHits, d: board.dire.lastHits, fmt: (n: number) => String(n) },
    { label: 'Урон героям', r: board.radiant.heroDamage, d: board.dire.heroDamage, fmt: fmtK },
    { label: 'Башням', r: board.radiant.towerDamage, d: board.dire.towerDamage, fmt: fmtK },
    { label: 'Лечение', r: board.radiant.heroHealing, d: board.dire.heroHealing, fmt: fmtK },
    { label: 'Опыт/мин', r: board.radiant.experience, d: board.dire.experience, fmt: (n: number) => String(Math.round(n)) },
  ]

  return (
    <section className="chart-card panel">
      <div className="chart-head">
        <div>
          <div className="chart-title">Команды лицом к лицу</div>
          <div className="chart-sub">Сумма пяти игроков. Полоса занимает долю стороны в общем значении.</div>
        </div>
      </div>
      <div className="compare">
        {rows.map((row) => {
          const total = row.r + row.d
          const rp = total > 0 ? (row.r / total) * 100 : 50
          return (
            <div className="compare-row" key={row.label}>
              <span className="compare-val r">{row.fmt(row.r)}</span>
              <span className="compare-bar to-left" role="img" aria-label={`${row.label}: Radiant ${row.r}, Dire ${row.d}`}>
                <i style={{ width: `${rp}%` }} />
              </span>
              <span className="compare-mid">{row.label}</span>
              <span className="compare-bar to-right"><i style={{ width: `${100 - rp}%` }} /></span>
              <span className="compare-val d">{row.fmt(row.d)}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Горизонтальные бары по игрокам: категория → величина, цвет = сторона. */
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
    <section className="chart-card panel">
      <div className="chart-head">
        <div>
          <div className="chart-title">{title}</div>
          <div className="chart-sub">{sub}</div>
        </div>
      </div>
      <div className="bars">
        {sorted.map((p) => {
          const hero = heroMap.get(p.heroId)
          const value = pick(p)
          return (
            <div className="bar-row" key={`${p.steamAccountId}:${p.heroId}`}>
              <span className="hero-portrait" title={hero?.name}>
                {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" width={34} height={23} />}
              </span>
              <span className="bar-main">
                <span className="bar-top">
                  <span className="bar-who">{playerLabel(p, hero?.name)} {p.name && <span>{hero?.name}</span>}</span>
                  <span className="bar-num">{format(value)}</span>
                </span>
                <span className={`bar-track ${p.isRadiant ? 'r' : 'd'}`} role="img" aria-label={`${p.name ?? 'Игрок'}: ${format(value)} из ${format(max)}`}>
                  <i style={{ width: `${(value / max) * 100}%` }} />
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
