import type { LaneCall } from './draftStrength'
import type { MapPlay, MatchPlayer } from './types'
import type { MatchTimeline, RankedTeamfight } from './timeline'
import { fmtDuration } from './formats'
import { trainingFacts } from './training'

export interface CoachNote {
  title: string
  fact: string
  advice: string
  status: 'review' | 'good' | 'info'
  t?: number
  play?: MapPlay
}

export const earlyPhase = (p: MatchPlayer) => p.impactPhases?.find(x => x.label.startsWith('Начало')) ?? null

export function laneMeasurements(lane: LaneCall) {
  const totals = (players: MatchPlayer[]) => {
    const phases = players.map(earlyPhase)
    if (!phases.length || phases.some(p => !p)) return null
    return phases.reduce((s, p) => ({ gold: s.gold + p!.gold, experience: s.experience + p!.experience, lastHits: s.lastHits + p!.lastHits, deaths: s.deaths + p!.deaths }), { gold: 0, experience: 0, lastHits: 0, deaths: 0 })
  }
  const r = totals(lane.radiant), d = totals(lane.dire)
  return r && d ? { r, d } : null
}

function episodeNote(play: MapPlay): CoachNote {
  const f = play.facts
  const count = `Подтверждённое участие в убийствах: ${f.kills ?? 0}. Свои смерти: ${f.deaths ?? 0}`
  const outnumbered = f.allies != null && f.enemies != null && f.enemies > f.allies
  if (play.kind === 'objective') return {
    title: f.destroyed ? 'Урон превратился в объект' : 'Объект остался цел', status: f.destroyed ? 'good' : 'info', t: play.t, play,
    fact: `${f.damage ?? 0} урона по строению; ${f.destroyed ? 'оно уничтожено в течение 30 секунд' : 'быстрого уничтожения не зафиксировано'}.`,
    advice: f.destroyed ? 'Это подтверждённое продвижение по карте. Сохрани этот эпизод как пример того, что удалось.' : 'Проверь, удалось ли этим давлением отвлечь соперников. Сам по себе урон ещё не доказывает пользу или ошибку.',
  }
  return {
    title: outnumbered && (f.deaths ?? 0) > 0 ? 'Смерть при меньшей группе рядом' : play.verdict < 0 ? 'Размен оказался отрицательным' : play.verdict > 0 ? 'Выход дал результат' : 'Равный размен',
    status: play.verdict < 0 ? 'review' : play.verdict > 0 ? 'good' : 'info', t: play.t, play,
    fact: `${count}. Перед эпизодом рядом: союзных героев с игроком — ${f.allies ?? 'неизвестно'}, вражеских — ${f.enemies ?? 'неизвестно'}. Перевес команды: ${play.teamGold >= 0 ? '+' : ''}${play.teamGold.toLocaleString('ru-RU')} золота.`,
    advice: outnumbered && (f.deaths ?? 0) > 0
      ? 'Проверь момент сближения по маршруту: могли ли союзники подключиться раньше? Если выход был добровольным и без цели размена, дождись команды перед следующим входом. Снимок позиций не показывает видимость и не доказывает, что ты знал о врагах.'
      : play.verdict < 0 ? 'Разбери, ради какой цели ты оставался в зоне боя и был ли путь отхода. Отрицательный результат сам по себе не доказывает неправильное решение.'
        : play.verdict > 0 ? 'Участие подтверждено событиями и координатами. Проверь, за счёт какого подхода удалось реализовать этот выход.' : 'Убийства и смерти уравновесились. Чтобы оценить решение, нужны цель выхода и доступные альтернативы.',
  }
}

export function reviewLane(player: MatchPlayer, lane: LaneCall | null, timeline: MatchTimeline | null): CoachNote[] {
  const notes: CoachNote[] = trainingFacts(player, 600).filter(n=>n.section === 'lane')
  const early = earlyPhase(player)
  if (!early) return [{ title: 'Начало игры ещё не измерено', status: 'info', fact: 'В данных нет первых десяти минут этого игрока.', advice: 'После разбора реплея здесь появятся фарм, опыт и эпизоды. Финальные показатели не заменяют результат линии.' }]
  if (lane) {
    const totals = laneMeasurements(lane)
    if (totals) {
      const own = player.isRadiant ? totals.r : totals.d, enemy = player.isRadiant ? totals.d : totals.r
      const lostXp = enemy.experience - own.experience, lostGold = enemy.gold - own.gold
      notes.push({ title: lostXp > 0 && lostGold > 0 ? 'Линия просела по опыту и золоту' : 'Фарм и опыт нужно смотреть отдельно', status: lostXp > 0 && lostGold > 0 ? 'review' : 'info',
        fact: `К 10-й минуте у твоей группы ${own.gold.toLocaleString('ru-RU')} золота и ${own.experience.toLocaleString('ru-RU')} опыта; у группы соперников — ${enemy.gold.toLocaleString('ru-RU')} и ${enemy.experience.toLocaleString('ru-RU')}. Лично у тебя: добивания — ${early.lastHits}, смерти — ${early.deaths}.`,
        advice: lostXp > 0 ? 'Проверь промежутки между смертями и возвращением к крипам: где ты терял опыт, а где команда уходила на другую цель. Суммы группы не позволяют назначить виноватого.' : 'Сравни получение опыта и добивания с конкретными выходами. Хороший фарм одного героя ещё не означает победу всей группы на линии.' })
    }
  }
  const deaths = timeline?.kills.filter(k => k.t >= 0 && k.t < 600 && k.victimHeroId === player.heroId) ?? []
  if (deaths.length) notes.push({ title: 'Моменты, с которых начать просмотр', status: 'review', t: deaths[0].t,
    fact: `Смерти до 10:00: ${deaths.map(k => fmtDuration(k.t)).join(', ')}.`,
    advice: 'Начни за 15 секунд до каждой смерти: проверь дистанцию до партнёра, численность и возможность отойти. Эти события подтверждены; причина смерти требует просмотра эпизода.' })
  const episodes = player.mapPlays?.episodes.filter(e => e.t >= 0 && e.t < 600 && e.kind !== 'pressure') ?? []
  notes.push(...episodes.filter(e => e.verdict < 0).slice(0, 2).map(episodeNote))
  const good = episodes.find(e => e.verdict > 0)
  if (good) notes.push(episodeNote(good))
  return notes
}

export function reviewFight(player: MatchPlayer, fight: RankedTeamfight, timeline: MatchTimeline, slot: number): CoachNote[] {
  const line = fight.lines?.find(l => l.slot === slot)
  const notes: CoachNote[] = [{ title: 'Что изменилось после боя', status: 'info', t: fight.t,
    fact: `Счёт убийств Radiant ${fight.radiantKills}:${fight.direKills} Dire. ${fight.reasons.join(' ')}`,
    advice: 'Это объясняет, почему бой попал в разбор. События после него могли зависеть и от других действий на карте.' }]
  if (!line) return [...notes, { title: 'Личный вклад не записан', status: 'info', fact: 'В этом разборе нет строк участников драки.', advice: 'Нужен повторный разбор реплея; по итоговым KDA вклад в этот бой не восстановить.' }]
  notes.push({ title: 'Твой результат в этой драке', status: line.deaths > line.kills ? 'review' : 'info',
    fact: `${line.kills} убийств, ${line.deaths} смертей, ${line.damage.toLocaleString('ru-RU')} урона, ${line.healing.toLocaleString('ru-RU')} лечения; изменение золота ${line.gold >= 0 ? '+' : ''}${line.gold}.`,
    advice: line.deaths === 0 && line.damage === 0 && line.kills === 0 && line.healing === 0 ? 'Участие уроном или лечением не зафиксировано. Проверь, был ли ты на другой цели; это ещё не означает, что следовало прийти.' : 'Оцени порядок действий, а не только объём урона: успел ли ты реализовать свою задачу до смерти или отхода?' })
  const deaths = timeline.kills.filter(k => k.t >= fight.t && k.t <= fight.end && k.victimHeroId === player.heroId)
  const measured = player.evidence?.fights?.find(f=>Math.abs(f.t-fight.t)<5)
  if(measured) notes.push({title:'Способности и предметы в этом бою',status:'info',t:fight.t,
    fact:`Способности: ${Object.entries(measured.abilities??{}).map(([k,v])=>`${k} ×${v}`).join(', ')||'не записаны'}. Предметы: ${Object.entries(measured.items??{}).map(([k,v])=>`${k} ×${v}`).join(', ')||'не записаны'}.`,
    advice:'Сравни применение с задачей героя. Неиспользованная способность — повод проверить дальность, ману и готовность; журнал применений не доказывает, что её можно было нажать.'})
  const first = timeline.kills.find(k => k.t >= fight.t && k.t <= fight.end)
  if (first && first.victimHeroId === player.heroId) notes.push({ title: 'Ты погиб первым в этом бою', status: 'review', t: first.t,
    fact: `Первая зафиксированная смерть — твоя, на ${fmtDuration(first.t)}.`,
    advice: 'Проверь подход и дистанцию до команды. Для инициатора первая смерть могла быть частью размена; для героя, которому нужно наносить урон издали, это повод пересмотреть позицию.' })
  if (line.buybacks > 0) notes.push({ title: deaths.length >= 2 ? 'Байбек и повторная смерть в том же бою' : 'В этом бою потрачен байбек', status: 'review', t: deaths.at(-1)?.t,
    fact: `${line.buybacks} байбеков; ${deaths.length} смертей за окно боя. Точное время байбека в этих данных не записано.`,
    advice: 'Проверь, какую цель защищал возврат и успевала ли подключиться команда. Повторные смерти здесь не доказывают, что следующая случилась именно после байбека.' })
  const episodes = player.mapPlays?.episodes.filter(e => e.kind !== 'pressure' && e.t <= fight.end && e.end >= fight.t) ?? []
  notes.push(...episodes.slice(0, 3).map(episodeNote))
  return notes
}

export function reviewMatch(player: MatchPlayer, duration = 2500, opponents: MatchPlayer[] = []): CoachNote[] {
  const plays = player.mapPlays
  const training = trainingFacts(player,duration,opponents).filter(n=>n.section!=='lane')
  if (!plays) return [...training, { title: 'Маршруты ещё не разобраны', status: 'info', fact: 'В этом матче нет сохранённых эпизодов движения игрока.', advice: 'Когда появится пространственный разбор реплея, Эдик сможет сопоставить подходы, размены и объекты.' }]
  const negative = plays.episodes.filter(e => e.verdict < 0).slice(0, 3)
  const positive = plays.episodes.filter(e => e.verdict > 0).sort((a, b) => Number(b.kind === 'objective') - Number(a.kind === 'objective')).slice(0, 2)
  return [{ title: 'В каких условиях ты играл', status: 'info', fact: `К 15:00 перевес команды ${plays.teamGoldAt15 >= 0 ? '+' : ''}${plays.teamGoldAt15.toLocaleString('ru-RU')} золота. Разобрано ${Math.round(plays.coverage * 100)}% координатных отсчётов.`, advice: 'Отставание команды — контекст для решений. Оно не делает каждый риск ошибкой, а итог матча не перечёркивает полезные действия.' }, ...training, ...negative.map(episodeNote), ...positive.map(episodeNote)]
}
