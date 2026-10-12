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

/** Ссылка на профиль Steam (account_id32 → steamID64). */
export function steamProfileUrl(accountId: number): string {
  return `https://steamcommunity.com/profiles/${BigInt(accountId) + 76561197960265728n}`
}
