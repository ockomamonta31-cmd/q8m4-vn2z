// Линия — схемой миникарты, а не словом.
//
// Квадрат карты, река по одной диагонали, три линии. Подсвечена та, на которой
// игрок реально стоял по данным реплея. Лёгкая линия для Radiant идёт понизу и
// вправо, для Dire — сверху и влево: стороны зеркалируются, потому что база
// Radiant в левом нижнем углу карты.
//
// jungle и roaming здесь нет намеренно: их не удаётся вывести из lane_pos без
// догадки, а придуманная линия хуже пустого места.

export type Lane = 'safelane' | 'mid' | 'offlane'

const LANE_RU: Record<Lane, string> = {
  safelane: 'лёгкая линия',
  mid: 'центральная линия',
  offlane: 'тяжёлая линия',
}

// Пути заданы для Radiant; для Dire лёгкая и тяжёлая меняются местами.
const PATH = {
  safe: 'M3 21 H21 V3',
  off: 'M3 21 V3 H21',
  mid: 'M3 21 L21 3',
}

export default function LaneMap({ lane, radiant, size = 22 }: {
  lane: Lane
  radiant: boolean
  size?: number
}) {
  const active = lane === 'mid' ? PATH.mid : lane === 'safelane'
    ? (radiant ? PATH.safe : PATH.off)
    : (radiant ? PATH.off : PATH.safe)

  const all = [PATH.safe, PATH.off, PATH.mid]

  return (
    <svg
      className="lane-map"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={`${LANE_RU[lane]}${radiant ? ', Radiant' : ', Dire'}`}
      focusable="false"
    >
      <title>{`${LANE_RU[lane]}${radiant ? ', Radiant' : ', Dire'}`}</title>
      <rect className="lane-map-field" x="1" y="1" width="22" height="22" rx="2" />
      <path className="lane-map-river" d="M2 2 L22 22" />
      {all.map((d) => (
        <path key={d} className={`lane-map-line${d === active ? ' on' : ''}`} d={d} />
      ))}
      <circle className={`lane-map-base${radiant ? ' r' : ' d'}`} cx={radiant ? 3 : 21} cy={radiant ? 21 : 3} r="1.8" />
    </svg>
  )
}
