import type { MatchPlayer } from './types'
import { sampleAt } from './assessment'
import { deathDetail, heroName, itemById, itemName, rolePlan, spellName } from './training'
import { fmtDuration } from './formats'
import { NORM_LABELS, heroNorm, measuredValue, normsCohort, standing, standingRank } from './heroNorms'

// On-demand breakdown: every fact below is measured in the parsed replay.
// Where the replay cannot answer (vision, intent, creep availability) the note
// says so instead of guessing.
export interface DeepItem {
  id: string
  status: 'good' | 'review' | 'info'
  t: number | null
  title: string
  fact: string
  advice: string
}

export interface DeepSection {
  id: string
  title: string
  lead: string
  items: DeepItem[]
}

export interface DeepReview {
  lead: string
  sections: DeepSection[]
  gaps: string[]
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const list = (xs: number[]) => xs.map(Math.round).join(', ')
const gold = (value: number) => `${value >= 0 ? '+' : ''}${Number(value).toLocaleString('ru-RU')}`
// Minute marks include 0:00, where fmtDuration returns its "no data" dash.
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
const plural = (n: number, forms: [string, string, string]) => {
  const mod100 = n % 100, mod10 = n % 10
  const form = mod100 >= 11 && mod100 <= 14 ? forms[2] : mod10 === 1 ? forms[0] : mod10 >= 2 && mod10 <= 4 ? forms[1] : forms[2]
  return `${n} ${form}`
}
const lastHits = (n: number) => plural(n, ['добивание', 'добивания', 'добиваний'])
const deathsWord = (n: number) => plural(n, ['смерть', 'смерти', 'смертей'])
const usesWord = (n: number) => plural(n, ['применение', 'применения', 'применений'])
const fightsWord = (n: number) => plural(n, ['крупная драка', 'крупные драки', 'крупных драк'])

const DECIMAL_METRICS = new Set(['lhPerMin', 'heroDmgPerMin', 'towerDmgPerMin', 'deathsPer10'])
const formatMetric = (metric: string, value: number) => DECIMAL_METRICS.has(metric) ? value.toFixed(1) : Math.round(value).toLocaleString('ru-RU')

// The one comparison that does not depend on this match alone: how the same
// hero is played by stronger players in our own pool of parsed games.
function normSection(p: MatchPlayer, durationSeconds: number): DeepSection | null {
  const norm = heroNorm(p.heroId, p.position)
  if (!norm) return null
  const wanted = p.position >= 4
    ? ['gpm', 'xpm', 'heroDmgPerMin', 'deathsPer10']
    : ['gpm', 'lhPerMin', 'xpm', 'heroDmgPerMin', 'deathsPer10']
  const items: DeepItem[] = []
  for (const metric of wanted) {
    const percentiles = norm.metrics[metric]
    const value = measuredValue(p, metric, durationSeconds)
    const info = NORM_LABELS[metric]
    if (!percentiles || value == null || !info) continue
    const digits = DECIMAL_METRICS.has(metric) ? 1 : 0
    const rank = standingRank(percentiles, value, digits)
    const better = info.lowerIsBetter ? rank <= 1 : rank >= 4
    const worse = info.lowerIsBetter ? rank >= 4 : rank <= 1
    items.push({
      id: `norm-${metric}`, status: better ? 'good' : worse ? 'review' : 'info', t: null,
      title: `${info.name[0].toUpperCase()}${info.name.slice(1)}: ${formatMetric(metric, value)} против медианы ${formatMetric(metric, percentiles[2])}`,
      fact: `У тебя ${formatMetric(metric, value)}. По выборке ${plural(norm.n, ['игра', 'игры', 'игр'])} Ancient и выше на этом герое: 10-й перцентиль — ${formatMetric(metric, percentiles[0])}, 25-й — ${formatMetric(metric, percentiles[1])}, медиана — ${formatMetric(metric, percentiles[2])}, 75-й — ${formatMetric(metric, percentiles[3])}, 90-й — ${formatMetric(metric, percentiles[4])}. Твоё место: ${standing(percentiles, value, digits)}.`,
      advice: info.advice,
    })
  }
  if (!items.length) return null
  return {
    id: 'norm', title: 'Как на этом герое играют сильные',
    lead: norm.scope === 'position'
      ? `Позиция ${p.position}: ${norm.n} игр Ancient и выше на этом герое из нашей базы разобранных матчей (${normsCohort.players} игр всего).`
      : `Позиции объединены: ${norm.n} игр Ancient и выше на этом герое из нашей базы разобранных матчей (${normsCohort.players} игр всего). Для позиции ${p.position} отдельной выборки не набралось.`,
    items,
  }
}

function laneSection(p: MatchPlayer, opponents: MatchPlayer[]): DeepSection | null {
  const minutes = (p.evidence?.laneMinutes ?? []).filter(m => m.t < 600)
  if (!minutes.length) return null
  const totalLh = sum(minutes.map(m => m.lh)), totalXp = sum(minutes.map(m => m.xp))
  const totalDamage = sum(minutes.map(m => m.damage)), totalTaken = sum(minutes.map(m => m.taken))
  const items: DeepItem[] = [{
    id: 'lane-per-minute', status: 'info', t: null, title: 'Добивания и опыт по минутам',
    fact: `Добивания: ${list(minutes.map(m => m.lh))} — всего ${lastHits(totalLh)}. Опыт: ${list(minutes.map(m => m.xp))} — всего ${totalXp}. Урона по героям ${totalDamage}, получено ${totalTaken}. Живым на линии ${Math.round(sum(minutes.map(m => m.aliveSeconds)))} с из ${minutes.length * 60}.`,
    advice: 'Провал виден в конкретной минуте, а не в среднем. Останови реплей на самой слабой минуте и посмотри, что отвлекло: драка, ротация, отход или нехватка регена.',
  }]
  // Minute zero has no lane equilibrium yet, and a "worst minute" only means
  // something against this player's own normal pace.
  const candidates = minutes.filter(m => m.t >= 60 && m.aliveSeconds >= 45)
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }
  const worst = candidates.slice().sort((a, b) => a.lh - b.lh || b.taken - a.taken)[0]
  const typical = median(candidates.filter(m => m !== worst).map(m => m.lh))
  // Last hits are only a farm metric for cores; for supports one creep either
  // way says nothing, so the callout stays off.
  if (worst && p.position <= 3 && (worst.lh * 2 <= typical || (worst.lh === 0 && worst.attacks > 0))) items.push({
    id: `lane-worst-${worst.t}`, status: 'review', t: worst.t, title: `Худшая минута линии: ${clock(worst.t)}`,
    fact: `За ${clock(worst.t)}–${clock(worst.end)}: ${lastHits(worst.lh)} при ${worst.attacks} атаках по героям, ${worst.xp} опыта. Получено ${worst.taken} урона, живым ${worst.aliveSeconds} с. В остальные минуты линии было в среднем ${typical}.`,
    advice: worst.attacks > 0
      ? 'Атаки по герою не окупились добиваниями. Порядок действий на этой минуте: сначала крип, до которого враг не дотянется, потом размен. Если размен не закончился убийством, следующую волну ты встречаешь без маны и HP.'
      : 'Добиваний мало при почти нулевой активности по героям: значит ты либо отходил, либо не мог подойти к волне. Проверь HP и ману на этой минуте — скорее всего причина осталась в предыдущей.',
  })
  // Lane labels are relative to each player's own team: my safe lane is the
  // enemy off lane, so the direct opposite number carries the mirrored label.
  const rivalLane = p.lane === 'mid' ? 'mid' : p.lane === 'safelane' ? 'offlane' : 'safelane'
  const rivals = opponents.filter(o => p.lane && o.lane === rivalLane && (o.evidence?.laneMinutes?.length ?? 0) > 0)
  if (rivals.length) {
    const rival = rivals.map(o => {
      const own = (o.evidence!.laneMinutes ?? []).filter(m => m.t < 600)
      return { o, lh: sum(own.map(m => m.lh)), xp: sum(own.map(m => m.xp)) }
    }).sort((a, b) => Number(b.o.position === p.position) - Number(a.o.position === p.position)
      || Math.abs(a.o.position - p.position) - Math.abs(b.o.position - p.position) || b.lh - a.lh)[0]
    const diff = totalLh - rival.lh
    const sameRole = rival.o.position === p.position
    items.push({
      id: 'lane-rival', status: !sameRole ? 'info' : diff >= 0 ? 'good' : 'review', t: null, title: `Линия против ${heroName(rival.o.heroId)} · позиция ${rival.o.position}`,
      fact: `К 10:00 у тебя ${lastHits(totalLh)} и ${totalXp} опыта; у ${heroName(rival.o.heroId)} — ${rival.lh} и ${rival.xp} (позиция ${rival.o.position}). Разница по добиваниям: ${diff >= 0 ? '+' : ''}${diff}.`,
      advice: !sameRole
        ? `Прямого соперника на позиции ${p.position} в этой линии нет, поэтому разница добиваний здесь объясняется ролью, а не ошибкой. Смотри свой темп по минутам выше: там норма измеряется по твоей роли.`
        : diff < 0
          ? 'Отставание по добиваниям — самый проверяемый след линии. Найди минуты с наибольшей разницей и реши, чем она создана: твоими разменами, вытеснением с волны или пропущенным временем.'
          : 'Преимущество на линии чего-то стоит только если превратилось в предмет или уровень к своему таймингу. Сверь его с покупками ниже.',
    })
  }
  return { id: 'lane', title: 'Линия · 0–10 мин', lead: `Поминутные измерения, ${minutes.length} мин.${p.lane ? ` Линия: ${p.lane}.` : ' Линия по реплею не определена.'}`, items }
}

function deathsSection(p: MatchPlayer, opponents: MatchPlayer[]): DeepSection | null {
  const evidence = p.evidence
  if (!evidence) return null
  const deaths = evidence.deaths, windows = evidence.deathWindows ?? []
  // null means the replay was not parsed for deaths — silence is not a clean game.
  if (!deaths) return null
  if (!deaths.length) return {
    id: 'deaths', title: 'Смерти', lead: 'В разобранном реплее смертей этого игрока нет.', items: [{
      id: 'no-deaths', status: 'good', t: null, title: 'Смертей нет',
      fact: 'Ни одной смерти за матч — главный источник потери темпа отсутствует.',
      advice: 'Проверь обратную сторону: если драки проходили без тебя, осторожность могла стоить урона и объектов. Участие в драках разобрано ниже.',
    }],
  }
  let withWindow = 0
  const items = deaths.slice(0, 8).map(d => {
    const window = windows.find(x => Math.abs(x.t - d.t) < 4)
    const detail = window ? deathDetail(p, window, opponents) : null
    if (detail) withWindow++
    const cost = [d.goldFed != null ? `отдано ${d.goldFed} золота` : null, d.secondsDead != null ? `не играл ${Math.round(d.secondsDead)} с` : null].filter(Boolean).join(', ')
    return {
      id: `death-${d.t}`, status: 'review' as const, t: d.t, title: detail?.title ?? `Смерть на ${fmtDuration(d.t)}`,
      fact: `${detail ? `${detail.fact} ` : 'Окна в 20 секунд до смерти в этих данных нет: виден только факт, а не решение перед ним. '}${d.killer ? `Убийца: ${d.killer}. ` : ''}${cost ? `Цена эпизода: ${cost}.` : ''}`.trim(),
      advice: detail?.advice ?? 'Разобрать решение невозможно без окна перед смертью. Открой таймлайн на этой секунде и посмотри позицию вручную.',
    }
  })
  return { id: 'deaths', title: 'Смерти', lead: `Всего ${deaths.length}, разобрано ${items.length}; у ${withWindow} есть окно 20 секунд до смерти.`, items }
}

function abilitySection(p: MatchPlayer): DeepSection | null {
  const uses = p.evidence?.uses ?? []
  const fights = (p.evidence?.fights ?? []).filter(f => Object.keys(f.abilities ?? {}).length || Object.keys(f.items ?? {}).length)
  if (!uses.length && !fights.length) return null
  const items: DeepItem[] = []
  if (uses.length) {
    const counts = new Map<string, number>()
    for (const use of uses) counts.set(use.key, (counts.get(use.key) ?? 0) + 1)
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10)
    items.push({
      id: 'ability-counts', status: 'info', t: null, title: 'Что нажимал за матч',
      fact: `Записано ${uses.length} применений: ${top.map(([key, count]) => `${spellName(key)} ×${count}`).join(', ')}.`,
      advice: 'Смотри не на общий счёт, а на то, чего в списке нет или мало. Пустая строка по ключевой способности — повод проверить дальность, ману и момент, но журнал применений не доказывает, что её можно было нажать.',
    })
  }
  const itemUses = Object.entries(p.evidence?.itemUses ?? {}).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]).slice(0, 8)
  if (itemUses.length) items.push({
    id: 'item-uses', status: 'info', t: null, title: 'Активные предметы',
    fact: `Применения: ${itemUses.map(([key, count]) => `${itemName(key)} ×${count}`).join(', ')}.`,
    advice: 'Активный предмет — часть механики героя. Сопоставь применение с моментом драки: предмет, нажатый после того как бой решён, исход не меняет.',
  })
  if (fights.length) items.push({
    id: 'ability-fights', status: 'info', t: fights[0].t, title: 'Применения внутри драк',
    fact: fights.slice(0, 6).map(f => {
      const abilities = Object.entries(f.abilities ?? {}).map(([key, count]) => `${spellName(key)} ×${count}`).join(', ')
      const usedItems = Object.entries(f.items ?? {}).map(([key, count]) => `${itemName(key)} ×${count}`).join(', ')
      return `на ${fmtDuration(f.t)} способности: ${abilities || 'не записаны'}, предметы: ${usedItems || 'не записаны'}`
    }).join('; ') + '.',
    advice: 'Возьми самую проигранную драку из списка и проверь, были ли у тебя контроль и урон в руках в момент начала боя. Отсутствие записи о применении само по себе не доказывает готовность способности.',
  })
  return { id: 'abilities', title: 'Способности и предметы', lead: 'Журнал применений из разобранного реплея.', items }
}

function fightSection(p: MatchPlayer): DeepSection | null {
  const fights = p.evidence?.fights ?? []
  if (!fights.length) return null
  const involved = fights.filter(f => f.damage > 0 || f.healing > 0 || f.kills > 0 || f.deaths > 0 || f.firstCast)
  const items: DeepItem[] = [{
    id: 'fight-summary', status: 'info', t: null, title: 'Участие в драках',
    fact: `Личные события в ${involved.length} из ${fights.length} записанных драк. Всего: ${sum(fights.map(f => f.damage))} урона, ${sum(fights.map(f => f.healing))} лечения, ${plural(sum(fights.map(f => f.kills)), ['убийство', 'убийства', 'убийств'])}, ${deathsWord(sum(fights.map(f => f.deaths)))}, ${sum(fights.map(f => f.gold ?? 0))} золота.`,
    advice: 'Сравни драки между собой, а не суммы за матч: одна провальная драка со смертью дороже трёх удачных. Участие не является обязанностью каждого героя — вопрос в том, окупилось ли оно.',
  }]
  for (const f of fights.filter(f => f.deaths > 0 && f.damage === 0 && f.kills === 0).slice(0, 3)) items.push({
    id: `fight-failed-${f.t}`, status: 'review', t: f.t, title: `Драка на ${fmtDuration(f.t)}: смерть без результата`,
    fact: `За ${fmtDuration(f.t)}–${fmtDuration(f.end)}: смертей ${f.deaths}, урона героям ${f.damage}, лечения ${f.healing}, убийств ${f.kills}.`,
    advice: 'Ты попал в бой и умер, не нанеся урона. Проверь вход: позиция, время до подключения союзников и что ты успел применить. Если вход был без цели, на следующую драку назови заранее, кого блокируешь или добиваешь.',
  })
  const first = fights.filter(f => f.firstCast)
  if (first.length) items.push({
    id: 'fight-first', status: 'info', t: first[0].t, title: 'Инициация',
    fact: `Первым применил способность по конкретному герою в ${first.length} из ${fights.length} драк. В признак попадает только направленное применение: AoE, обычные атаки и контринициация могут не учитываться.`,
    advice: rolePlan(p),
  })
  return { id: 'fights', title: 'Драки', lead: `Крупные драки от трёх смертей: ${fights.length}.`, items }
}

function supportSection(p: MatchPlayer): DeepSection | null {
  const evidence = p.evidence
  if (p.position < 4 || !evidence) return null
  const wards = evidence.wards ?? []
  const observers = wards.filter(w => w.type === 'observer').sort((a, b) => a.t - b.t)
  const sentries = wards.filter(w => w.type === 'sentry')
  const items: DeepItem[] = [{
    id: 'support-summary', status: evidence.wards && !wards.length ? 'review' : 'info', t: null, title: 'Обзор и расходники',
    fact: `Observer ${observers.length}, Sentry ${sentries.length}, снято Observer ${evidence.dewards ?? 'неизвестно'}, стаки ${evidence.stacks ?? 'неизвестно'}, Dust ${evidence.itemUses?.dust ?? (evidence.itemUses ? 0 : 'неизвестно')}, Smoke ${evidence.itemUses?.smoke_of_deceit ?? (evidence.itemUses ? 0 : 'неизвестно')}.`,
    advice: 'Обзор ценен моментом, а не количеством. Ставь вард под следующее действие команды: подход к башне, Рошан, фарм в новой зоне. Sentry полезен, когда снимает обзор или вскрывает героя — счётчик установки место не оценивает.',
  }]
  const gaps = observers.slice(1).map((ward, i) => ({ from: observers[i].t, to: ward.t, gap: ward.t - observers[i].t })).filter(g => g.gap > 420)
  if (gaps.length) items.push({
    id: 'support-gaps', status: 'review', t: gaps[0].from, title: 'Окна без Observer',
    fact: `Паузы дольше 7 минут между своими Observer: ${gaps.map(g => `${fmtDuration(g.from)} → ${fmtDuration(g.to)} (${Math.round(g.gap / 60)} мин)`).join(', ')}.`,
    advice: 'Часть обзора могла дать команда, поэтому это повод проверить, а не готовый вывод. Если пауза совпала с проигранной дракой или потерянной башней, посмотри, был ли вард в запасе и куда его можно было поставить заранее.',
  })
  return { id: 'support', title: 'Поддержка', lead: `Позиция ${p.position}: обзор, стаки, обнаружение.`, items }
}

function economySection(p: MatchPlayer, opponents: MatchPlayer[]): DeepSection | null {
  const evidence = p.evidence
  if (!evidence?.curve?.length) return null
  const marks = [600, 1200, 1800].map(t => ({ t, row: sampleAt(evidence, t) })).filter(m => m.row)
  if (!marks.length) return null
  const items: DeepItem[] = [{
    id: 'economy-curve', status: 'info', t: null, title: 'Нетворт и перевес команды',
    fact: marks.map(m => `${fmtDuration(m.t)}: нетворт ${Number(m.row![2]).toLocaleString('ru-RU')}, перевес команды ${gold(Number(m.row![9]))}`).join('; ') + '.',
    advice: 'Смотри свой прирост отдельно от общего отставания: отставание команды объясняет риск, но не отменяет разбор маршрута фарма.',
  }]
  const rival = opponents.filter(o => o.position === p.position && o.evidence?.curve?.length).map(o => ({ o, row: sampleAt(o.evidence, 1200) })).filter(x => x.row)[0]
  if (rival) {
    const own = sampleAt(evidence, 1200)
    items.push({
      id: 'economy-rival', status: 'info', t: 1200, title: `Против ${heroName(rival.o.heroId)} на позиции ${p.position}`,
      fact: `На 20:00 нетворт ${Number(own?.[2] ?? 0).toLocaleString('ru-RU')} против ${Number(rival.row![2]).toLocaleString('ru-RU')}, добиваний ${Number(own?.[4] ?? 0)} против ${Number(rival.row![4])}.`,
      advice: 'Разница на одной роли — ориентир, а не приговор: сверь её с таймингами предметов и участием в драках. Равное участие при отставании по добиваниям обычно означает потерянные волны, а не плохие драки.',
    })
  }
  // Starting items sit at or before the horn; their timings say nothing about pace.
  const purchases = (p.purchaseEvents ?? []).filter(x => x.time > 0).sort((a, b) => a.time - b.time).slice(0, 4)
  if (purchases.length) items.push({
    id: 'economy-items', status: 'info', t: null, title: 'Тайминги предметов',
    fact: `Первые покупки: ${purchases.map(x => `${itemById(x.itemId)} — ${fmtDuration(x.time)}`).join(', ')}.`,
    advice: 'Тайминг предмета — это момент, когда герой готов выйти на карту. Поздняя покупка объясняет пассивность, ранняя — повод проверить, была ли она реализована.',
  })
  return { id: 'economy', title: 'Экономика', lead: 'Кривая нетворта из разобранного реплея.', items }
}

export function deepReview(p: MatchPlayer, opponents: MatchPlayer[] = [], durationSeconds = 0): DeepReview {
  const evidence = p.evidence
  const duration = durationSeconds || Number(evidence?.curve?.at(-1)?.[0] ?? 0)
  const sections = [normSection(p, duration), laneSection(p, opponents), deathsSection(p, opponents), abilitySection(p), fightSection(p), supportSection(p), economySection(p, opponents)]
    .filter((section): section is DeepSection => Boolean(section?.items.length))
  const deaths = evidence?.deaths?.length ?? 0
  return {
    lead: evidence
      ? `Разобрано эпизодами: ${deathsWord(deaths)}, ${evidence.laneMinutes?.length ?? 0} минут линии, ${fightsWord(evidence.fights?.length ?? 0)}, ${usesWord(evidence.uses?.length ?? 0)} способностей и предметов.`
      : 'Реплей этого матча не разобран: подробный разбор появится после его загрузки.',
    sections,
    gaps: [
      'Туман войны не восстановлен: что игрок видел на миникарте в момент решения, из реплея не следует.',
      'Доступность конкретного крипа и HP врага в эту секунду в данных не записаны.',
      'Журнал применений не доказывает готовность способности: дальность, мана и кулдаун не отражены.',
      'Камера и намерения игрока не восстанавливаются, поэтому пункты называют проверяемый факт, а не доказанную ошибку.',
    ],
  }
}
