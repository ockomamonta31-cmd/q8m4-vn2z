import type { ImpactScore } from '../api/score'
import { signed } from '../api/score'

/** Импакт читают по знаку: плюс зелёный, минус красный, полоска от нуля. */
export function ScoreBadge({ score }: { score: ImpactScore | null }) {
  if (!score) return <span className="dim" title="Оценка недоступна для этой строки">—</span>
  return (
    <span className={`imp-v ${score.value >= 0 ? 'pos' : 'neg'}`} title={score.note}>
      {signed(score.value)}
    </span>
  )
}

export function ImpactMeter({ score, max = 100 }: { score: ImpactScore | null; max?: number }) {
  if (!score) return <span className="dim">—</span>
  const positive = score.value >= 0
  const width = Math.min(50, (Math.abs(score.value) / max) * 50)
  return (
    <span className="imp">
      <span className={`imp-v ${positive ? 'pos' : 'neg'}`} title={score.note}>{signed(score.value)}</span>
      <span className="imp-t" role="img" aria-label={`Импакт ${signed(score.value)} из ${max}`}>
        <i className={positive ? 'pos' : 'neg'} style={{ width: `${width}%` }} />
      </span>
    </span>
  )
}
