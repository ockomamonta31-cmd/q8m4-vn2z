// Общие типы данных, нормализованные СОБСТВЕННЫМ API-сервером (server/index.mjs)
// из Steam Web API. Строковые enum'ы режимов/лобби приведены к виду UI.

export interface PlayerMatch {
  id: number
  /** unix seconds */
  startDateTime: number
  durationSeconds: number
  /** строковый enum: "ALL_PICK_RANKED", "TURBO" и т.д. */
  gameMode: string
  /** строковый enum: "RANKED", "PUBLIC_MATCH" и т.д. */
  lobbyType: string
  player: {
    steamAccountId: number
    heroId: number
    kills: number
    deaths: number
    assists: number
    goldPerMinute: number
    experiencePerMinute: number
    numLastHits: number
    numDenies: number
    networth: number
    level: number
    heroDamage: number
    towerDamage: number
    heroHealing: number
    /** позиция 1–5 (0 — Steam не отдаёт позицию) */
    position: number
    /** replay — своё движение по карте; stratz — разбор реплея STRATZ; stats — оценка по экономике */
    positionSource?: 'replay' | 'stats' | 'stratz'
    /** линия известна, когда позиция взята из разобранного реплея; jungle и roaming не определяются */
    lane?: 'safelane' | 'mid' | 'offlane'
    /** сезонный ранг игрока НА МОМЕНТ матча (0 — нет данных) */
    seasonRank: number
    isVictory: boolean
    /** IMP: −100…+100. Всегда null в своём API (Steam не считает импакты) — колонка использует свою модель */
    imp: number | null
  }
}

export interface Profile {
  steamAccountId: number
  name: string
  avatar: string | null
  matchCount: number | null
  winCount: number | null
  /** последний сезонный ранг (null — Steam не отдаёт в этом API) */
  rank: number | null
  /** true — основная позиция (core), false — support */
  rankIsCore: boolean | null
}

export interface HeroStat {
  heroId: number
  matchCount: number
  winCount: number
  goldPerMinute?: number
  experiencePerMinute?: number
}

export interface Peer {
  steamAccountId: number
  name: string
  avatar: string | null
  withMatchCount: number
  withWinCount: number
  againstMatchCount: number
  againstWinCount: number
}

export interface HeroInfo {
  id: number
  shortName: string
  name: string
}

/** Полный матч: все игроки, шмотки, IMP. */
export interface MatchDetails {
  id: number
  /** true — Radiant победил */
  didRadiantWin: boolean | null
  durationSeconds: number
  startDateTime: number
  gameMode: string
  lobbyType: string
  numHumanPlayers: number | null
  /** средний ранг матча, 0 — нет данных */
  actualRank: number
  firstBloodSeconds: number | null
  radiantScore: number | null
  direScore: number | null
  /** битовые поля Valve: состояние башен/казарм на момент конца матча */
  towerStatusRadiant: number | null
  towerStatusDire: number | null
  barracksStatusRadiant: number | null
  barracksStatusDire: number | null
  picksBans: { isPick: boolean; isRadiant: boolean; heroId: number; order: number }[]
  /**
   * Полный драфт, если его удалось получить целиком: Steam отдаёт `picksBans`
   * обрезанным и часть банов помечает как пики. Проверяется по составу матча,
   * поэтому либо список полный и согласованный, либо поля нет.
   */
  draft?: MatchDraft | null
  players: MatchPlayer[]
}

export interface MatchDraft {
  source: 'stratz'
  /** автобаны: в этом режиме команды банят одновременно, порядка в данных нет */
  bans: { heroId: number; radiant: boolean | null }[]
  picks: { heroId: number; radiant: boolean; order: number }[]
}

export interface MatchPlayer {
  steamAccountId: number
  name: string | null
  heroId: number
  isRadiant: boolean
  isVictory: boolean
  kills: number
  deaths: number
  assists: number
  goldPerMinute: number
  experiencePerMinute: number
  numLastHits: number
  numDenies: number
  networth: number
  level: number
  heroDamage: number
  towerDamage: number
  heroHealing: number
  /** IMP: всегда null в своём API (Steam не считает импакты) */
  imp: number | null
  items: (number | null)[]
  backpack: (number | null)[]
  neutralItem: number | null
  neutralItem2: number | null
  aghanimsScepter: boolean
  aghanimsShard: boolean
  moonshard: boolean
  /** 0 — не выходил, иначе флаги Steam (1 — leaver, 2 — practice, ...) */
  leaverStatus: number
  /** урон/лечение с поправкой на длительность — сопоставимы между катками */
  scaledHeroDamage: number
  scaledTowerDamage: number
  scaledHeroHealing: number
  /** таймлайн прокачки: время в секундах от старта матча */
  abilityUpgrades: { ability: number; time: number; level: number }[]
  /** Parsed replay item purchase events; null when no timeline is available. */
  purchaseEvents?: { time: number; itemId: number }[] | null
  /** Replay-derived phase totals; do not feed these into the impact model. */
  impactPhases?: { label: string; kills: number; deaths: number; gold: number; networth: number; lastHits: number; experience: number; heroDamage: number; towerDamage: number }[]
  /** позиция 1–5 (0 — неизвестно) */
  position: number
  /** replay — своё движение по карте; stratz — их разбор реплея; stats — оценка по экономике */
  positionSource?: 'replay' | 'stats' | 'stratz'
  /** линия известна, когда позиция взята из разобранного реплея; jungle и roaming не отдаются */
  lane?: 'safelane' | 'mid' | 'offlane'
  /** текущий сезонный ранг игрока, 0 — нет данных */
  seasonRank: number
  /** rich-stats для модели импакта (всегда null в своём API — Steam не отдаёт события; модель честно считает на base-признаках) */
  stats: MatchPlayerStats | null
}

/** Событийная статистика для «честной» оценки импакта. */
export interface MatchPlayerStats {
  killEvents: { isSolo: boolean; isGank: boolean; assist: number }[]
  deathEvents: { goldFed: number; isDieBack: boolean; hasHealAvailable: boolean; isAttemptTpOut: boolean }[]
  /** type: Int 0 = OBSERVER, 1 = SENTRY */
  wards: { type: number | null }[]
  wardDestruction: unknown[]
  /** покупки предметов: расходники (смок 188, даст 40 и т.д.) */
  itemPurchases: { itemId: number }[]
  campStack: number[]
  runes: unknown[]
  courierKills: unknown[]
  actionsPerMinute: number[]
  tripsFountainPerMinute: number[]
  /** длина пути по локациям в тысячах единиц в минуту */
  pathPerMin: number
}

export interface ItemInfo {
  id: number
  name: string
  shortName: string
}

export type ApiErrorKind = 'no_token' | 'cloudflare' | 'graphql' | 'network' | 'http'

export class ApiError extends Error {
  kind: ApiErrorKind
  constructor(kind: ApiErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}
