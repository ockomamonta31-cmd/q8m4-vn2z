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
    /** Medal code; rankScope distinguishes historical and current ranks. 0 = unavailable. */
    seasonRank: number
    rankSource?: 'opendota' | 'match' | null
    rankScope?: 'current' | 'match' | null
    rankFetchedAt?: number | null
    isVictory: boolean
    /** IMP: −100…+100. Всегда null в своём API (Steam не считает импакты) — колонка использует свою модель */
    imp: number | null
    evidence?: PlayerEvidence | null
    mapPlays?: MapPlays | null
    impactPhases?: MatchPlayer['impactPhases']
    purchaseEvents?: MatchPlayer['purchaseEvents']
    stats?: MatchPlayerStats | null
    teamKills?: number
    teamDamage?: number
  }
}

export interface Profile {
  steamAccountId: number
  name: string
  avatar: string | null
  matchCount: number | null
  winCount: number | null
  /** Public medal code (null when unavailable). */
  rank: number | null
  rankSource?: 'opendota' | 'match' | null
  rankScope?: 'current' | 'match' | null
  rankFetchedAt?: number | null
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

export interface MapPlay {
  t: number
  end: number
  kind: 'fight' | 'rotation' | 'objective' | 'pressure'
  verdict: -1 | 0 | 1
  teamGold: number
  moved: number | null
  facts: { kills?: number; deaths?: number; damage?: number; victims?: number[]; allies?: number; enemies?: number; target?: string; destroyed?: boolean; creeps?: number }
  route: [number, number, number, number][]
  heroes: { slot: number; heroId: number; x: number; y: number; alive: boolean }[]
}
export interface MapPlays {
  version: number
  heroId: number
  sampleSeconds: number
  coverage: number
  /** Descriptive balance of recorded trades, not a trained causal impact. */
  score: number | null
  good: number
  bad: number
  neutral: number
  teamGoldAt15: number
  networthAt15: number | null
  teamNetworthAt15: number
  enemyNetworthAt15: number
  episodes: MapPlay[]
  structures?: MapStructure[]
}
export interface MapStructure {key?:string;kind:string;team:number;x:number;y:number;destroyedAt?:number|null}

export interface MatchPlayer {
  teamKills?: number
  teamDamage?: number
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
  /** Replay-derived phase totals. */
  impactPhases?: { label: string; kills: number; deaths: number; gold: number; networth: number; lastHits: number; experience: number; heroDamage: number; towerDamage: number }[]
  mapPlays?: MapPlays | null
  evidence?: PlayerEvidence | null
  /** позиция 1–5 (0 — неизвестно) */
  position: number
  /** replay — своё движение по карте; stratz — их разбор реплея; stats — оценка по экономике */
  positionSource?: 'replay' | 'stats' | 'stratz'
  /** линия известна, когда позиция взята из разобранного реплея; jungle и roaming не отдаются */
  lane?: 'safelane' | 'mid' | 'offlane'
  /** текущий сезонный ранг игрока, 0 — нет данных */
  seasonRank: number
  rankSource?: 'opendota' | 'match' | null
  rankScope?: 'current' | 'match' | null
  rankFetchedAt?: number | null
  /** rich-stats для модели импакта (всегда null в своём API — Steam не отдаёт события; модель честно считает на base-признаках) */
  stats: MatchPlayerStats | null
}

export interface PlayerEvidence {
  version: 1
  /** t, earned gold, networth, XP, LH, denies, hero damage, healing, tower damage, team gold lead */
  curve: (number | null)[][]
  lane: { damage: number | null; damageTaken: number | null; attacks: number | null; spellHits: number | null; activeMinutes: number | null }
  microVersion?:1|null
  laneMinutes?:{t:number;end:number;lh:number;xp:number;damage:number;taken:number;attacks:number;aliveSeconds:number}[]|null
  deathWindows?:{t:number;from:number;damage:number;taken:number;attacks:number;ownSpells:string[];enemySpells:string[];items:string[];nearestAlly:{heroId:number;distance:number}|null;allyDamage:number;allySpells:string[];lhNextMinute:number|null;xpNextMinute:number|null}[]|null
  spellWindows?:{t:number;key:string;seconds:number;attacks:number;damage:number}[]|null
  deaths: { t: number; goldFed: number | null; lostGold: number | null; secondsDead: number | null; killer: string; dieback: boolean }[] | null
  wards: { t: number; type: string; x: number | null; y: number | null }[] | null
  uses: { t: number; key: string; target: string }[] | null
  fights: { t: number; end: number; damage: number; healing: number; deaths: number; kills: number; gold: number | null; firstCast: boolean | null; abilities: Record<string, number> | null; items: Record<string, number> | null }[] | null
  dewards: number | null
  stacks: number | null
  stuns: number | null
  purchases: { t: number; key: string }[] | null
  itemUses: Record<string, number> | null
  runes: { t: number; key: string }[] | null
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
