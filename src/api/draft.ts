// Разбор драфта на то, что действительно можно сказать по данным матча.
//
// Два правила. Первое: состав описываем тегами Valve — это публикуемые
// свойства героя, а не наша классификация. Второе: силу линии считаем только
// из замеренных чисел матча (GPM, опыт, добивания, нетворс) и никогда не
// называем линией то, чего не знаем: без разобранного реплея линий в данных нет.
//
// «Насколько драфт лучше» — не здесь: это считает src/api/draftStrength.ts по
// измеренным винрейтам STRATZ. Здесь только то, что видно из самого матча.
// Собственный рейтинг по тегам Valve мы не строили: на 465 наших играх
// All Draft медианы исхода плоские по каждому тегу (убийства по числу
// инициаторов 44/43/42/44, GPM по числу керри 2546 против 2529) — то есть
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

/** Разница двух чисел в процентах от большего. */
function relativeEdge(a: number, b: number) {
  const top = Math.max(Math.abs(a), Math.abs(b))
  if (!top) return 0
  return ((a - b) / top) * 100
}

export type LaneTotals = { gpm: number; xpm: number; lh: number; nw: number }

export type LanePair = { radiant: MatchPlayer | null; dire: MatchPlayer | null }

export type Matchup = {
  key: string
  label: string
  /** линия известна из разобранного реплея, а не предположена */
  measured: boolean
  radiant: MatchPlayer[]
  dire: MatchPlayer[]
  /** кто против кого внутри линии: совпавшие по номеру позиции герои */
  pairs: LanePair[]
  gpm: number
  xpm: number
  lh: number
  networth: number
  /** сводный край Radiant по четырём замерам, −100…100 */
  edge: number
  totals: { r: LaneTotals; d: LaneTotals }
}

const LANE_ORDER: { key: string; positions: number[]; label: string }[] = [
  { key: 'safelane', positions: [1, 5], label: 'Лёгкая линия' },
  { key: 'mid', positions: [2], label: 'Мид' },
  { key: 'offlane', positions: [3, 4], label: 'Сложная линия' },
]

const LANE_LABEL: Record<string, string> = Object.fromEntries(LANE_ORDER.map((l) => [l.key, l.label]))

export const laneLabel = (key: string) => LANE_LABEL[key] ?? key

/**
 * Позицию 1–5 реплей выводит из линии (safe → 1 и 5, mid → 2, off → 3 и 4),
 * поэтому она несёт тот же смысл, что и поле lane. До фронтенда lane доходит
 * не всегда, так что опираемся на позицию, а lane оставляем уточнением.
 */
function laneKeyOf(p: MatchPlayer): string | null {
  if (p.positionSource !== 'replay' && p.positionSource !== 'stratz') return null
  if (p.lane) return p.lane
  const group = LANE_ORDER.find((l) => l.positions.includes(p.position))
  return group ? group.key : null
}

export const laneOf = laneKeyOf

const totalsOf = (g: MatchPlayer[]): LaneTotals => ({
  gpm: g.reduce((a, p) => a + p.goldPerMinute, 0),
  xpm: g.reduce((a, p) => a + p.experiencePerMinute, 0),
  lh: g.reduce((a, p) => a + p.numLastHits, 0),
  nw: g.reduce((a, p) => a + p.networth, 0),
})

function matchup(rGroup: MatchPlayer[], dGroup: MatchPlayer[], key: string, measured: boolean): Matchup {
  const byPosition = (a: MatchPlayer, b: MatchPlayer) => a.position - b.position
  const r = [...rGroup].sort(byPosition)
  const d = [...dGroup].sort(byPosition)
  const totals = { r: totalsOf(r), d: totalsOf(d) }
  const taken = new Set<MatchPlayer>()
  const pairs: LanePair[] = r.map((p) => {
    // пара — враг с тем же номером позиции: керри против керри, саппорт
    // против саппорта; если такого нет, герой остаётся в линии без пары
    const q = d.find((x) => x.position === p.position && !taken.has(x)) ?? null
    if (q) taken.add(q)
    return { radiant: p, dire: q }
  })
  for (const q of d) if (!taken.has(q)) pairs.push({ radiant: null, dire: q })
  const gpm = relativeEdge(totals.r.gpm, totals.d.gpm)
  const xpm = relativeEdge(totals.r.xpm, totals.d.xpm)
  const lh = relativeEdge(totals.r.lh, totals.d.lh)
  const networth = relativeEdge(totals.r.nw, totals.d.nw)
  return {
    key,
    label: LANE_LABEL[key] ?? key,
    measured,
    radiant: r,
    dire: d,
    pairs,
    gpm,
    xpm,
    lh,
    networth,
    edge: (gpm + xpm + lh + networth) / 4,
    totals,
  }
}

/**
 * Линии берём там, где их дал разобранный реплей — свой или STRATZ. Без него
 * честнее сравнивать по месту в порядке фарма внутри команды, чем рисовать
 * несуществующие коридоры.
 */
export function buildMatchups(players: MatchPlayer[]): { matchups: Matchup[]; basis: 'replay' | 'stratz' | 'rank' } {
  const lanced = players.filter((p) => laneKeyOf(p) !== null)
  if (lanced.length >= 6) {
    const matchups = LANE_ORDER.map(({ key }) => {
      const r = lanced.filter((p) => p.isRadiant && laneKeyOf(p) === key)
      const d = lanced.filter((p) => !p.isRadiant && laneKeyOf(p) === key)
      if (!r.length && !d.length) return null
      return matchup(r, d, key, true)
    }).filter(Boolean) as Matchup[]
    if (matchups.length) {
      return { matchups, basis: players.some((p) => p.positionSource === 'replay') ? 'replay' : 'stratz' }
    }
  }

  const byNw = (a: MatchPlayer, b: MatchPlayer) => b.networth - a.networth
  const r = [...players.filter((p) => p.isRadiant)].sort(byNw)
  const d = [...players.filter((p) => !p.isRadiant)].sort(byNw)
  const matchups = r.map((p, i) => matchup([p], d[i] ? [d[i]] : [], `${i + 1}-й по фарму`, false))
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
