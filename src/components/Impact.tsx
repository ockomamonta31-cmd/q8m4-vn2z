import type { ImpactScore } from '../api/score'
import { signed } from '../api/score'
import { impactClass } from '../api/impact'
import { scoreClass } from '../api/performance'

const cls = (value: number, source: ImpactScore['source']) =>
  `${source === 'model' ? impactClass(value) : scoreClass(value)}${source === 'estimate' ? ' est' : ''}`

export function ScoreBadge({ score }: { score: ImpactScore | null }) {
  if (!score) return <span className="muted" title="Оценка недоступна для этой строки">—</span>
  return (
    <span className={`score-badge ${cls(score.value, score.source)}`} title={score.note}>
      {signed(score.value)}
    </span>
  )
}

/** Импакт как знак относительно нуля: шкала −100…+100, ноль по центру. */
export function ImpactMeter({ score, max = 100 }: { score: ImpactScore | null; max?: number }) {
  if (!score) return <span className="muted">—</span>
  const positive = score.value >= 0
  const width = Math.min(50, (Math.abs(score.value) / max) * 50)
  return (
    <span
      className={`meter${score.value === 0 ? ' flat' : positive ? ' pos' : ' neg'}`}
      title={score.note}
      role="img"
      aria-label={`Импакт ${signed(score.value)} из ${max}`}
    >
      <span className="meter-value">{signed(score.value)}</span>
      <span className="meter-track">
        <span className={`meter-fill${positive ? ' pos' : ' neg'}`} style={{ width: `${width}%` }} />
      </span>
    </span>
  )
}
