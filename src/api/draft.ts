// Разбор драфта на то, что действительно можно сказать по данным матча.
//
// Два правила. Первое: состав описываем тегами Valve — это публикуемые
// свойства героя, а не наша классификация. Второе: силу линии считаем только
// из замеренных чисел матча (GPM, опыт, добивания, нетворс) и никогда не
// называем линией то, чего не знаем: без разобранного реплея линий в данных нет.
//
// «Насколько драфт лучше» и «кто возьмёт линию» — в src/api/draftStrength.ts:
// они сравнивают героев со средним по их роли из нашей же базы матчей
// (scripts/build-hero-profile.mjs). Здесь только то, что видно из самого матча.

import { TAG_ORDER, type HeroMeta } from './heroMeta'
import type { MatchPlayer } from './types'

export type TeamProfile = {
  radiant: boolean
  players: MatchPlayer[]
  attr: Record<string, number>
  melee: number
  ranged: number
  tags: Record<string, number>
  /** суммы по команде — то, что реально нафармили и нанесли */
  gpm: number
  xpm: number
  lastHits: number
  networth: number
  heroDamage: number
  towerDamage: number
  kills: number
}

export function teamProfile(players: MatchPlayer[], radiant: boolean, meta: Map<number, HeroMeta>): TeamProfile {
  const side = players.filter((p) => p.isRadiant === radiant)
  const attr: Record<string, number> = { str: 0, agi: 0, int: 0, all: 0 }
  const tags: Record<string, number> = {}
  for (const t of TAG_ORDER) tags[t] = 0
  let melee = 0
  let ranged = 0

  for (const p of side) {
    const m = meta.get(p.heroId)
    if (!m) continue
    if (attr[m.attr] !== undefined) attr[m.attr] += 1
    if (m.attack === 'melee') melee += 1
    else if (m.attack === 'ranged') ranged += 1
    for (const t of new Set(m.roles)) if (t in tags) tags[t] += 1
  }

  const sum = (pick: (p: MatchPlayer) => number) => side.reduce((acc, p) => acc + pick(p), 0)

  return {
    radiant,
    players: side,
    attr,
    melee,
    ranged,
    tags,
    gpm: sum((p) => p.goldPerMinute),
    xpm: sum((p) => p.experiencePerMinute),
    lastHits: sum((p) => p.numLastHits),
    networth: sum((p) => p.networth),
    heroDamage: sum((p) => p.heroDamage),
    towerDamage: sum((p) => p.towerDamage),
    kills: sum((p) => p.kills),
  }
}

/** Разница двух чисел в процентах от большего. */
export function relativeEdge(a: number, b: number) {
  const top = Math.max(Math.abs(a), Math.abs(b))
  if (!top) return 0
  return ((a - b) / top) * 100
}

export type LaneTotals = { gpm: number; xpm: number; lh: number; nw: number }

export type LaneGaps = {
  totals: { r: LaneTotals; d: LaneTotals }
  gpm: number
  xpm: number
  lh: number
  networth: number
  /** сводный край Radiant по четырём замерам, −100…100 */
  edge: number
}

const totalsOf = (g: MatchPlayer[]): LaneTotals => ({
  gpm: g.reduce((a, p) => a + p.goldPerMinute, 0),
  xpm: g.reduce((a, p) => a + p.experiencePerMinute, 0),
  lh: g.reduce((a, p) => a + p.numLastHits, 0),
  nw: g.reduce((a, p) => a + p.networth, 0),
})

/** Что линия реально дала в этом матче — по четырём замерам. */
export function laneGaps(r: MatchPlayer[], d: MatchPlayer[]): LaneGaps {
  const totals = { r: totalsOf(r), d: totalsOf(d) }
  const gpm = relativeEdge(totals.r.gpm, totals.d.gpm)
  const xpm = relativeEdge(totals.r.xpm, totals.d.xpm)
  const lh = relativeEdge(totals.r.lh, totals.d.lh)
  const networth = relativeEdge(totals.r.nw, totals.d.nw)
  return { totals, gpm, xpm, lh, networth, edge: (gpm + xpm + lh + networth) / 4 }
}

export const EDGE_STRONG = 12

export function edgeVerdict(edge: number): { text: string; tone: 'pos' | 'neg' | 'dim' } {
  if (edge >= EDGE_STRONG) return { text: 'сильнее', tone: 'pos' }
  if (edge <= -EDGE_STRONG) return { text: 'слабее', tone: 'neg' }
  return { text: 'равно', tone: 'dim' }
}

/** Короткие наблюдения из тегов: только те, что следуют из состава напрямую. */
export function draftNotes(team: TeamProfile, opponent: TeamProfile): string[] {
  const out: string[] = []
  if (!team.tags.Carry) out.push('Керри-тега нет ни у кого — состав не рассчитан на позднюю стадию')
  if (team.tags.Carry >= 3) out.push('Три героя с тегом «керри» — за фарм спорят между собой')
  if (!team.tags.Initiator && !team.tags.Disabler) out.push('Нет ни инициации, ни дизейбла — начинать драку нечем')
  if (team.tags.Initiator >= 2 && team.tags.Disabler >= 2) out.push('Есть и инициация, и контроль — состав под тимфайт')
  if (team.melee >= 4) out.push(`${team.melee} из 5 в ближнем бою — урон упирается в то, как далеко подпустят`)
  if (team.ranged >= 4) out.push(`${team.ranged} из 5 издалека — размен держится на дистанции`)
  const topAttr = Object.entries(team.attr).sort((a, b) => b[1] - a[1])[0]
  if (topAttr && topAttr[1] >= 4) out.push(`${topAttr[1]} героя одной атрибуции — один тип предмета резиста закрывает половину урона`)
  if (team.towerDamage > opponent.towerDamage * 1.5 && team.towerDamage > 0) out.push('Урона по башням заметно больше — состав давит карту')
  return out
}
