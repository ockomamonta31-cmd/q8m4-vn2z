// Форматирование значений для UI. gameMode/lobbyType приходят строковыми enum'ами
// (свой сервер мапит числовые коды Valve в эти строки).

function humanizeEnum(v: string): string {
  return v
    .toLowerCase()
    .split('_')
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

const GAME_MODES: Record<string, string> = {
  ALL_PICK_RANKED: 'All Pick Ranked',
  ALL_PICK: 'All Pick',
  ALL_DRAFT: 'All Draft',
  TURBO: 'Turbo',
  CAPTAINS_MODE: 'Captains Mode',
  CAPTAINS_DRAFT: 'Captains Draft',
  BALANCED_DRAFT: 'Balanced Draft',
  SINGLE_DRAFT: 'Single Draft',
  ALL_RANDOM: 'All Random',
  RANDOM_DRAFT: 'Random Draft',
  LEAST_PICKED: 'Least Played',
  MID_ONLY: 'Mid Only',
  ABILITY_DRAFT: 'Ability Draft',
  MUTATION: 'Mutation',
  COACHES_CHALLENGE: "Coaches' Challenge",
  LIMITED_HEROES: 'Limited Heroes',
  ARDM: 'All Random Deathmatch',
  ONE_VS_ONE_MID: '1v1 Mid',
}

const LOBBY_TYPES: Record<string, string> = {
  RANKED: 'Рейтинговые',
  PUBLIC_MATCH: 'Публичные матчи',
  PRACTICE: 'Практика',
  COMMUNITY: 'Комьюнити',
  TEAM: 'Командный',
  LEGACY_TEAM: 'Командный (старый)',
  LEGACY_EVENT: 'Событие',
  LANE_ASSIGNMENT: 'С коридорами',
}

export function gameModeName(mode: string): string {
  if (!mode) return 'Неизвестный режим'
  return GAME_MODES[mode] ?? humanizeEnum(mode)
}

export function lobbyName(lobby: string): string {
  if (!lobby) return 'Матч'
  return LOBBY_TYPES[lobby] ?? humanizeEnum(lobby)
}

export function rankName(rank: number | null | undefined): string {
  if (!rank) return 'Ранг неизвестен'
  const names = ['', 'Рекрут', 'Страж', 'Рыцарь', 'Герой', 'Легенда', 'Властелин', 'Божество', 'Титан']
  const medal = Math.floor(rank / 10), stars = rank % 10
  return names[medal] ? `${names[medal]}${medal < 8 && stars ? ` ${stars}` : ''}` : 'Ранг неизвестен'
}

export function rankDescription(source?: string | null, scope?: string | null, fetchedAt?: number | null): string {
  const date = fetchedAt ? ` · получен ${new Date(fetchedAt).toLocaleString('ru-RU')}` : ''
  return `${scope === 'match' ? 'Ранг на момент матча' : 'Текущий публичный ранг'}${source === 'opendota' ? ' · OpenDota' : ''}${date}`
}

export function fmtDuration(seconds: number): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtDate(unixSeconds: number): string {
  if (!unixSeconds) return '—'
  return new Date(unixSeconds * 1000).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function timeAgo(unixSeconds: number): string {
  if (!unixSeconds) return '—'
  const diff = Math.floor(Date.now() / 1000) - unixSeconds
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))} мин назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`
  if (diff < 30 * 86400) return `${Math.floor(diff / 86400)} дн назад`
  return fmtDate(unixSeconds)
}

export function kda(kills: number, deaths: number, assists: number): number {
  if (deaths === 0) return kills + assists
  return (kills + assists) / deaths
}

export function fmtKda(kills: number, deaths: number, assists: number): string {
  return kda(kills, deaths, assists).toFixed(2)
}

export function winrate(wins: number, total: number): number {
  return total > 0 ? (wins / total) * 100 : 0
}

export function fmtWinrate(wins: number, total: number): string {
  return `${winrate(wins, total).toFixed(1)}%`
}

/**
 * Из строки поиска — account_id. Принимает чистый id32, steamID64 или ссылку
 * на профиль; steamID64 отнимает базовое смещение Steam.
 */
export function parsePlayerQuery(value: string): string | null {
  const link = value.match(/(?:id|profiles)\/(\d{6,})/)?.[1]
  const digits = link ?? value.match(/\d{5,}/g)?.at(-1)
  if (!digits) return null
  if (digits.length < 17) return digits
  try {
    return (BigInt(digits) - 76561197960265728n).toString()
  } catch {
    return null
  }
}

/** Ссылка на профиль Steam (account_id32 → steamID64). */
export function steamProfileUrl(accountId: number): string {
  return `https://steamcommunity.com/profiles/${BigInt(accountId) + 76561197960265728n}`
}

export type ParsedQuery = { kind: 'match' | 'player'; id: string }

/**
 * Строка поиска → матч или профиль. Граница честная: account_id Valve — это
 * uint32, поэтому число больше 4 294 967 295 матчем быть не может, а 17-значный
 * steamID64 матчем быть не может по длине. Ссылки на stratz/dotabuff/opendota
 * и префикс «матч» снимают остаток неоднозначности.
 */
export function parseQuery(value: string): ParsedQuery | null {
  const text = value.trim()
  if (!text) return null

  const matchLink = text.match(/(?:^|[/.?=&])match(?:es)?[/:=_-]*(\d{6,})/i)
  if (matchLink) return { kind: 'match', id: matchLink[1] }
  if (/^(match|матч)\s*[:#\s]?\s*(\d{6,})$/i.test(text)) {
    return { kind: 'match', id: text.match(/(\d{6,})\s*$/)![1] }
  }
  if (/(?:steamcommunity\.com)\/(?:id|profiles)\//i.test(text)) {
    const id = parsePlayerQuery(text)
    return id ? { kind: 'player', id } : null
  }

  const digits = text.replace(/[\s-]/g, '')
  if (!/^\d{6,}$/.test(digits)) {
    const id = parsePlayerQuery(text)
    return id ? { kind: 'player', id } : null
  }
  if (digits.length >= 17) {
    const id = parsePlayerQuery(digits)
    return id ? { kind: 'player', id } : null
  }
  try {
    return BigInt(digits) > 4294967295n ? { kind: 'match', id: digits } : { kind: 'player', id: digits }
  } catch {
    return null
  }
}
