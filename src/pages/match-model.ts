// Производные величины страницы матча: суммы по командам, лучшие в категориях,
// текстовые выводы. Считаются один раз на рендер из уже загруженного матча,
// новых запросов не делают.

import type { MatchDetails, MatchPlayer } from '../api/types'
import type { MatchTimeline } from '../api/timeline'
import { peakAdvantage, rankTeamfights, turningPoint } from '../api/timeline'
import { fmtDuration } from '../api/formats'
import type { ImpactScore } from '../api/score'

export type StatKey = 'networth' | 'goldPerMinute' | 'experiencePerMinute' | 'numLastHits' | 'heroDamage' | 'towerDamage' | 'heroHealing' | 'kills' | 'assists'

export const STAT_LABEL: Record<StatKey, string> = {
  networth: 'Нетворт',
  goldPerMinute: 'GPM',
  experiencePerMinute: 'XPM',
  numLastHits: 'LH',
  heroDamage: 'Урон героям',
  towerDamage: 'Башням',
  heroHealing: 'Лечение',
  kills: 'Убийства',
  assists: 'Ассисты',
}

export interface TeamSide {
  radiant: boolean
  label: 'Radiant' | 'Dire'
  players: MatchPlayer[]
  scores: (ImpactScore | null)[]
  kills: number
  networth: number
  lastHits: number
  heroDamage: number
  towerDamage: number
  heroHealing: number
  experience: number
  goldPerMinute: number
  impactTotal: number
  mvp: { player: MatchPlayer; score: ImpactScore } | null
}

export interface MatchBoard {
  radiant: TeamSide
  dire: TeamSide
  sides: TeamSide[]
  /** steamAccountId героя → лучшая величина по категории внутри матча */
  best: Partial<Record<StatKey, number>>
  mvp: { player: MatchPlayer; score: ImpactScore; side: TeamSide } | null
  durationMinutes: number
}

function sideOf(match: MatchDetails, radiant: boolean, scores: (ImpactScore | null)[]): TeamSide {
  const players = match.players.filter((p) => p.isRadiant === radiant)
  const sum = (pick: (p: MatchPlayer) => number) => players.reduce((acc, p) => acc + pick(p), 0)
  let mvp: TeamSide['mvp'] = null
  players.forEach((player, i) => {
    const score = scores[i]
    if (score && (!mvp || score.value > mvp.score.value)) mvp = { player, score }
  })
  return {
    radiant,
    label: radiant ? 'Radiant' : 'Dire',
    players,
    scores,
    kills: sum((p) => p.kills),
    networth: sum((p) => p.networth),
    lastHits: sum((p) => p.numLastHits),
    heroDamage: sum((p) => p.heroDamage),
    towerDamage: sum((p) => p.towerDamage),
    heroHealing: sum((p) => p.heroHealing),
    experience: sum((p) => p.experiencePerMinute),
    goldPerMinute: sum((p) => p.goldPerMinute),
    impactTotal: scores.reduce<number>((acc, s) => acc + (s?.value ?? 0), 0),
    mvp,
  }
}

export function buildBoard(match: MatchDetails, scoreOf: (p: MatchPlayer) => ImpactScore | null): MatchBoard {
  const radiantScores = match.players.filter((p) => p.isRadiant).map(scoreOf)
  const direScores = match.players.filter((p) => !p.isRadiant).map(scoreOf)
  const radiant = sideOf(match, true, radiantScores)
  const dire = sideOf(match, false, direScores)

  const best: Partial<Record<StatKey, number>> = {}
  const keys = Object.keys(STAT_LABEL) as StatKey[]
  for (const key of keys) {
    let top = -1
    for (const p of match.players) if (p[key] > top) top = p[key]
    if (top > 0) best[key] = top
  }

  let mvp: MatchBoard['mvp'] = null
  for (const side of [radiant, dire]) {
    if (side.mvp && (!mvp || side.mvp.score.value > mvp.score.value)) mvp = { player: side.mvp.player, score: side.mvp.score, side }
  }

  return { radiant, dire, sides: [radiant, dire], best, mvp, durationMinutes: Math.max(match.durationSeconds / 60, 1) }
}

/** Доля стороны в общем по матчу значении — для зеркальных полос 0…100%. */
export function shareOf(radiant: number, dire: number) {
  const total = radiant + dire
  if (total <= 0) return { r: 50, d: 50 }
  return { r: (radiant / total) * 100, d: (dire / total) * 100 }
}

export function fmtK(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1000) return `${(n / 1000).toFixed(abs >= 10000 ? 1 : 2)}k`
  return String(Math.round(n))
}

/**
 * Как показать игрока. Steam не отдаёт аккаунты приватных игроков (0), а имя
 * может не дойти при сбое профиля — тогда подписываем героем, а не «#0».
 */
export function playerLabel(p: MatchPlayer, heroName?: string): string {
  if (p.name) return p.name
  if (p.steamAccountId) return `#${p.steamAccountId}`
  return heroName ?? 'Приватный игрок'
}

export function fmtSignedK(n: number): string {
  return `${n >= 0 ? '+' : '−'}${fmtK(Math.abs(n))}`
}

export interface Insight {
  tone: 'r' | 'd' | ''
  icon: 'trend' | 'crown' | 'sword' | 'rosh' | 'blood' | 'flame' | 'coin' | 'target'
  label: string
  value: string
  note: string
}

/** Короткие выводы: что реально решило катку. Порядок = важность. */
export function buildInsights(match: MatchDetails, board: MatchBoard, timeline: MatchTimeline | null, label: (p: MatchPlayer) => string): Insight[] {
  const out: Insight[] = []
  const winner = match.didRadiantWin ? board.radiant : board.dire
  const loser = match.didRadiantWin ? board.dire : board.radiant
  const tone = winner.radiant ? 'r' : 'd'

  const point = turningPoint(timeline)
  if (point) {
    out.push({
      tone: point.radiant ? 'r' : 'd',
      icon: 'trend',
      label: 'Переломный момент',
      value: fmtDuration(point.t),
      note: `${point.radiant ? 'Radiant' : 'Dire'} вышли в ${fmtSignedK(point.gold)} по золоту и удержали перевес до конца матча.`,
    })
  }

  const peak = peakAdvantage(timeline)
  if (peak && Math.abs(peak.gold) >= 1000) {
    out.push({
      tone: peak.radiant ? 'r' : 'd',
      icon: 'coin',
      label: 'Максимальный отрыв',
      value: `${fmtSignedK(peak.gold)} золота`,
      note: `Зафиксирован на ${fmtDuration(peak.t)}. Итог по нетворту — ${fmtK(Math.abs(winner.networth - loser.networth))} в пользу ${winner.label}.`,
    })
  }

  const ranked = rankTeamfights(timeline)
  const decisive = ranked[0]
  if (decisive && (decisive.swing == null || Math.abs(decisive.swing) >= 800)) {
    const side = decisive.winner === 'even' ? null : decisive.winner === 'radiant' ? board.radiant : board.dire
    out.push({
      tone: side ? (side.radiant ? 'r' : 'd') : '',
      icon: 'flame',
      label: 'Решающий тимфайт',
      value: fmtDuration(decisive.t),
      note: side
        ? `${side.label} выиграл драку ${decisive.radiantKills}:${decisive.direKills} и забрал ${fmtK(Math.abs(decisive.swing ?? decisive.deaths * 900))} золота — после неё игра пошла по-другому.`
        : `Драка ${decisive.radiantKills}:${decisive.direKills} при ${decisive.deaths} смертях — размен, но именно в ней преимущество перешло из рук в руки.`,
    })
  }

  if (board.mvp) {
    const { player, score } = board.mvp
    out.push({
      tone: player.isRadiant ? 'r' : 'd',
      icon: 'crown',
      label: 'MVP матча',
      value: label(player),
      note: `Импакт ${score.value > 0 ? '+' : ''}${score.value} при ${player.kills}/${player.deaths}/${player.assists} и ${fmtK(player.networth)} нетворта.`,
    })
  }

  const dmg = match.players.reduce((top, p) => (p.heroDamage > (top?.heroDamage ?? 0) ? p : top), match.players[0])
  if (dmg && dmg.heroDamage > 0) {
    out.push({
      tone: dmg.isRadiant ? 'r' : 'd',
      icon: 'sword',
      label: 'Больше всего урона',
      value: dmg.heroDamage.toLocaleString('ru-RU'),
      note: `${(dmg.heroDamage / board.durationMinutes).toFixed(0)} урона в минуту — ${(dmg.heroDamage / Math.max(winner.heroDamage + loser.heroDamage, 1) * 100).toFixed(0)}% всего урона по героям в матче.`,
    })
  }

  if (ranked.length > 1) {
    const wonR = ranked.filter((f) => f.radiantKills > f.direKills).length
    const wonD = ranked.filter((f) => f.direKills > f.radiantKills).length
    const lead = wonR === wonD ? null : wonR > wonD ? board.radiant : board.dire
    out.push({
      tone: lead ? (lead.radiant ? 'r' : 'd') : '',
      icon: 'target',
      label: 'Счёт по дракам',
      value: `${wonR} : ${wonD}`,
      note: `${ranked.length} потасовок от трёх смертей. ${lead ? `${lead.label} выиграл больше.` : 'Поровну — решающей стала одна, см. выше.'} Всего байбеков в них: ${ranked.reduce((sum, f) => sum + (f.buybacks ?? 0), 0)}.`,
    })
  }

  const roshans = timeline?.roshans ?? []
  if (roshans.length) {
    const r = roshans.filter((x) => x.radiant).length
    out.push({
      tone: r * 2 === roshans.length ? '' : r > roshans.length / 2 ? 'r' : 'd',
      icon: 'rosh',
      label: 'Рошан',
      value: `${r} : ${roshans.length - r}`,
      note: roshans.map((x) => `${x.radiant ? 'Radiant' : 'Dire'} — ${fmtDuration(x.t)}`).join(' · ') + '.',
    })
  }

  if (!point) {
    const tempo = (winner.kills + loser.kills) / board.durationMinutes
    out.push({
      tone,
      icon: 'target',
      label: 'Темп матча',
      value: `${tempo.toFixed(1)} убийств/мин`,
      note: `${winner.label} забрал ${winner.kills} из ${winner.kills + loser.kills} убийств и ${fmtK(winner.networth)} нетворта против ${fmtK(loser.networth)}.`,
    })
  }

  return out.slice(0, 4)
}

/**
 * Слот Valve по account_id: 0-4 Radiant, 128-132 Dire, порядок — как в players.
 * Совпадает с build-timeline.mjs, поэтому строки драк сходятся с ростером.
 */
export function slotOfPlayer(match: MatchDetails, steamAccountId: number): number | null {
  if (!steamAccountId) return null
  const player = match.players.find((p) => p.steamAccountId === steamAccountId)
  if (!player) return null
  const team = match.players.filter((p) => p.isRadiant === player.isRadiant)
  return (player.isRadiant ? 0 : 128) + team.indexOf(player)
}
