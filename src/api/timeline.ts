// Таймлайн матча из разобранного реплея: кривые преимущества, лента убийств,
// разрушенные строения, Рошан, тимфайты. Отсутствует, пока реплей не разобран,
// — секции графиков и таймлайна тогда скрываются целиком.

import { ApiError } from './types'

export interface AdvantagePoint {
  /** секунды от старта матча */
  t: number
  /** плюс — впереди Radiant */
  gold: number
  xp: number
}

export interface KillEvent {
  t: number
  radiant: boolean
  /** герой-убийца */
  heroId: number
  /** жертва, 0 — не опознан */
  victimHeroId: number
}

export interface StructureEvent {
  t: number
  kind: 'tower' | 'barracks' | 'fort'
  /** 1–4 для башен, 1/2 для казарм */
  tier: number
  lane: 'top' | 'mid' | 'bot' | null
  /** true — снес Radiant */
  radiant: boolean | null
  heroId: number | null
}

export interface TeamfightLine {
  slot: number
  heroId: number | null
  kills: number
  deaths: number
  buybacks: number
  damage: number
  healing: number
  gold: number
}

export interface Teamfight {
  t: number
  end: number
  deaths: number
  radiantKills: number
  direKills: number
  /** байбеков потрачено в драке — показывает ставку сторон */
  buybacks?: number
  /** изменение преимущества Radiant по золоту через минуту после драки */
  swing?: number
  /** строки игроков в порядке player_slot; пусто в старых записях кэша */
  lines?: TeamfightLine[]
  index: number
}

export interface MatchTimeline {
  durationSeconds: number
  series: AdvantagePoint[]
  kills: KillEvent[]
  structures: StructureEvent[]
  roshans: { t: number; radiant: boolean }[]
  firstBlood: { t: number; heroId: number | null }
  teamfights: Teamfight[]
}

/** 404 здесь — штатная ситуация (реплей не разобран), а не ошибка. */
export async function fetchTimeline(id: number): Promise<MatchTimeline | null> {
  try {
    const res = await fetch(`/api/matches/${id}/timeline`)
    if (!res.ok) return null
    return (await res.json()) as MatchTimeline
  } catch (e) {
    if (e instanceof ApiError) return null
    return null
  }
}

/** Пик преимущества по абсолютному значению — для подписи «самый большой отрыв». */
export function peakAdvantage(timeline: MatchTimeline | null) {
  if (!timeline?.series.length) return null
  let peak = timeline.series[0]
  for (const point of timeline.series) if (Math.abs(point.gold) > Math.abs(peak.gold)) peak = point
  return { ...peak, radiant: peak.gold >= 0 }
}

/** Момент, после которого лидер удерживал преимущество до конца матча. */
export function turningPoint(timeline: MatchTimeline | null) {
  if (!timeline?.series.length) return null
  const series = timeline.series
  const last = series[series.length - 1]
  if (!last.gold) return null
  const lead = Math.sign(last.gold)
  let index = series.length - 1
  while (index > 0 && Math.sign(series[index - 1].gold) === lead) index--
  if (index === 0 && Math.sign(series[0].gold) === lead) return null
  return { t: series[index].t, gold: series[index].gold, radiant: lead > 0 }
}

export interface RankedTeamfight extends Teamfight {
  winner: 'radiant' | 'dire' | 'even'
  /** сколько золота унесла из возни каждая сторона */
  radiantGold: number
  direGold: number
  /** radiantGold − direGold; сходится со строками игроков, в отличие от swing */
  fightGold: number
  /** сдвиг карты вокруг драки — шире самой возни и включает последствия */
  mapSwing: number
  /** вес сортировки: сначала куш драки, без строк — сдвиг карты, без него — масштаб */
  weight: number
}

/**
 * Драки по важности. Берём золото, которое стороны унесли именно из возни: оно
 * сходится со строками игроков. Сдвиг карты (swing) считается по окну шире драки
 * и включает башни, крипов и добивания после, поэтому у него бывает обратный знак
 * — как поддержка он полезен, по нему ранжировать нельзя.
 */
export function rankTeamfights(timeline: MatchTimeline | null): RankedTeamfight[] {
  const fights = timeline?.teamfights ?? []
  return fights.map((fight): RankedTeamfight => {
    const lines = fight.lines ?? []
    const radiantGold = lines.filter((l) => l.slot < 128).reduce((sum, l) => sum + l.gold, 0)
    const direGold = lines.filter((l) => l.slot >= 128).reduce((sum, l) => sum + l.gold, 0)
    const fightGold = radiantGold - direGold
    const winner: RankedTeamfight['winner'] = fight.radiantKills === fight.direKills ? 'even' : fight.radiantKills > fight.direKills ? 'radiant' : 'dire'
    const weight = lines.length
      ? Math.abs(fightGold)
      : fight.swing == null
        ? fight.deaths * 1000 + (fight.buybacks ?? 0) * 500
        : Math.abs(fight.swing)
    return { ...fight, radiantGold, direGold, fightGold, mapSwing: fight.swing ?? 0, winner, weight }
  }).sort((a, b) => b.weight - a.weight)
}
