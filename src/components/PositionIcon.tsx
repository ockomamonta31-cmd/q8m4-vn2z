// Позиции 1–5 своим набором глифов, inline SVG.
//
// Три причины, почему именно так:
// 1. Различаются СИЛУЭТОМ, а не цветом. Прежние position-4.svg и position-5.svg
//    были одним силуэтом с красным/зелёным флагом — для дальтоника это одна
//    картинка, а Radiant/Dire и так красный с зелёным.
// 2. currentColor + один вес штриха на всей сетке 24×24: глиф красится в цвет
//    лагеря и в активном состоянии остаётся тем же глифом, только плотнее.
// 3. Метафоры из Доты, а не цифры в кружочке: клинок — керри, диагональ с
//    двумя точками — соло-мид, щит — оффлейн, варк с открытым/закрытым
//    кольцом и одним/двумя шевронами — мягкий и жёсткий саппорт.

const GRID = 24

/** Один вес линии на всём наборе — 1.8 в сетке 24. */
const STROKE = 1.8

function Sword() {
  return (
    <>
      <path d="M12 2.6v12.2" />
      <path d="M9.4 5.6 12 3l2.6 2.6" />
      <path d="M7.2 14.8h9.6" />
      <path d="M12 14.8v4.4" />
      <path d="M10.2 19.6h3.6" />
    </>
  )
}

function MidDiagonal() {
  return (
    <>
      <path d="M5.4 18.6 18.6 5.4" />
      <circle cx="5.4" cy="18.6" r="2.1" />
      <circle cx="18.6" cy="5.4" r="2.1" />
    </>
  )
}

function Shield() {
  return (
    <>
      <path d="M12 2.8 19.4 6v5.2c0 4.4-3 7.7-7.4 9.9-4.4-2.2-7.4-5.5-7.4-9.9V6Z" />
      <path d="M12 8.4v7.4" />
    </>
  )
}

/** Варк: столб с лампой. Кольцо вокруг лампы и число шевронов — единственное
    отличие 4-й от 5-й, и оно читается и без цвета. */
function Ward({ closed, chevrons }: { closed: boolean; chevrons: number }) {
  return (
    <>
      <path d="M12 12.6v5" />
      <path d="M9.6 17.6h4.8" />
      {closed
        ? <circle cx="12" cy="8.2" r="4.4" />
        : <path d="M15.2 6.1a4.4 4.4 0 1 0-5.9 5.4" />}
      <path d="M10.4 7.2h3.2v2h-3.2z" fill="currentColor" stroke="none" opacity={closed ? 1 : .35} />
      {chevrons >= 1 && <path d="M9.8 21.4 12 23" />}
      {chevrons >= 2 && <path d="M14.2 21.4 12 23" />}
    </>
  )
}

export const POSITION_LABEL: Record<number, { ru: string; short: string }> = {
  1: { ru: 'Первая позиция — керри, лёгкая линия', short: 'керри' },
  2: { ru: 'Вторая позиция — мидер, центр', short: 'мидер' },
  3: { ru: 'Третья позиция — оффлейнер, тяжёлая линия', short: 'оффлейн' },
  4: { ru: 'Четвёртая позиция — мягкий саппорт', short: 'мягкий саппорт' },
  5: { ru: 'Пятая позиция — жёсткий саппорт', short: 'жёсткий саппорт' },
}

export default function PositionIcon({
  position,
  source,
  size = 16,
}: {
  position: number
  source?: 'replay' | 'stats'
  size?: number
}) {
  // Нет источника — нет и глифа: позиция, выдуманная из пустого поля,
  // хуже пустого поля.
  if (!source || position < 1 || position > 5) return null

  const glyph =
    position === 1 ? <Sword />
      : position === 2 ? <MidDiagonal />
        : position === 3 ? <Shield />
          : position === 4 ? <Ward closed={false} chevrons={1} />
            : <Ward closed chevrons={2} />

  const provenance = source === 'replay' ? 'определена по движению на карте' : 'оценка по экономике матча, может ошибаться'

  return (
    <svg
      className={`role-g role-${position}${source === "stats" ? " est" : ""}`}
      viewBox={`0 0 ${GRID} ${GRID}`}
      width={size}
      height={size}
      role="img"
      aria-label={POSITION_LABEL[position].ru}
      focusable="false"
    >
      <title>{`${POSITION_LABEL[position].ru} · ${provenance}`}</title>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyph}
      </g>
    </svg>
  )
}
