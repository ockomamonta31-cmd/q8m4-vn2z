// Разбор драфта на то, что он реально значит.
//
// Steam присылает `picksBans` обрезанным и непредсказуемым: часть автобанов
// теряется, а часть недосчитанных банов приходит помеченная как пики — отсюда
// «выбранные» герои, которых в матче не было. Целиком список отдаёт разбор
// STRATZ (`match.draft`), но и он принимается только если сходится с составом.
// На старых кэшах и матчах без разбора приходится чинить ответ Steam на месте:
// пик героя, которого в матче нет, — это бан; герой, который сыгран, но не
// отмечен ни в одном выборе, — пропущенный пик.
//
// Порядок: Valve отдаёт массив, сгруппированный по типу, а не по времени, так
// что «очереди хода» нет. Хронология ровно такая: сначала автобаны (в этом
// режиме команды банят одновременно), затем выборы фазами, где команда за
// фазу берёт не больше двух героев.

import type { MatchDetails } from '../api/types'

export type DraftAction = { isPick: boolean; isRadiant: boolean; heroId: number; order: number }

export type DraftItem = { heroId: number; radiant: boolean | null }

export type DraftPhase = { radiant: DraftItem[]; dire: DraftItem[] }

export type DraftView = {
  source: 'stratz' | 'steam'
  bans: DraftItem[]
  /** у банов указано, чей это бан; в All Draft команды банят одновременно и команды в данных нет */
  bansTeamKnown: boolean
  phases: DraftPhase[]
  /** выборы идут подряд по командам: значит, команды выбирали параллельно, а не по очереди */
  simultaneous: boolean
  picksTotal: number
  /** выборов, порядка которых в данных нет */
  picksUnordered: number
}

const MAX_PER_TEAM_PER_PHASE = 2

function phasesOf(picks: DraftItem[], orders: number[]): DraftPhase[] {
  const phases: DraftPhase[] = []
  let current: DraftPhase = { radiant: [], dire: [] }
  picks.forEach((p, i) => {
    const radiant = p.radiant === true
    const known = orders[i] >= 0
    if (known && (radiant ? current.radiant : current.dire).length >= MAX_PER_TEAM_PER_PHASE) {
      phases.push(current)
      current = { radiant: [], dire: [] }
    }
    ;(radiant ? current.radiant : current.dire).push(p)
  })
  if (current.radiant.length || current.dire.length) phases.push(current)
  return phases
}

/**
 * Порядок выборов говорит, как команды выбирали. Если идут пять подряд своих,
 * потом пять чужих — это параллельный выбор внутри команд, и делить его на
 * «фазы по очереди» значит рисовать пустые половины.
 */
function groupPicks(picks: DraftItem[], orders: number[]): { phases: DraftPhase[]; simultaneous: boolean } {
  let runs = 0
  let prev: boolean | null = null
  for (const p of picks) {
    if (p.radiant !== prev) runs++
    prev = p.radiant
  }
  if (runs <= 2) {
    return {
      phases: [{ radiant: picks.filter((p) => p.radiant === true), dire: picks.filter((p) => p.radiant === false) }],
      simultaneous: true,
    }
  }
  return { phases: phasesOf(picks, orders), simultaneous: false }
}

/** Полный драфт из разбора; null — если источника нет или он не сходится. */
function fromStratz(match: MatchDetails): DraftView | null {
  const draft = match.draft
  if (!draft?.picks.length) return null
  const heroes = new Set(match.players.map((p) => p.heroId))
  if (draft.picks.length !== 10) return null
  for (const p of match.players) {
    if (!draft.picks.some((k) => k.heroId === p.heroId && k.radiant === p.isRadiant)) return null
  }
  const bans = draft.bans.filter((b) => !heroes.has(b.heroId))
  const picks = [...draft.picks].sort((a, b) => a.order - b.order).map((k) => ({ heroId: k.heroId, radiant: k.radiant as boolean }))
  const { phases, simultaneous } = groupPicks(picks, picks.map(() => 0))
  return {
    source: 'stratz',
    bans: bans.map((b) => ({ heroId: b.heroId, radiant: b.radiant })),
    bansTeamKnown: bans.every((b) => b.radiant !== null),
    phases,
    simultaneous,
    picksTotal: picks.length,
    picksUnordered: 0,
  }
}

/** Ответ Steam с починкой: фантомные «пики» становятся банами, пропущенные выборы находятся в составе. */
function fromSteam(match: MatchDetails): DraftView {
  const heroes = new Set(match.players.map((p) => p.heroId))
  const teamOf = new Map(match.players.map((p) => [p.heroId, p.isRadiant]))
  const banIds: number[] = []
  const pickById = new Map<number, number>()
  for (const a of match.picksBans) {
    if (a.isPick && heroes.has(a.heroId)) {
      if (!pickById.has(a.heroId)) pickById.set(a.heroId, a.order)
    } else if (!banIds.includes(a.heroId)) {
      banIds.push(a.heroId)
    }
  }
  const missing = [...heroes].filter((h) => !pickById.has(h))
  const ordered = [...pickById.entries()].sort((a, b) => a[1] - b[1])
  const picks: DraftItem[] = [...ordered.map(([heroId]) => ({ heroId, radiant: teamOf.get(heroId) ?? null })), ...missing.map((heroId) => ({ heroId, radiant: teamOf.get(heroId) ?? null }))]
  const orders = [...ordered.map(([, o]) => o), ...missing.map(() => -1)]
  const { phases, simultaneous } = groupPicks(picks, orders)
  return {
    source: 'steam',
    bans: banIds.filter((id) => !heroes.has(id)).map((id) => ({ heroId: id, radiant: null })),
    bansTeamKnown: false,
    phases,
    simultaneous,
    picksTotal: picks.length,
    picksUnordered: missing.length,
  }
}

export function draftView(match: MatchDetails): DraftView | null {
  if (!match.picksBans.length && !match.draft) return null
  return fromStratz(match) ?? fromSteam(match)
}
