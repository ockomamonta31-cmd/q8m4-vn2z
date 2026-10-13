// Объёмные иконки ролей. Один спрайт <defs> на приложение + пять глифов.
//
// Иконка собирается из четырёх слоёв: тёмная щитовая база с металлической
// окантовкой 1.5 и внутренним скосом, глиф с градиентом «светлее сверху —
// темнее снизу», блик в верхней трети и мягкая тень под всей иконкой.
// Цвет глифа — цвет РОЛИ, а не команды: командная принадлежность живёт
// в полоске строки и рамке портрета.

const SHIELD = 'M20 2.2 34 8v13.6c0 7.9-5.6 13.4-14 16.2C11.6 35 6 29.5 6 21.6V8z'

/** Один экземпляр в корне приложения: градиенты и маска общие для всех иконок. */
export function RoleIconDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <defs>
        <linearGradient id="rg-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b3d4a" />
          <stop offset="1" stopColor="#0d151b" />
        </linearGradient>
        <linearGradient id="rg-rim" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#c9c2ad" />
          <stop offset="0.45" stopColor="#6f7f8c" />
          <stop offset="1" stopColor="#2a363f" />
        </linearGradient>
        <linearGradient id="rg-bevel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".22" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity=".45" />
        </linearGradient>
        <linearGradient id="rg-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".30" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <linearGradient key={n} id={`rg-glyph-${n}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={`var(--role-${n}-lt)`} />
            <stop offset="1" stopColor={`var(--role-${n}-dk)`} />
          </linearGradient>
        ))}
        <clipPath id="rg-clip">
          <path d={SHIELD} />
        </clipPath>
      </defs>
    </svg>
  )
}

const SWORD = (
  <>
    <path d="M20 6.2 23.4 12.6V23h-6.8V12.6z" />
    <path d="M12.2 23h15.6v3.2H12.2z" />
    <path d="M18.2 26.2h3.6v4.9h-3.6z" />
    <circle cx="20" cy="32.8" r="1.9" />
  </>
)

const BOW = (
  <>
    <path d="M13.4 6.4c11.4 5.6 11.4 21.6 0 27.2" fill="none" strokeWidth="2.6" />
    <path d="M13.4 7.4V32.6" fill="none" strokeWidth="1.1" strokeOpacity=".55" />
    <path d="M8.6 20h18.8" fill="none" strokeWidth="2.2" />
    <path d="M31 20l-6-3.3v6.6z" />
    <path d="M8.6 20l5-3.1M8.6 20l5 3.1" fill="none" strokeWidth="2.1" />
  </>
)

const SHIELD_BOLT = (
  <>
    <path d="M20 7.2 29 10.7v8.7c0 5.8-3.8 9.7-9 12-5.2-2.3-9-6.2-9-12v-8.7z" fill="none" strokeWidth="2.4" />
    <path d="M22 11 15 21.3h4.3L18.1 29l7.3-10.6h-4.5z" />
  </>
)

/** Ладонь: четыре пальца-капсулы, большая ладонь и отставленный большой палец.
    Заполненный силуэт читается на 40px там, где штриховая «кисть» рассыпается. */
const HAND = (
  <>
    <rect x="14.2" y="18.6" width="2.4" height="10" rx="1.2" />
    <rect x="17.6" y="16.2" width="2.4" height="12.4" rx="1.2" />
    <rect x="21" y="16.6" width="2.4" height="12" rx="1.2" />
    <rect x="24.4" y="19" width="2.4" height="9.6" rx="1.2" />
    <rect x="13.4" y="24.6" width="14" height="9.6" rx="3.4" />
    <rect x="9.2" y="21.4" width="2.4" height="7.4" rx="1.2" transform="rotate(-32 10.4 25.1)" />
  </>
)

const FLAME = 'M20 4.6c3 4.2 5.9 6.5 5.9 10.3 0 3.4-2.6 5.8-5.9 5.8s-5.9-2.4-5.9-5.8c0-1.7.7-3.1 1.7-4.3.2 1.5 1 2.5 2.1 2.8-.5-3.3.5-6.5 2.1-8.8z'
const spark = (x: number, y: number, r: number) =>
  `M${x} ${y - r}c.6 2.2 1 2.6 3.2 3.2-2.2.6-2.6 1-3.2 3.2-.6-2.2-1-2.6-3.2-3.2 2.2-.6 2.6-1 3.2-3.2z`

const GLYPHS: Record<number, React.ReactNode> = {
  1: SWORD,
  2: BOW,
  3: SHIELD_BOLT,
  4: (
    <>
      <path d={FLAME} />
      {HAND}
    </>
  ),
  5: (
    <>
      <path d={spark(20, 7.4, 3.1)} />
      <path d={spark(12.6, 13.2, 2.1)} />
      <path d={spark(27.4, 13.2, 2.1)} />
      {HAND}
    </>
  ),
}

export const ROLE_LABEL: Record<number, string> = {
  1: 'Керри, лёгкая линия',
  2: 'Мид',
  3: 'Оффлейн, сложная линия',
  4: 'Саппорт 4',
  5: 'Саппорт 5',
}

export const LANE_LABEL: Record<string, string> = {
  safelane: 'лёгкая линия',
  mid: 'центральная линия',
  offlane: 'сложная линия',
  jungle: 'джунгли',
  roaming: 'роуминг',
}

/** Значок линии — 16px бейдж. На таком размере схема карты не читается,
    поэтому показан только сам ход линии: угол, диагональ или зеркальный угол. */
export function LaneBadge({ lane, radiant, size = 16 }: { lane: string; radiant: boolean; size?: number }) {
  const PATH: Record<string, string> = {
    safelane: 'M6 18H18V6',
    offlane: 'M6 18V6H18',
    mid: 'M6 18 18 6',
    jungle: 'M12 18.5V12M12 12 6.5 6.5M12 12 17.5 6.5',
    roaming: 'M6 18 18 6M18 18 6 6',
  }
  const d = PATH[lane] ?? PATH.mid
  return (
    <svg className="lane-badge" viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={LANE_LABEL[lane] ?? lane} focusable="false">
      <title>{LANE_LABEL[lane] ?? lane}</title>
      <rect x="1" y="1" width="22" height="22" rx="5" fill="var(--bg-deep)" stroke="var(--line)" strokeWidth="2" />
      <path d={d} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2" stroke={radiant ? 'var(--radiant)' : 'var(--dire)'} />
    </svg>
  )
}

/** Нет позиции — нет и иконки: угаданная роль хуже пустого места. */
export default function RoleIcon({ position, source, lane, radiant, size = 40 }: {
  position: number
  source?: 'replay' | 'stats'
  lane?: string
  radiant?: boolean
  size?: number
}) {
  if (!source || position < 1 || position > 5) return null

  const provenance = source === 'replay' ? 'определена по движению на карте' : 'оценка по экономике матча, может ошибаться'
  const glyph = GLYPHS[position]

  return (
    <span className={`role${source === 'stats' ? ' est' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" width={size} height={size} role="img" aria-label={`${ROLE_LABEL[position]} · ${provenance}`} focusable="false">
        <title>{`${ROLE_LABEL[position]} · ${provenance}`}</title>
        <path d={SHIELD} fill="url(#rg-base)" />
        <g clipPath="url(#rg-clip)">
          <ellipse cx="20" cy="9" rx="15" ry="9" fill="url(#rg-gloss)" />
        </g>
        <g
          fill={`url(#rg-glyph-${position})`}
          stroke={`url(#rg-glyph-${position})`}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {glyph}
        </g>
        <path d={SHIELD} fill="none" stroke="url(#rg-bevel)" strokeWidth="3" clipPath="url(#rg-clip)" />
        <path d={SHIELD} fill="none" stroke="url(#rg-rim)" strokeWidth="1.5" />
      </svg>
      {source === 'replay' && lane && <LaneBadge lane={lane} radiant={Boolean(radiant)} size={Math.round(size * 0.4)} />}
    </span>
  )
}
