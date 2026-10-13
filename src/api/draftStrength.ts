// «Кто сильнее на бумаге»: пять осей, каждая — из измеренных чисел STRATZ
// (файл server/data/constants/draft_data.json, собранный scripts/build-draft-data.mjs).
//
// Никаких наших весов: каждая ось — это винрейт, который STRATZ насчитал по
// своим разборам реплеев, а между командами считается как край относительно 50.
// Где выборки нет — оси просто нет.
//
//   лайнинг            — исход линии герой против героя
//   синергия линий     — исход линии двух героев, стоявших в одном коридоре
//   синергия состава   — винрейт пары в одной команде против их собственных
//                        базовых винрейтов
//   контры             — винрейт команды с героем против конкретного героя
//   рост к 35-й        — нетворс героя к 35-й минуте против среднего по позиции
//
// Итог — среднее по осям с весом «доля посчитанных пар»: ось, по которой
// данных наполовину, тянет вердикт вдвое слабее. Это единственное решение,
// которое здесь принимается, и оно написано в подписи под блоком.

import type { MatchPlayer } from './types'
import { laneOf } from './draft'

type LaneRow = [number, number, number, number]
type PairRow = [number, number, number]

export type DraftData = {
  v: number
  generated: string
  source: string
  min: { lane: number; pair: number }
  laneVs: Record<string, Record<string, LaneRow[]>>
  laneWith: Record<string, LaneRow[]>
  pairWith: Record<string, PairRow[]>
  pairVs: Record<string, PairRow[]>
  curve: Record<string, Record<string, number[]>>
  base: Record<string, Record<string, [number, number]>>
}

let promise: Promise<DraftData | null> | null = null

export function getDraftData(): Promise<DraftData | null> {
  if (promise) return promise
  promise = import('../../server/data/constants/draft_data.json')
    .then((m) => m.default as unknown as DraftData)
    .catch(() => null)
  return promise
}

/** Исход линии: победа = 1, ничья = 0.5. */
function laneRate(row: LaneRow | undefined) {
  if (!row) return null
  const [, w, l, d] = row
  const total = w + l + d
  return total > 0 ? { value: (w + d / 2) / total, sample: total } : null
}

const mainPosition = (data: DraftData, hero: number) => {
  const b = data.base[String(hero)] ?? {}
  let best = 0
  let matches = -1
  for (const [pos, [m]] of Object.entries(b)) if (m > matches) { matches = m; best = Number(pos) }
  return best
}

/** Строка линии героя против героя: точная позиция, иначе его основная. */
function laneRow(data: DraftData, hero: number, position: number, other: number) {
  const byPos = data.laneVs[String(hero)]
  if (!byPos) return undefined
  const exact = byPos[String(position)]?.find((r) => r[0] === other)
  if (exact) return exact
  const home = String(mainPosition(data, hero))
  return byPos[home]?.find((r) => r[0] === other)
}

const pairRow = (rows: PairRow[] | undefined, other: number) => rows?.find((r) => r[0] === other)

/** Базовый винрейт героя на его позиции в этом матче. */
function baseWin(data: DraftData, hero: number, position: number) {
  const b = data.base[String(hero)]
  if (!b) return null
  const own = b[String(position)] ?? b[String(mainPosition(data, hero))]
  if (!own || !own[0]) return null
  return own[1] / own[0]
}

/** Нетворс героя к минуте относительно среднего по его позиции. */
function farmShare(data: DraftData, hero: number, position: number, minute: number, field: Map<string, number>) {
  const key = String(hero)
  const pos = String(position || mainPosition(data, hero))
  const curve = data.curve[key]?.[pos] ?? data.curve[key]?.[String(mainPosition(data, hero))]
  if (!curve) return null
  const nw = curve[Math.round(minute / 5)]
  const avg = field.get(pos) ?? field.get(String(mainPosition(data, hero)))
  if (!nw || !avg) return null
  return nw / avg
}

/** Средний нетворс по позиции к минуте — знаменатель для доли фарма. */
export function fieldAverages(data: DraftData, minute: number): Map<string, number> {
  const idx = Math.round(minute / 5)
  const sums = new Map<string, { nw: number; n: number }>()
  for (const [hero, byPos] of Object.entries(data.curve)) {
    for (const [pos, curve] of Object.entries(byPos)) {
      const nw = curve?.[idx]
      const matches = data.base[hero]?.[pos]?.[0] ?? 0
      if (!nw || matches < 200) continue
      const acc = sums.get(pos) ?? { nw: 0, n: 0 }
      acc.nw += nw * matches
      acc.n += matches
      sums.set(pos, acc)
    }
  }
  const out = new Map<string, number>()
  for (const [pos, { nw, n }] of sums) if (n) out.set(pos, nw / n)
  return out
}

export type Axis = {
  key: string
  label: string
  detail: string
  /** край Radiant в пунктах винрейта: + значит Radiant сильнее */
  edge: number
  /** сколько пар удалось посчитать с обеих сторон */
  pairs: number
  /** сколько матчей и линий за этими числами стоит */
  sample: number
  /** доля пар этого типа, по которым нашлись данные */
  coverage: number
}

export type HeroPower = {
  player: MatchPlayer
  /** винрейт линии против её конкретного соперника */
  laning: number | null
  /** нетворс к 35-й минуте против среднего по позиции */
  late: number | null
  /** прирост винрейта рядом с соседями по команде, пункты */
  synergy: number | null
  /** винрейт против героев другой команды, пункты к 50 */
  counter: number | null
}

export type DraftPower = {
  generated: string
  axes: Axis[]
  /** среднее по осям с весом по доле посчитанных пар, пункты винрейта */
  total: number
  heroes: HeroPower[]
  missing: string[]
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Накапливает край одной стороны: пары, измерения и среднее. */
type Bucket = { edges: number[]; pairs: number; sample: number }
const bucket = (): Bucket => ({ edges: [], pairs: 0, sample: 0 })

/**
 * Оценка состава матча. Линии берутся из `laneOf` — то есть из разобранного
 * реплея; без него ось лайнинга честно не появляется.
 */
export function rateDraft(data: DraftData, players: MatchPlayer[]): DraftPower | null {
  const radiant = players.filter((p) => p.isRadiant)
  const dire = players.filter((p) => !p.isRadiant)
  if (radiant.length !== 5 || dire.length !== 5) return null
  const field15 = fieldAverages(data, 15)
  const field35 = fieldAverages(data, 35)

  // --- лайнинг: пары «кто против кого» из линий этого матча
  const laning = bucket()
  let laningTotal = 0
  for (const p of radiant) {
    const key = laneOf(p)
    if (!key) continue
    for (const foe of dire.filter((q) => laneOf(q) === key)) {
      laningTotal++
      const mine = laneRate(laneRow(data, p.heroId, p.position, foe.heroId))
      const theirs = laneRate(laneRow(data, foe.heroId, foe.position, p.heroId))
      if (!mine && !theirs) continue
      const mineRate = mine ? mine.value : 1 - (theirs?.value ?? 0.5)
      const theirsRate = theirs ? theirs.value : 1 - (mine?.value ?? 0.5)
      laning.edges.push((mineRate + (1 - theirsRate)) / 2 - 0.5)
      laning.pairs++
      laning.sample += Math.max(mine?.sample ?? 0, theirs?.sample ?? 0)
    }
  }

  // --- синергия линий: как пары в одном коридоре выигрывают свою линию
  const laneSyn = { r: bucket(), d: bucket() }
  let laneSynTotal = 0
  for (const side of [radiant, dire]) {
    const into = side === radiant ? laneSyn.r : laneSyn.d
    const byLane = new Map<string, MatchPlayer[]>()
    for (const p of side) {
      const key = laneOf(p)
      if (key) byLane.set(key, [...(byLane.get(key) ?? []), p])
    }
    for (const group of byLane.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          laneSynTotal++
          const a = laneRate((data.laneWith[String(group[i].heroId)] ?? []).find((r) => r[0] === group[j].heroId))
          const b = laneRate((data.laneWith[String(group[j].heroId)] ?? []).find((r) => r[0] === group[i].heroId))
          const values = [a, b].filter(Boolean) as { value: number; sample: number }[]
          const v = mean(values.map((x) => x.value))
          if (v === null) continue
          into.edges.push(v)
          into.pairs++
          into.sample += Math.max(...values.map((x) => x.sample))
        }
      }
    }
  }

  // --- синергия состава: прирост пары над винрейтами её же героев
  const teamSyn = (side: MatchPlayer[]) => {
    const out = bucket()
    for (let i = 0; i < side.length; i++) {
      for (let j = i + 1; j < side.length; j++) {
        const a = side[i]
        const b = side[j]
        const row = pairRow(data.pairWith[String(a.heroId)], b.heroId) ?? pairRow(data.pairWith[String(b.heroId)], a.heroId)
        const ba = baseWin(data, a.heroId, a.position)
        const bb = baseWin(data, b.heroId, b.position)
        if (!row || ba === null || bb === null) continue
        out.edges.push(row[1] / row[2] - (ba + bb) / 2)
        out.pairs++
        out.sample += row[2]
      }
    }
    return out
  }
  const synR = teamSyn(radiant)
  const synD = teamSyn(dire)

  // --- контры: винрейт против каждого конкретного врага
  const counters = bucket()
  let countersTotal = 0
  for (const a of radiant) {
    for (const b of dire) {
      countersTotal++
      const ra = pairRow(data.pairVs[String(a.heroId)], b.heroId)
      const rb = pairRow(data.pairVs[String(b.heroId)], a.heroId)
      if (!ra && !rb) continue
      const mine = ra ? ra[1] / ra[2] : 1 - (rb ? rb[1] / rb[2] : 0.5)
      const theirs = rb ? rb[1] / rb[2] : 1 - (ra ? ra[1] / ra[2] : 0.5)
      counters.edges.push((mine + (1 - theirs)) / 2 - 0.5)
      counters.pairs++
      counters.sample += Math.max(ra?.[2] ?? 0, rb?.[2] ?? 0)
    }
  }

  // --- рост к 35-й минуте
  const scaling = (side: MatchPlayer[]) => {
    let total = 0
    let n = 0
    let sample = 0
    for (const p of side) {
      const late = farmShare(data, p.heroId, p.position, 35, field35)
      const early = farmShare(data, p.heroId, p.position, 15, field15)
      if (late === null || early === null || !early) continue
      total += late / early
      sample += data.base[String(p.heroId)]?.[String(p.position)]?.[0] ?? 0
      n++
    }
    return { total, n, sample }
  }
  const lateR = scaling(radiant)
  const lateD = scaling(dire)

  const axes: Axis[] = []
  const missing: string[] = []
  const push = (key: string, label: string, detail: string, edge: number | null, pairs: number, sample: number, coverage: number) => {
    if (edge === null || !Number.isFinite(edge) || pairs === 0) { missing.push(label); return }
    axes.push({ key, label, detail, edge: edge * 100, pairs, sample: Math.round(sample), coverage })
  }

  push('laning', 'Лайнинг', 'исход линии против конкретного героя', mean(laning.edges), laning.pairs, laning.sample, laningTotal ? laning.pairs / laningTotal : 0)
  push(
    'laneSynergy', 'Синергия линий', 'как пары в одном коридоре выигрывают линию',
    laneSyn.r.pairs && laneSyn.d.pairs ? mean(laneSyn.r.edges)! - mean(laneSyn.d.edges)! : null,
    laneSyn.r.pairs + laneSyn.d.pairs, laneSyn.r.sample + laneSyn.d.sample,
    laneSynTotal ? (laneSyn.r.pairs + laneSyn.d.pairs) / laneSynTotal : 0,
  )
  push(
    'teamSynergy', 'Синергия состава', 'винрейт пары в одной команде против её же героев',
    synR.pairs && synD.pairs ? mean(synR.edges)! - mean(synD.edges)! : null,
    synR.pairs + synD.pairs, synR.sample + synD.sample, (synR.pairs + synD.pairs) / 20,
  )
  push('counters', 'Контры', 'все 25 пар «наш герой против их героя»', mean(counters.edges), counters.pairs, counters.sample, countersTotal ? counters.pairs / countersTotal : 0)
  push(
    'late', 'Рост к 35-й', 'нетворс против среднего по позиции: 15-я минута → 35-я',
    lateR.n === 5 && lateD.n === 5 && lateR.total + lateD.total > 0 ? lateR.total / (lateR.total + lateD.total) - 0.5 : null,
    lateR.n + lateD.n, lateR.sample + lateD.sample, (lateR.n + lateD.n) / 10,
  )

  const weight = sum(axes.map((a) => a.coverage))
  const total = weight ? sum(axes.map((a) => a.edge * a.coverage)) / weight : 0

  const heroes: HeroPower[] = players.map((p) => {
    const foes = players.filter((q) => q.isRadiant !== p.isRadiant && laneOf(q) === laneOf(p))
    const laningVals = foes
      .map((foe) => laneRate(laneRow(data, p.heroId, p.position, foe.heroId)))
      .filter(Boolean) as { value: number }[]
    const synVals = players
      .filter((q) => q.isRadiant === p.isRadiant && q !== p)
      .map((a) => {
        const row = pairRow(data.pairWith[String(p.heroId)], a.heroId) ?? pairRow(data.pairWith[String(a.heroId)], p.heroId)
        const ba = baseWin(data, p.heroId, p.position)
        const bb = baseWin(data, a.heroId, a.position)
        return row && ba !== null && bb !== null ? row[1] / row[2] - (ba + bb) / 2 : null
      })
      .filter((x): x is number => x !== null)
    const cntVals = players
      .filter((q) => q.isRadiant !== p.isRadiant)
      .map((e) => {
        const row = pairRow(data.pairVs[String(p.heroId)], e.heroId)
        return row ? row[1] / row[2] - 0.5 : null
      })
      .filter((x): x is number => x !== null)
    return {
      player: p,
      laning: mean(laningVals.map((x) => x.value)),
      late: farmShare(data, p.heroId, p.position, 35, field35),
      synergy: mean(synVals),
      counter: mean(cntVals),
    }
  })

  return { generated: data.generated, axes, total, heroes, missing }
}
