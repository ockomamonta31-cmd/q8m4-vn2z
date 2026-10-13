// Минутная ось — подпись всего мира этого продукта.
//
// Одна горизонталь на всю ширину: время матча, а не график в карточке.
// Полоса перевеса идёт отсечками там, где преимущество меняло знак, и её
// ДОЛИНА равна числу минут, которые состояние реально держалось — длина
// носит смысл, а не украшает. Узлы событий над осью у Radiant, под осью у
// Dire; узел либо заполнен, либо пуст, свечения нет нигде.
//
// Выбор минуты вытягивает её числа в фокус и гасит остальное поле до бледного
// столбчатого рисунка. Скраб — нативный input[type=range]: рабочий экран обязан
// собираться из стандартных контролов платформы, а не из костюма.

import { useMemo, useState } from 'react'
import type { MatchTimeline } from '../../api/timeline'
import { fmtDuration } from '../../api/formats'

/** Отсечки преимущества по смене знака: длина = минуты, что состояние держалось. */
function runsOf(points: { t: number; gold: number }[], minutes: number) {
  if (points.length < 2) return []
  const out: { from: number; to: number; radiant: boolean; peak: number }[] = []
  let start = 0
  let sign = points[0].gold >= 0
  let peak = Math.abs(points[0].gold)
  for (let i = 1; i < points.length; i++) {
    const s = points[i].gold >= 0
    peak = Math.max(peak, Math.abs(points[i].gold))
    if (s !== sign) {
      out.push({ from: start, to: points[i].t, radiant: sign, peak })
      start = points[i].t
      sign = s
      peak = Math.abs(points[i].gold)
    }
  }
  out.push({ from: start, to: minutes * 60, radiant: sign, peak })
  return out.filter((r) => r.to > r.from)
}

export default function PowerSpine({ timeline, durationSeconds }: {
  timeline: MatchTimeline
  durationSeconds: number
}) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60))
  const [at, setAt] = useState<number | null>(null)

  const runs = useMemo(() => runsOf(timeline.series, minutes), [timeline.series, minutes])
  const span = Math.max(1, ...timeline.series.map((p) => Math.abs(p.gold)))
  const last = Math.max(1, minutes * 60)

  // Высота отсечки — не линейная доля пика: при линейной шкале матч с долгим
  // малым перевесом и поздней каткой выглядит пустым, хотя перевес был всё
  // это время. Корень сохраняет порядок, но делает малое различимым.
  const runStyle = (r: { from: number; to: number; peak: number }) => ({
    left: `${(r.from / last) * 100}%`,
    width: `${((r.to - r.from) / last) * 100}%`,
    ['--peak' as string]: `${Math.sqrt(Math.min(1, r.peak / span)).toFixed(3)}`,
  })

  /** Тонкая линия преимущества поверх отсечек: форма поля читается сразу. */
  const line = useMemo(() => {
    const pts = timeline.series
    if (pts.length < 2) return ''
    return pts.map((p, i) => {
      const x = (p.t / last) * 100
      const y = 50 - (p.gold / span) * 42
      return `${i ? 'L' : 'M'}${x.toFixed(2)} ${Math.max(4, Math.min(96, y)).toFixed(2)}`
    }).join(' ')
  }, [timeline.series, last, span])

  const valueAt = (sec: number) => {
    const s = timeline.series
    if (!s.length) return null
    let i = 0
    while (i + 1 < s.length && s[i + 1].t <= sec) i++
    return s[i]
  }

  const focused = at == null ? null : valueAt(at * 60)
  const dimmed = at != null

  // Убийства на ось не идут: их десятки, и плотным пунктиром они съедают
  // именно то, ради чего ось — смену перевеса. Полная лента убийств живёт
  // во вкладке «Таймлайн».
  const nodes = [
    ...timeline.structures.map((e) => ({ t: e.t, radiant: e.radiant !== false, kind: e.kind, weight: e.kind === 'barracks' || e.kind === 'fort' ? 2 : 1 })),
    ...timeline.roshans.map((e) => ({ t: e.t, radiant: Boolean(e.radiant), kind: 'roshan' as const, weight: 2 })),
    ...timeline.teamfights.filter((f) => f.deaths >= 3).map((f) => ({ t: f.t, radiant: f.radiantKills >= f.direKills, kind: 'fight' as const, weight: f.deaths >= 6 ? 2 : 1 })),
  ]

  return (
    <section className={`spine${dimmed ? ' focused' : ''}`} aria-label="Ход матча по минутам">
      <header className="spine-head">
        <h2 className="spine-title">
          {dimmed && focused
            ? <>Минута {at} · перевес {focused.gold >= 0 ? 'Radiant' : 'Dire'} <b className="num">{Math.abs(Math.round(focused.gold)).toLocaleString('ru-RU')}</b> золота</>
            : 'Кто держал перевес и сколько минут'}
        </h2>
        <p className="spine-hint">
          {dimmed ? 'Наведите или стрелками влево-вправо' : 'Полоса = минуты одного и того же перевеса. Наведите на минуту.'}
        </p>
      </header>

      <div className="spine-field">
        <svg className="spine-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="spine-line-path" d={line} vectorEffect="non-scaling-stroke" />
        </svg>

        <div className="spine-runs">
          {runs.map((r, i) => (
            <span
              key={i}
              className={`run ${r.radiant ? 'r' : 'd'}`}
              style={runStyle(r)}
              title={`${Math.round((r.to - r.from) / 60)} мин перевеса: ${r.radiant ? 'Radiant' : 'Dire'}, пик ${Math.round(r.peak).toLocaleString('ru-RU')} золота`}
            />
          ))}
        </div>

        <div className="spine-nodes" aria-hidden="true">
          {nodes.map((n, i) => (
            <span
              key={i}
              className={`node n-${n.kind} ${n.radiant ? 'r' : 'd'}${n.weight === 2 ? ' big' : ''}`}
              style={{ left: `${(n.t / (minutes * 60)) * 100}%` }}
            />
          ))}
        </div>

        <div className="spine-axis" role="presentation">
          {Array.from({ length: Math.min(minutes, 40) }, (_, i) => (
            <span key={i} className="tick" style={{ left: `${(i / Math.min(minutes, 40)) * 100}%` }} />
          ))}
        </div>

        <input
          className="spine-scrub"
          type="range"
          min={0}
          max={minutes}
          step={1}
          value={at ?? 0}
          aria-label="Выбрать минуту матча"
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            const frac = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
            setAt(Math.round(frac * minutes))
          }}
          onMouseLeave={() => setAt(null)}
          onChange={(e) => setAt(e.currentTarget.valueAsNumber)}
          onFocus={() => setAt((v) => (v == null ? 0 : v))}
          onBlur={() => setAt(null)}
        />
      </div>

      <div className="spine-scale">
        <span className="num">0:00</span>
        {focused && <span className="spine-at num">{fmtDuration((at ?? 0) * 60)}</span>}
        <span className="num">{fmtDuration(durationSeconds)}</span>
      </div>
    </section>
  )
}
