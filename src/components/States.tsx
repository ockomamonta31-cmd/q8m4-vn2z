/** Загрузка показана на месте будущего контента, чтобы вёрстка не прыгала:
    скелетон повторяет геометрию экрана, а не абстрактные полоски.
    Пустые и ошибочные состояния говорят, что случилось и что делать дальше. */

export function PageSkeleton({
  rows = 6,
  band = true,
  variant = 'match',
}: {
  rows?: number
  band?: boolean
  /** 'profile' — шапка + сводка + список матчей, 'match' — табло матча */
  variant?: 'match' | 'profile'
}) {
  return (
    <div className="sk-page" role="status" aria-live="polite">
      <span className="sr-only">Загружаем данные</span>

      {band && variant === 'profile' && (
        <div className="sk-id">
          <div className="skeleton sk-avatar" />
          <div className="sk-lines">
            <div className="skeleton sk-line" style={{ width: '46%', height: 26 }} />
            <div className="skeleton sk-line" style={{ width: '32%' }} />
          </div>
          <div className="skeleton sk-box" />
        </div>
      )}
      {band && variant === 'profile' && <div className="skeleton sk-tabs" />}
      {band && variant === 'match' && <div className="skeleton sk-band" />}

      {band && variant === 'profile' && (
        <div className="sk-verdict">
          <div className="sk-vd-main">
            <div className="skeleton sk-line" style={{ width: '52%' }} />
            <div className="skeleton sk-line" style={{ width: '68%', height: 44 }} />
            <div className="skeleton sk-line" style={{ height: 8 }} />
          </div>
          <div className="sk-vd-rail">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton sk-line" />
            ))}
          </div>
        </div>
      )}

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

function NoticeBody({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <span className="notice-mark" aria-hidden="true" />
      <div className="notice-body">
        <strong className="notice-title">{title}</strong>
        <div className="notice-text">{children}</div>
      </div>
    </>
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
      <NoticeBody title={title}>{children}</NoticeBody>
    </div>
  )
}

/** Пустое место — это приглашение действовать, а не отказ. */
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="notice notice-empty" role="status">
      <NoticeBody title={title}>{children}</NoticeBody>
    </div>
  )
}
