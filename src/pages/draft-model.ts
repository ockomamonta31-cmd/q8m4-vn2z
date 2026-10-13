// Разбор picks_bans на то, что он реально значит.
//
// Valve присылает массив, отсортированный по типу, а не по времени: сначала
// все пики, потом все баны. Поэтому `order` нельзя показывать как «очерёдь
// хода». Хронология здесь только такая: автобаны идут до пиков, а пики идут
// фазами, где каждая команда за фазу берёт не больше двух героев.

export type DraftAction = { isPick: boolean; isRadiant: boolean; heroId: number; order: number }

export type DraftGroup = { radiant: DraftAction[]; dire: DraftAction[] }

const MAX_PER_TEAM_PER_PHASE = 2

export function splitDraft(actions: DraftAction[]) {
  const bans = actions.filter((a) => !a.isPick)
  const picks = actions.filter((a) => a.isPick).sort((x, y) => x.order - y.order)

  const autoBans: DraftGroup = { radiant: bans.filter((b) => b.isRadiant), dire: bans.filter((b) => !b.isRadiant) }

  const phases: DraftGroup[] = []
  let current: DraftGroup = { radiant: [], dire: [] }
  for (const p of picks) {
    const isRadiant = p.isRadiant
    if ((isRadiant ? current.radiant : current.dire).length >= MAX_PER_TEAM_PER_PHASE) {
      phases.push(current)
      current = { radiant: [], dire: [] }
    }
    ;(isRadiant ? current.radiant : current.dire).push(p)
  }
  if (current.radiant.length || current.dire.length) phases.push(current)

  return { autoBans, phases, hasBans: bans.length > 0 }
}

/** Дублируются ли герои между пиками: признак пере-пика после коллизии. */
export function duplicatePicks(actions: DraftAction[]): Set<number> {
  const seen = new Set<number>(); const dup = new Set<number>()
  for (const a of actions) if (a.isPick) { if (seen.has(a.heroId)) dup.add(a.heroId); else seen.add(a.heroId) }
  return dup
}
