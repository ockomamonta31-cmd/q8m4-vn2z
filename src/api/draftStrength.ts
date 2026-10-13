// Две оценки, и обе считаются у нас: по каждой линии и одна общая по драфту.
//
// Источник — только наша база матчей (server/data/constants/hero_profile.json):
// средние статы Valve по героям и ролям. Чужие винрейты не используются.
//
// Как считаем:
//   1. герой сравнивается со средним по СВОЕЙ роли (иначе саппорт всегда
//      «слабый керри»); индекс 1.0 = делает свою работу как средний;
//   2. линия — это коридор карты: мид против мида, а керри с саппортом против
//      чужого оффлейна, поэтому пары зеркальные;
//   3. перевес линии — доля силы одной стороны против другой по индексам её
//      героев; это доля, а не букмекерская вероятность;
//   4. общая оценка — среднее по шести осям (фарм, драка, давление, поддержка,
//      темп, синергия пар), где каждая — тоже доля силы; ось без данных
//      выпадает из среднего, а не тянет его нулём.

import type { MatchPlayer } from './types'
import { AXES, heroIndex, pairSynergy, roleOf, type Profile } from './heroProfile'

export type LaneCall = {
  key: string
  label: string
  note: string
  radiant: MatchPlayer[]
  dire: MatchPlayer[]
  pairs: { radiant: MatchPlayer | null; dire: MatchPlayer | null }[]
  /** доля силы Radiant на линии, 0…1; null — героев с профилем слишком мало */
  share: number | null
  rIndex: number
  dIndex: number
  coverage: number
}

export type RatingAxis = {
  key: string
  label: string
  detail: string
  rValue: number
  dValue: number
  share: number
  games: number
}

export type HeroRating = {
  player: MatchPlayer
  role: number
  roleFromReplay: boolean
  index: number | null
  axes: Record<string, number>
  games: number
}

export type DraftRating = {
  generated: string
  corpus: number
  minPairGames: number
  lanes: LaneCall[]
  axes: RatingAxis[]
  synergy: { r: number | null; d: number | null; games: number }
  total: { radiant: number; dire: number }
  heroes: HeroRating[]
  /** линии взяты из разобранного реплея, а не из порядка фарма */
  realLanes: boolean
}

/** Коридор карты: наша лёгкая линия — это их сложная. */
const LANES: { key: string; label: string; note: string; radiant: string; dire: string }[] = [
  { key: 'safelane', label: 'Линия керри', note: 'наш керри и его саппорт против их оффлейнера', radiant: 'safelane', dire: 'offlane' },
  { key: 'mid', label: 'Мид', note: 'мидер против мидера', radiant: 'mid', dire: 'mid' },
  { key: 'offlane', label: 'Линия оффлейна', note: 'наш оффлейнер против их керри', radiant: 'offlane', dire: 'safelane' },
]

/** Роль → коридор: 1 и 5 стоят на лёгкой, 2 в миде, 3 и 4 на сложной. */
const laneKey = (p: MatchPlayer, role: number): string =>
  p.lane ?? (role === 2 ? 'mid' : role === 1 || role === 5 ? 'safelane' : 'offlane')

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export function evaluateDraft(profile: Profile, players: MatchPlayer[]): DraftRating | null {
  const radiant = players.filter((p) => p.isRadiant)
  const dire = players.filter((p) => !p.isRadiant)
  if (radiant.length !== 5 || dire.length !== 5) return null

  const roles = new Map<MatchPlayer, number>()
  for (const side of [radiant, dire]) for (const p of side) roles.set(p, roleOf(p, side))
  const indexes = new Map<MatchPlayer, ReturnType<typeof heroIndex>>()
  for (const p of players) indexes.set(p, heroIndex(profile, p.heroId, roles.get(p)!))

  const heroes: HeroRating[] = players.map((p) => {
    const idx = indexes.get(p)
    return {
      player: p,
      role: roles.get(p)!,
      roleFromReplay: p.position >= 1 && p.position <= 5,
      index: idx ? idx.total : null,
      axes: idx?.axes ?? {},
      games: idx?.games ?? 0,
    }
  })

  // --- линии
  const realLanes = players.some((p) => p.lane)
  const lanes: LaneCall[] = LANES.map((lane) => {
    const r = radiant.filter((p) => laneKey(p, roles.get(p)!) === lane.radiant)
    const d = dire.filter((p) => laneKey(p, roles.get(p)!) === lane.dire)
    const cores = (side: MatchPlayer[]) => [...side].sort((a, b) => roles.get(a)! - roles.get(b)!)
    const rSorted = cores(r)
    const dSorted = cores(d)
    const pairs = Array.from({ length: Math.max(rSorted.length, dSorted.length) }, (_, i) => ({
      radiant: rSorted[i] ?? null,
      dire: dSorted[i] ?? null,
    }))
    const value = (side: MatchPlayer[]) => {
      const known = side.map((p) => indexes.get(p)).filter((x): x is NonNullable<typeof x> => !!x)
      return {
        index: known.length ? known.reduce((a, b) => a + b.total, 0) / known.length : null,
        coverage: side.length ? known.length / side.length : 0,
      }
    }
    const rv = value(r)
    const dv = value(d)
    const share = rv.index !== null && dv.index !== null && rv.coverage >= 0.5 && dv.coverage >= 0.5
      ? rv.index / (rv.index + dv.index)
      : null
    return {
      key: lane.key,
      label: lane.label,
      note: lane.note,
      radiant: rSorted,
      dire: dSorted,
      pairs,
      share,
      rIndex: rv.index ?? 0,
      dIndex: dv.index ?? 0,
      coverage: Math.min(rv.coverage, dv.coverage),
    }
  }).filter((l) => l.radiant.length || l.dire.length)

  // --- оси по всей команде
  const axes: RatingAxis[] = AXES.map((axis) => {
    const side = (team: MatchPlayer[]) => {
      const values = team.map((p) => indexes.get(p)?.axes?.[axis.key]).filter((v): v is number => typeof v === 'number')
      const games = team.reduce((n, p) => n + (indexes.get(p)?.games ?? 0), 0)
      return { value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, games, n: values.length }
    }
    const r = side(radiant)
    const d = side(dire)
    if (r.value === null || d.value === null || r.n < 4 || d.n < 4) return null
    return {
      key: axis.key,
      label: axis.label,
      detail: axis.detail,
      rValue: r.value,
      dValue: d.value,
      share: r.value / (r.value + d.value),
      games: r.games + d.games,
    }
  }).filter(Boolean) as RatingAxis[]

  // --- синергия пар: только те, что у нас встречались достаточно часто
  const syn = (team: MatchPlayer[]) => {
    const lifts: number[] = []
    let games = 0
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        const a = team[i]
        const b = team[j]
        const soloA = profile.hero[String(a.heroId)]?.all?.winRate ?? 0.5
        const soloB = profile.hero[String(b.heroId)]?.all?.winRate ?? 0.5
        const s = pairSynergy(profile, a.heroId, b.heroId, soloA, soloB)
        if (!s) continue
        lifts.push(s.lift)
        games += s.games
      }
    }
    const m = mean(lifts)
    return { value: m === null ? null : 1 + 2 * m, games, pairs: lifts.length }
  }
  const rSyn = syn(radiant)
  const dSyn = syn(dire)
  const synergy = { r: rSyn.value, d: dSyn.value, games: rSyn.games + dSyn.games }
  if (rSyn.value !== null && dSyn.value !== null && rSyn.pairs >= 2 && dSyn.pairs >= 2) {
    axes.push({
      key: 'synergy',
      label: 'Синергия пар',
      detail: 'как пары этих героев выигрывают в нашей базе против их же героев поодиночке',
      rValue: rSyn.value,
      dValue: dSyn.value,
      share: rSyn.value / (rSyn.value + dSyn.value),
      games: synergy.games,
    })
  }

  const totalShare = mean(axes.map((a) => a.share)) ?? 0.5
  return {
    generated: profile.generated,
    corpus: profile.meta.matches,
    minPairGames: profile.meta.minPairGames,
    lanes,
    axes,
    synergy,
    total: { radiant: totalShare * 100, dire: (1 - totalShare) * 100 },
    heroes,
    realLanes,
  }
}

/** Вердикт по перевесу: до 57% против 43% считаем равным — спор о десятых долях бесполезен. */
export function callShare(share: number | null): { text: string; tone: 'pos' | 'neg' | 'dim' } {
  if (share === null) return { text: 'данных не хватает', tone: 'dim' }
  const pct = share * 100
  if (pct >= 57) return { text: 'перевес Radiant', tone: 'pos' }
  if (pct <= 43) return { text: 'перевес Dire', tone: 'neg' }
  return { text: 'равные', tone: 'dim' }
}
