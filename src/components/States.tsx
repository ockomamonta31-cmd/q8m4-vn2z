/** Загрузка показана на месте будущего контента, чтобы вёрстка не прыгала. */

export function PageSkeleton({ rows = 6, band = true }: { rows?: number; band?: boolean }) {
  return (
    <div className="sk-page" role="status" aria-live="polite">
      <span className="sr-only">Загружаем данные</span>
      {band && <div className="skeleton sk-band" />}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton sk-row" />
      ))}
    </div>
  )
}

export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="sk-cols" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: cols }, (_, i) => (
        <div key={i} className="skeleton sk-line" />
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
    <div className={`notice${kind === 'error' ? ' notice-error' : ''}`} role={kind === 'error' ? 'alert' : 'status'}>
      <strong className="notice-title">{title}</strong>
      <div>{children}</div>
    </div>
  )
}
