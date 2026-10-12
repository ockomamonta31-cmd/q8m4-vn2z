export default function PositionIcon({
  position,
  source,
}: {
  position: number
  source?: 'replay' | 'stats'
}) {
  if (!source || position < 1 || position > 5) return null
  return (
    <img
      className={`position-icon position-icon-${position}${source === 'stats' ? ' position-icon-estimated' : ''}`}
      src={`/positions/position-${position}.svg?v=3`}
      alt={`Pos ${position}`}
      title={`Позиция ${position} · ${source === 'replay' ? 'определена по реплею' : 'оценка по экономике матча, может ошибаться'}`}
    />
  )
}
