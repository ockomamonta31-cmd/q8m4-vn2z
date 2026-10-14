import type { MatchPlayer, PlayerEvidence } from './types'
import { comparisons, sampleAt } from './assessment'
import type { CoachNote } from './coach'
import { fmtDuration } from './formats'
import meta from '../../server/data/constants/hero_meta.json'
import items from '../../server/data/constants/items.json'
import heroes from '../../server/data/constants/heroes.json'
import kits from '../../server/data/constants/hero_kit.json'
const itemName=(key:string)=>items.find(i=>i.shortName===key)?.displayName ?? key
const heroName=(id:number)=>heroes.find(h=>h.id===id)?.displayName??`герой ${id}`
const spellNames=new Map(Object.values(kits.kit).flatMap(k=>k.abilities.map(a=>[a.name,a.title] as [string,string])))
const spellName=(key:string)=>spellNames.get(key)??({clinkz_strafe:'Strafe',clinkz_death_pact:'Death Pact',earthshaker_aftershock:'Aftershock'} as Record<string,string>)[key]??key.replace(/^[^_]+_/,'').replaceAll('_',' ')

export const isolatedGank=(d:NonNullable<PlayerEvidence['deathWindows']>[number])=>d.decision?.nearbyAllies===0&&d.decision.attackers.length>=2
export const decisionExercise='Останови реплей перед началом нападения. Проверь миникарту: где мидер, кто рядом и чем враг удержит тебя. Запиши, какую волну можно было безопасно дождаться вместо выхода.'
export function deathDetail(p:MatchPlayer,d:NonNullable<PlayerEvidence['deathWindows']>[number],opponents:MatchPlayer[]=[]):Omit<TrainingFact,'id'> {
  const ally=d.nearestAlly,enemy=d.enemySpells.map(spellName).join(', '),used=[...d.ownSpells.map(spellName),...d.items.map(k=>itemName(k.replace(/^item_/,'')))].join(', ')
  const c=d.decision,risk=isolatedGank(d),shaman=d.enemySpells.includes('shadow_shaman_voodoo')&&d.enemySpells.includes('shadow_shaman_shackles')
  const mid=c?.attackers.find(a=>opponents.some(o=>o.heroId===a.heroId&&o.lane==='mid'))
  const before=c?`Перед нападением, на ${fmtDuration(c.t)}: ${c.nearbyAllies==null?'число ближайших союзников неизвестно':`живых союзников в радиусе 1600 ед. — ${c.nearbyAllies}`}${c.nearestAlly?`; ближайший — ${heroName(c.nearestAlly.heroId)}, ${c.nearestAlly.distance} ед.`:'.'}${c.health!=null&&c.maxHealth!=null?` HP ${c.health}/${c.maxHealth}.`:''} Нападение в этом окне началось на ${fmtDuration(c.attackStart)}. Затем тебя атаковали ${c.attackers.map(a=>`${heroName(a.heroId)} (${fmtDuration(a.firstContact)})`).join(', ')}.${mid?` Подключился вражеский мидер ${heroName(mid.heroId)}.`:''} Видимость врагов на миникарте не восстановлена. `:''
  const advice=risk
    ? `Ты остался один против нескольких героев: ближайший союзник был слишком далеко для немедленной помощи пешком. ${shaman?'Shaman связал Hex → Shackles, а остальные получили время нанести урон. Здесь нужно оценивать выход до Hex: рассчитывать на отход после цепочки контроля опасно. ':''}${mid?`Перед подходом к волне проверь, виден ли ${heroName(mid.heroId)} на миде. `:'Перед подходом к волне проверь, виден ли вражеский мидер на своей линии. '}Если мидер пропал, помощи рядом нет и враг может удержать тебя контролем, не выходи один к открытой волне: дождись её ближе к своей башне или забери безопасный лагерь, если это доступно. Возвращайся после появления мидера, союзника или обзора подхода. Если это был дайв под башню и путь уже перекрыли, проверь более раннюю возможность уйти или сменить линию; сам факт смерти не доказывает, что в момент нападения ещё можно было спастись.`
    : `Проверь решение до первого контроля: кто мог удержать тебя, где находился вражеский мидер и был ли свободен путь к безопасной волне. ${c?.nearbyAllies&&c.nearbyAllies>0?'Союзники были рядом, но дистанция не доказывает готовность спасти: сопоставь их действия, контроль и возможность подключения. ':ally&&ally.distance<900?`${heroName(ally.heroId)} был рядом; этих данных недостаточно, чтобы обвинить его в отсутствии помощи. `:''}Если враги способны закрыть отход до подключения команды, уступи добивание и сохрани дистанцию заранее. ${c?.nearbyAllies==null?'Наличие помощи до нападения здесь неизвестно. ':''}Журнал не показывает видимость и готовность спасения; сравнение нанесённого и полученного урона само по себе не определяет ошибку.`
  return {section:d.t<600?'lane':'fight',title:`${fmtDuration(d.t)} · что предшествовало твоей смерти${risk?' — ганк без союзников рядом':''}`,t:d.t,status:'review',decisionRisk:risk,
    fact:`${before}За ${fmtDuration(d.from)}–${fmtDuration(d.t)}: нанёс героям ${d.damage} урона (${d.attacks} обычных попаданий), получил ${d.taken} урона по самому герою. ${enemy?`В тебя попали: ${enemy}. `:''}${used?`Использовал: ${used}. `:''}${ally?`За 10 с до смерти ближайший живой союзник — ${heroName(ally.heroId)}, ${ally.distance} ед. В этом окне его урон героям: ${d.allyDamage}; способности по героям: ${d.allySpells.map(spellName).join(', ')||'не записаны'}. `:''}${d.lhNextMinute!=null?`От начала окна до минуты после смерти: ${d.lhNextMinute} добиваний, ${d.xpNextMinute} опыта.`:''}`,advice}
}


export type TrainingFact = CoachNote & { id: string; section: 'lane' | 'farm' | 'fight' | 'support' | 'map'; referenceIds?: number[]; decisionRisk?:boolean }
export function rolePlan(p: Pick<MatchPlayer,'heroId'|'position'>): string {
  const tags = meta.find(h=>h.id === p.heroId)?.roles ?? []
  if (p.heroId === 2 && p.position === 3) return 'Axe: до Blink обеспечь фарм и уровень; после покупки ищи выход с союзниками под Call. Один Blink не делает любую драку выгодной.'
  if (p.heroId === 96 && p.position === 3) return 'Centaur: фарм нужен для плотности и первого предмета входа. Реализуй Stampede для подключения или спасения; не обязан участвовать в каждой драке до тайминга.'
  if (p.heroId === 34) return 'Tinker: береги темп получения уровней и предметов. Сравни переход к дракам со своим готовым набором, а после выхода сразу возвращайся к доступному фарму. Его план зависит от версии героя и патча.'
  if (p.position === 1) return 'Керри: добивания и опыт на линии, безопасный маршрут восстановления, готовый предмет для выхода; после удачного боя переводи преимущество в фарм, башню или Рошана.'
  if (p.position === 2) return tags.includes('Nuker') && !tags.includes('Carry') ? 'Активный мидер: линия и уровни, руны, затем выход с готовыми способностями. Удачный ганк должен окупать пропущенную волну; отсутствие ганка само по себе не ошибка.' : 'Мидер: сначала удержи волну и темп героя. Согласуй выход с руной, уровнем или предметом; фармящего мидера нельзя оценивать по числу ганков активного героя.'
  if (p.position === 3) return tags.includes('Initiator') ? 'Оффлейнер-инициатор: линия, экономика под первый предмет, затем согласованный вход и реализация контроля. Фарм нужен и после Blink; оценивай цель боя и готовность команды.' : 'Оффлейнер: обеспечь свою экономику и давление по плану героя; подключайся на готовом тайминге. Не каждый герой должен начинать драку первым.'
  if (p.position >= 4) return 'Поддержка: полезные размены на линии, опыт для ключевых способностей, помощь в убийствах и спасениях, обзор под следующую цель, снятие вардов и обнаружение невидимости. Число покупок не заменяет применение.'
  return 'Роль не определена: персональную норму роли и план подключения нужно уточнить по реплею.'
}
const total = (e: PlayerEvidence, t: number, field: number) => sampleAt(e,t)?.[field] ?? null
export function trainingFacts(p: MatchPlayer, duration: number, opponents: MatchPlayer[] = []): TrainingFact[] {
  const e = p.evidence
  if (!e) return []
  const notes: Omit<TrainingFact,'id'>[] = []
  const ten = sampleAt(e, Math.min(600,duration))
  const deaths = e.deaths?.filter(d=>d.t >= 0 && d.t < 600)
  if (ten) notes.push({section:'lane', title:'Линия: фарм, опыт и размены вместе',status:'info',t:Math.min(600,duration),
    fact:`К ${fmtDuration(Math.min(600,duration))}: ${ten[4]??'нет данных'} добиваний, ${ten[5]??'нет данных'} денаев, ${ten[3]??'нет данных'} опыта, ${ten[6]??'нет данных'} урона героям. ${e.lane.attacks == null ? 'Отдельные удары не записаны.' : `Удары по героям: ${e.lane.attacks}; минуты с уроном: ${e.lane.activeMinutes}/10; получено от героев ${e.lane.damageTaken}.`}`,
    advice: p.position >= 4 ? 'Сопоставь размены с добиваниями своего кора: помогал ли твой урон ему подходить к крипам? Если ты получал опыт, но не создавал безопасных добиваний, меняй дистанцию и выбирай момент атаки, когда враг занят крипом.' : 'Сначала найди потерянные волны: смерть, уход или неудачное добивание. Размен выгоден, когда после него ты сохраняешь доступ к крипам. Большой урон при потерянном фарме ещё не означает хорошую линию.' })
  if (deaths?.length) notes.push({section:'lane',title:'Цена смертей на линии',status:'review',t:deaths[0].t,
    fact:`Смертей на линии: ${deaths.length}. Время: ${deaths.map(d=>fmtDuration(d.t)).join(', ')}. Подтверждённое время мёртвым: ${deaths.reduce((n,d)=>n+(d.secondsDead??0),0)} с; отданное золото: ${deaths.reduce((n,d)=>n+(d.goldFed??0),0)}. Возвращение на линию сюда не входит.`,
    advice:'Перед следующей попыткой размена проверь уровень врагов и расстояние до партнёра. После смерти приоритет — вернуться в опыт и восстановить ресурсы, а не повторять вход без изменившихся условий.'})
  const farmTrade=e.laneMinutes?.filter(m=>m.t>=60&&m.aliveSeconds>=50&&m.attacks>=5&&m.lh<=2).sort((a,b)=>a.lh-b.lh||b.attacks-a.attacks)[0]
  if(p.position<=3&&farmTrade)notes.push({section:'lane',title:`${fmtDuration(farmTrade.t)}–${fmtDuration(farmTrade.end)} · размены при слабом добивании`,status:'review',t:farmTrade.t,
    fact:`За минуту: ${farmTrade.lh} добиваний, ${farmTrade.xp} опыта, ${farmTrade.attacks} обычных попаданий по героям, ${farmTrade.damage} нанесённого и ${farmTrade.taken} полученного урона. Живым был ${farmTrade.aliveSeconds} с.`,
    advice:'Конкретная потеря здесь — мало добиваний в минуту, когда ты был жив и активно бил героев. Проверь, совпадали ли атаки по героям с возможностью добить крипа. Если да, сначала забирай добивание и только затем бей врага во время его атаки по своему крипу. Это кандидат на неправильный приоритет, а не доказанный механический промах: журнал не показывает HP и доступность каждого крипа.'})
  notes.push(...(e.deathWindows??[]).filter(d=>d.t<600).sort((a,b)=>Number(isolatedGank(b))-Number(isolatedGank(a))||(b.taken-b.damage)-(a.taken-a.damage)).slice(0,3).map(d=>deathDetail(p,d,opponents)))
  const repeated=(e.deathWindows??[]).find((d,i,all)=>d.t<600&&i>0&&d.t-all[i-1].t<=120)
  if(repeated)notes.push({section:'lane',title:'После смерти быстро потерял ещё одну жизнь',t:repeated.t,status:'review',
    fact:`Предыдущая смерть — ${fmtDuration((e.deathWindows??[]).find(d=>d.t<repeated.t&&d.t>=repeated.t-120)!.t)}; следующая — ${fmtDuration(repeated.t)}. Во втором эпизоде получил ${repeated.taken} урона за ${repeated.t-repeated.from} с.`,
    advice:'Две близкие смерти — отдельная потеря темпа. Сравни вход после возрождения с первым: изменились ли уровни врагов, число героев и готовность партнёра? Если условия стали хуже, вернись за опытом под башню или на другую доступную волну; повторный риск нужен под конкретную помощь, а не ради отыгрыша предыдущей смерти.'})
  for(const w of (e.spellWindows??[]).filter(w=>w.attacks===0).slice(0,2))notes.push({section:w.t<600?'lane':'fight',title:`${fmtDuration(w.t)} · Strafe без обычных атак в следующем окне`,t:w.t,status:'review',
    fact:`Применение Strafe записано. За следующие ${w.seconds} с обычных попаданий — ${w.attacks}, урон от записанных действий — ${w.damage}.`,
    advice:'Проверь, был ли враг или крип в доступной дальности перед нажатием. Если целью были обычные атаки, включай ускорение после выбора доступной цели, а не перед длинным подходом. Отсутствие попаданий само по себе не доказывает ошибку: способность могла использоваться для другой задачи или враг прервал атаку.'})
  if(e.spellWindows?.length&&e.spellWindows.every(w=>w.attacks>0))notes.push({section:'fight',title:'Strafe: применения с подтверждёнными атаками',status:'good',
    fact:`Записано ${e.spellWindows.length} применений Strafe; после каждого есть обычные попадания в течение ${e.spellWindows[0].seconds} с. Первое записанное применение — ${fmtDuration(e.spellWindows[0].t)}. Урон в этих окнах может включать героев, крипов и строения.`,
    advice:'Пустых применений в этих окнах не видно. Это не доказывает оптимальную цель и длительность атаки: для этого сравни выбор цели, прерывания и возможность бить безопасно в конкретном бою. Ошибку нажатия по этому счётчику тебе приписывать нельзя.'})
  const refs = comparisons(p,p.seasonRank,true)
  const spatialRef=refs.find(r=>r.mapPlays?.coverage && r.mapPlays.coverage>=.9)
  const refPlay=spatialRef?.mapPlays?.episodes.find(e=>e.t>=600&&e.verdict>0&&(e.kind==='rotation'||e.kind==='objective'))
  if(spatialRef && refPlay) notes.push({section:'map',title:`Как двигался этот герой в матче ${spatialRef.matchId}`,status:'info',t:refPlay.t,play:refPlay,referenceIds:[spatialRef.matchId],
    fact:`Реальный маршрут из отдельного реплея: ${refPlay.kind==='objective'?'давление на строение':'выход с участием в убийстве'} на ${fmtDuration(refPlay.t)}; перевес его команды ${refPlay.teamGold}. Покупки перед выходом: ${spatialRef.evidence.purchases?.filter(x=>x.t<=refPlay.t).map(x=>`${itemName(x.key)} ${fmtDuration(x.t)}`).join(', ')||'ключевых покупок не записано'}.`,
    advice:'Сравни условия выхода: готовый предмет, союзники рядом и цель после боя. Не копируй маршрут без этих условий. На рисунке координаты игроков из этого примера, а не из твоего матча; видимость врагов не восстановлена.'})
  const laneRefs = refs.filter(r=>r.duration>=600 && total(r.evidence,600,4)!=null).slice(0,3)
  if (laneRefs.length && ten) notes.push({section:'lane',title:'Как начинали сильные игроки на этом герое',status:'info',referenceIds:laneRefs.map(r=>r.matchId),
    fact:laneRefs.map(r=>`Матч ${r.matchId} (${r.cohort==='pro'?'про':'паб с высокой медалью'}): к 10:00 ${total(r.evidence,600,4)} LH, ${total(r.evidence,600,3)} XP, ${total(r.evidence,600,6)} урона; ${r.evidence.deaths?.filter(d=>d.t>=0&&d.t<600).length??'неизвестно'} смертей.`).join(' '),
    advice:'Это примеры для обучения, а не обязательный норматив твоего ранга. Открой матч и сравни первые волны, прокачку и покупки. Соперники, патч и помощь команды могут отличаться; отдельные пространственные примеры показаны в разборе всего матча.'})
  const timings = e.purchases?.filter(x=>['blink','black_king_bar','desolator','orchid','battlefury','radiance','maelstrom','travel_boots','kaya','witch_blade','armlet'].includes(x.key)) ?? []
  for (const item of timings.slice(0,4)) {
    const end = Math.min(duration,item.t+180), from = sampleAt(e,item.t), after=sampleAt(e,end)
    const losses = e.deaths?.filter(d=>d.t>item.t&&d.t<=end) ?? []
    const events = p.mapPlays?.episodes.filter(x=>x.t>=item.t&&x.t<=end&&x.kind!=='pressure') ?? []
    const norms = refs.flatMap(r=>{const first=r.evidence.purchases?.find(x=>x.key===item.key);return first?[{id:r.matchId,t:first.t}]:[]}).slice(0,3)
    notes.push({section:'farm',title:`Что произошло после ${itemName(item.key)}`,status:losses.length?'review':'info',t:item.t,referenceIds:norms.map(n=>n.id),
      fact:`Покупка на ${fmtDuration(item.t)}. Экономика по минутным снимкам ${fmtDuration(Number(from?.[0]??0))}–${fmtDuration(Number(after?.[0]??0))}: +${from&&after&&from[1]!=null&&after[1]!=null?after[1]-from[1]:'?'} заработанного золота, +${from&&after&&from[4]!=null&&after[4]!=null?after[4]-from[4]:'?'} добиваний. События ${fmtDuration(item.t)}–${fmtDuration(end)}: ${losses.length} смертей, ${events.length} боевых/объектных эпизодов.${norms.length?' Примеры того же героя: '+norms.map(n=>`${n.id} — ${fmtDuration(n.t)}`).join('; ')+'.':''}`,
      advice:['battlefury','radiance','maelstrom'].includes(item.key) ? 'Фармящий предмет должен ускорить следующую покупку. Сравни прирост добиваний до и после него. Выход в драку оправдан понятной выгодой; смерть может обнулить выигранный темп.' : item.key==='blink'&&p.position===3 ? 'Первый Blink открывает вход, но нужен союзный урон. Перед выходом обозначь цель и проверь расстояние до команды; после размена не пропускай свободные волны.' : 'Выдели первую драку после предмета: удалось ли реализовать новую возможность? Покупка могла ещё ехать на курьере, поэтому её время не доказывает наличие предмета в руках.'})
  }
  if (e.curve.length>15) {
    const start=sampleAt(e,900), later=sampleAt(e,Math.min(1500,duration))
    if(start&&later) notes.push({section:'farm',title:'Восстановление после старта',status:'info',t:900,
      fact:`15:00: нетворт ${start[2]}, перевес команды ${start[9]}. К ${fmtDuration(Number(later[0]))}: нетворт ${later[2]}, перевес команды ${later[9]}; добивания +${Number(later[4])-Number(start[4])}.`,
      advice:'Смотри свой прирост отдельно от общего отставания. Для следующей игры выбери безопасный маршрут до нужного предмета и заранее обозначь, какую волну можешь забрать. Полезный выход на карту оценивай вместе с потерянным временем фарма.'})
  }
  if (e.fights) {
    const window=e.fights.filter(f=>f.t>=600), involved=window.filter(f=>f.damage>0||f.healing>0||f.kills>0||f.deaths>0)
    notes.push({section:'fight',title:'Подключения к дракам по задаче героя',status:'info',
      fact:`После 10:00 личные события есть в ${involved.length} из ${window.length} записанных крупных драк. Первым применил направленную на героя способность в ${window.filter(f=>f.firstCast).length} из них. Это не полный счёт инициаций: AoE, атаки и контринициация могут не попасть в этот признак.`,
      advice:rolePlan(p)})
  }
  if(p.position>=4) {
    const obs=e.wards?.filter(w=>w.type==='observer'), sen=e.wards?.filter(w=>w.type==='sentry')
    notes.push({section:'support',title:'Поддержка: действие важнее покупки',status:e.wards&&!e.wards.length?'review':'info',
      fact:`Установлено: Observer ${obs?.length??'неизвестно'}, Sentry ${sen?.length??'неизвестно'}; снято Observer ${e.dewards??'неизвестно'}; стаки ${e.stacks??'неизвестно'}; Dust применён ${e.itemUses?.dust??(e.itemUses?0:'неизвестно')} раз; Smoke ${e.itemUses?.smoke_of_deceit??(e.itemUses?0:'неизвестно')}.`,
      advice:'Ставь обзор перед следующим действием команды: подход к башне, Рошану или фарму в новой зоне. Sentry полезен, когда снимает обзор или обнаруживает героя; счётчик установки не оценивает место варда. Smoke координируй с готовностью союзников.'})
    if(opponents.some(q=>[32,44,56,59,63,90].includes(q.heroId)) && e.itemUses && !e.itemUses.dust) notes.push({section:'support',title:'Проверка обнаружения против невидимости',status:'review',
      fact:'У соперников есть герой со встроенной невидимостью; собственное применение Dust в журнале не записано.',
      advice:'Перед выходом назначь, кто несёт обнаружение. Если его обеспечивал союзник, Gem или Sentry, отсутствие твоего Dust нормально. Ошибку подтверждает конкретный уход невидимого врага из боя без доступного обнаружения, а не нулевой счётчик.'})
  }
  if(e.deaths?.some(d=>d.dieback)) notes.push({section:'fight',title:'Смерть после байбека',status:'review',t:e.deaths.find(d=>d.dieback)?.t,
    fact:`Подтверждено ${e.deaths.filter(d=>d.dieback).length} повторных смертей после байбека.`,advice:'Перед возвратом назови объект, который спасёшь, и способ подключения. Если до команды не добраться вовремя, один байбек не исправит проигранный бой. Проверь это по эпизоду, а не только по цене смерти.'})
  notes.push(...(e.deathWindows??[]).filter(d=>d.t>=600).slice(0,4).map(d=>deathDetail(p,d,opponents)))
  return notes.map((n,i)=>({...n,id:'F'+i}))
}
