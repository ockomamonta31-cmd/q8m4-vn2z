/** Загрузка — скелетон на месте будущего контента, мерцание только по opacity.
    Ошибки и пустые состояния говорят, что случилось и что делать дальше. */

export function PageSkeleton({
  rows = 6,
  band = true,
  variant = 'match',
}: {
  rows?: number
  band?: boolean
  /** 'profile' — боковая колонка + список матчей, 'match' — табло матча */
  variant?: 'match' | 'profile'
}) {
  return (
    <div className="sk-page" role="status" aria-live="polite">
      <span className="sr-only">Загружаем данные</span>

      {band && variant === 'profile' && (
        <div className="sk-cols" style={{ gridTemplateColumns: '340px minmax(0, 1fr)' }}>
          <div className="sk sk-line" style={{ height: 260 }} />
          <div style={{ display: 'grid', gap: 'var(--sp-16)' }}>
            <div className="sk sk-line" style={{ height: 48 }} />
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="sk sk-row" />)}
          </div>
        </div>
      )}

      {band && variant === 'match' && <div className="sk sk-band" style={{ height: 320 }} />}

      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk sk-row" />
      ))}
    </div>
  )
}

export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="sk-cols" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: cols }, (_, i) => (
        <div key={i} className="sk sk-line" />
      ))}
    </div>
  )
}

export function Notice({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'info' | 'error'
  title: string
  children: React.ReactNode
}) {
  return (
    <div className={`note${kind === 'error' ? ' note-err' : ''}`} role={kind === 'error' ? 'alert' : 'status'}>
      <strong className="note-t">{title}</strong>
      <div className="note-b">{children}</div>
    </div>
  )
}

/** Пустое место — это приглашение действовать, а не отказ. */
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="note" role="status">
      <strong className="note-t">{title}</strong>
      <div className="note-b">{children}</div>
    </div>
  )
}
