// Разбор драфта на то, что действительно можно сказать по данным матча.
//
// Два правила. Первое: состав описываем тегами Valve — это публикуемые
// свойства героя, а не наша классификация. Второе: силу линии считаем только
// из замеренных чисел матча (GPM, XPM, LH, нетворс) и никогда не называем
// линией то, чего не знаем: без разобранного реплея линий в данных нет.
//
// Рейтинга «этот драфт сильнее» здесь нет намеренно: на 465 наших играх
// All Draft медианы исхода плоские по каждому тегу (убийства по числу
// инициаторов 44/43/42/44, GPM по числу керри 2546 против 2529), то есть
// предсказательной силы у этих признаков не обнаружено.

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

/** Разница четырёх замеров, равные веса, в процентах от большего. */
function relativeEdge(a: number, b: number) {
  const top = Math.max(Math.abs(a), Math.abs(b))
  if (!top) return 0
  return ((a - b) / top) * 100
}

export type Matchup = {
  label: string
  /** линия известна из реплея, а не предположена */
  measured: boolean
  radiant: MatchPlayer[]
  dire: MatchPlayer[]
  gpm: number
  xpm: number
  lh: number
  networth: number
  /** сводный край Radiant по четырём замерам, −100…100 */
  edge: number
}

const LANE_ORDER: { key: string; positions: number[]; label: string }[] = [
  { key: 'safelane', positions: [1, 5], label: 'Лёгкая линия' },
  { key: 'mid', positions: [2], label: 'Мид' },
  { key: 'offlane', positions: [3, 4], label: 'Сложная линия' },
]

/**
 * Позицию 1–5 реплей выводит из линии (safe → 1 и 5, mid → 2, off → 3 и 4),
 * поэтому при positionSource === 'replay' она несёт тот же смысл, что и lane.
 * Поле lane при этом до фронтенда доходит не всегда, так что опираемся на
 * позицию, а lane оставляем как уточнение.
 */
function laneKeyOf(p: MatchPlayer): string | null {
  if (p.positionSource !== 'replay') return null
  if (p.lane) return p.lane
  const group = LANE_ORDER.find((l) => l.positions.includes(p.position))
  return group ? group.key : null
}

function groupGaps(rGroup: MatchPlayer[], dGroup: MatchPlayer[], label: string, measured: boolean): Matchup {
  const sum = (g: MatchPlayer[], pick: (p: MatchPlayer) => number) => g.reduce((a, p) => a + pick(p), 0)
  const r = { gpm: sum(rGroup, (p) => p.goldPerMinute), xpm: sum(rGroup, (p) => p.experiencePerMinute), lh: sum(rGroup, (p) => p.numLastHits), nw: sum(rGroup, (p) => p.networth) }
  const d = { gpm: sum(dGroup, (p) => p.goldPerMinute), xpm: sum(dGroup, (p) => p.experiencePerMinute), lh: sum(dGroup, (p) => p.numLastHits), nw: sum(dGroup, (p) => p.networth) }
  const gpm = relativeEdge(r.gpm, d.gpm)
  const xpm = relativeEdge(r.xpm, d.xpm)
  const lh = relativeEdge(r.lh, d.lh)
  const networth = relativeEdge(r.nw, d.nw)
  // группа из двух героев против группы из двух сравнивается по среднему,
  // иначе линия с лишним героем выглядит автоматически сильнее
  const norm = (v: number, g: MatchPlayer[]) => (g.length > 1 ? v / 2 : v)
  return {
    label,
    measured,
    radiant: rGroup,
    dire: dGroup,
    gpm: norm(gpm, rGroup),
    xpm: norm(xpm, rGroup),
    lh: norm(lh, rGroup),
    networth: norm(networth, rGroup),
    edge: (norm(gpm, rGroup) + norm(xpm, rGroup) + norm(lh, rGroup) + norm(networth, rGroup)) / 4,
  }
}

/**
 * Линии берём только там, где их действительно определил реплей. Иначе
 * честнее сравнивать по месту в порядке фарма внутри команды, чем рисовать
 * несуществующие коридоры.
 */
export function buildMatchups(players: MatchPlayer[]): { matchups: Matchup[]; basis: 'replay' | 'rank' } {
  const hasLanes = players.some((p) => laneKeyOf(p) !== null)
  const radiant = players.filter((p) => p.isRadiant)
  const dire = players.filter((p) => !p.isRadiant)

  if (hasLanes) {
    const matchups = LANE_ORDER.map(({ key, label }) => {
      const r = radiant.filter((p) => laneKeyOf(p) === key)
      const d = dire.filter((p) => laneKeyOf(p) === key)
      if (!r.length && !d.length) return null
      return groupGaps(r, d, label, true)
    }).filter(Boolean) as Matchup[]
    if (matchups.length) return { matchups, basis: 'replay' }
  }

  const byNw = (a: MatchPlayer, b: MatchPlayer) => b.networth - a.networth
  const r = [...radiant].sort(byNw)
  const d = [...dire].sort(byNw)
  const matchups = r.map((p, i) => groupGaps([p], d[i] ? [d[i]] : [], `${i + 1}-й по фарму`, false))
  return { matchups, basis: 'rank' }
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
