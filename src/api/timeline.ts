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
  mapSwing: number | null
  /** Explainable relative state-change heuristic; not a win probability. */
  weight: number
  beforeGold: number | null
  afterGold: number | null
  reasons: string[]
  keyCandidate: boolean
}

/** Rank measured state changes; a fight which closes an established lead is labelled separately. */
export function rankTeamfights(timeline: MatchTimeline | null): RankedTeamfight[] {
  const fights = timeline?.teamfights ?? []
  const series = timeline?.series ?? []
  const at = (t: number) => series.filter(p => p.t <= t).at(-1)?.gold ?? null
  return fights.map((fight): RankedTeamfight => {
    const lines = fight.lines ?? []
    const radiantGold = lines.filter((l) => l.slot < 128).reduce((sum, l) => sum + l.gold, 0)
    const direGold = lines.filter((l) => l.slot >= 128).reduce((sum, l) => sum + l.gold, 0)
    const fightGold = radiantGold - direGold
    const winner: RankedTeamfight['winner'] = fight.radiantKills === fight.direKills ? 'even' : fight.radiantKills > fight.direKills ? 'radiant' : 'dire'
    const beforeGold = at(fight.t)
    const after = series.find(p => p.t >= (Math.floor(fight.end / 60) + 1) * 60 && p.t <= fight.end + 120)
    const afterGold = after?.gold ?? null
    // A truncated end-of-match series cannot measure a post-fight gold change.
    const mapSwing = series.length && !after ? null : fight.swing ?? (beforeGold !== null && afterGold !== null ? afterGold - beforeGold : null)
    // ponytail: explainable heuristic, not a calibrated causal model of fight importance.
    const economy = 6000 + fight.t / 60 * 2000
    const next = Math.min(...fights.filter(f => f.t > fight.end).map(f => f.t), Infinity)
    const until = Math.min(fight.end + 90, next)
    const side = winner === 'even' ? null : winner === 'radiant'
    const objects = side === null ? [] : (timeline?.structures ?? []).filter(o => o.t >= fight.end && o.t < until && o.radiant === side && o.kind !== 'fort')
    const roshans = side === null ? [] : (timeline?.roshans ?? []).filter(o => o.t >= fight.end && o.t < until && o.radiant === side)
    const later = series.filter(p => p.t >= fight.end + 60 && p.t <= fight.end + 360 && p.t < next)
    const reversal = beforeGold !== null && Math.abs(beforeGold) >= 1000 && later.length >= 3
      && later.at(-1)!.t - later[0].t >= 120
      && later.every(p => Math.sign(p.gold) === -Math.sign(beforeGold) && Math.abs(p.gold) >= 500)
    const meaningfulSwing = mapSwing !== null && Math.abs(mapSwing) >= Math.max(1500, Math.abs(beforeGold ?? 0) * .25)
    const margin = Math.abs(fight.radiantKills - fight.direKills)
    const preceding = series.filter(p => p.t >= fight.t - 300 && p.t <= fight.t)
    const winnerSign = winner === 'radiant' ? 1 : winner === 'dire' ? -1 : 0
    const establishedLead = preceding.length >= 3 && preceding.at(-1)!.t - preceding[0].t >= 120
      && preceding.every(p => Math.sign(p.gold) === winnerSign && Math.abs(p.gold) >= economy * .12)
    const reasons: string[] = []
    if (establishedLead) reasons.push('Победитель боя уже минимум две минуты держал большой отрыв. Этот бой укрепил существующее преимущество; переломом его не считаем.')
    if (reversal) reasons.push('После драки сменился лидер по золоту; новый перевес держался минимум две минуты до следующей драки.')
    if (mapSwing !== null) reasons.push(`Изменение перевеса Radiant за окно драки и следующую минуту: ${mapSwing >= 0 ? '+' : '−'}${Math.abs(mapSwing).toLocaleString('ru-RU')} золота.`)
    if (objects.length || roshans.length) reasons.push(`В следующие 90 секунд до новой драки ${winner === 'radiant' ? 'Radiant' : 'Dire'} забрали: башни — ${objects.filter(o => o.kind === 'tower').length}, казармы — ${objects.filter(o => o.kind === 'barracks').length}, Рошан — ${roshans.length}. Это последовательность событий, причинная связь не доказана.`)
    if (mapSwing === null) reasons.push('После боя нет достаточной выборки золота; изменение перевеса не измерено.')
    const objectWeight = Math.min(6, objects.reduce((n, o) => n + (o.kind === 'barracks' ? 2 : 1), 0) + roshans.length * 2)
    const weight = (Math.abs(mapSwing ?? 0) / economy * 100 + Math.abs(fightGold) / economy * 35
      + margin / Math.max(3, fight.deaths) * 3 + objectWeight) * (establishedLead ? .35 : 1) + (reversal ? 10 : 0)
    const keyCandidate = !establishedLead && (reversal || meaningfulSwing && (margin >= 2 || objectWeight >= 1))
    return { ...fight, radiantGold, direGold, fightGold, mapSwing, winner, weight, beforeGold, afterGold, reasons, keyCandidate }
  }).sort((a, b) => b.weight - a.weight || a.t - b.t)
}

/** No automatic winner: the top row needs evidence of a meaningful state change. */
export function keyTeamfight(timeline: MatchTimeline | null) {
  return rankTeamfights(timeline).find(f => f.keyCandidate) ?? null
}
