// Иконки ролей — оригинальные глифы STRATZ, скачанные с их страницы матча
// и лежащие локально в public/assets/roles/. Никакой подложки, рамки, щита
// и фона: показываем иконку как есть, размер задаёт вызывающий код.

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
}

const LANE_FILE: Record<string, string> = {
  safelane: '/assets/roles/lane-safe.svg',
  mid: '/assets/roles/lane-mid.svg',
  offlane: '/assets/roles/lane-off.svg',
}

export function roleIconUrl(position: number): string {
  return `/assets/roles/role-${position}.svg`
}

/** Нет источника — нет и иконки: роль, угаданная из пустого поля,
    хуже пустого поля. */
export default function RoleIcon({ position, source, lane, size = 40 }: {
  position: number
  source?: 'replay' | 'stats' | 'stratz'
  lane?: string
  size?: number
}) {
  if (!source || position < 1 || position > 5) return null

  const measured = source !== 'stats'
  const provenance =
    source === 'replay' ? 'определена по движению на карте'
    : source === 'stratz' ? 'определена по разбору реплея (STRATZ)'
    : 'оценка по экономике матча, может ошибаться'
  const label = `${ROLE_LABEL[position]} · ${provenance}`

  return (
    <span className={`roleicon${source === 'stats' ? ' est' : ''}`} style={{ width: size, height: size }}>
      <img className="roleicon-g" src={roleIconUrl(position)} width={size} height={size} alt={label} title={label} />
      {measured && lane && LANE_FILE[lane] && (
        <img className="roleicon-lane" src={LANE_FILE[lane]} width={16} height={16} alt={LANE_LABEL[lane]} title={LANE_LABEL[lane]} />
      )}
    </span>
  )
}
