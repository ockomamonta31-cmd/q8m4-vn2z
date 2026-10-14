import { useEffect, useRef, useState } from 'react'
import type { DraftRating } from '../../api/draftStrength'
import type { HeroInfo, MatchDetails } from '../../api/types'
import { keyTeamfight, rankTeamfights, type MatchTimeline } from '../../api/timeline'
import { reviewFight, reviewLane, reviewMatch } from '../../api/coach'
import { heroImageUrl } from '../../api/heroes'
import { fmtDuration } from '../../api/formats'
import { Route } from './MapPlays'
import { assessPlayer } from '../../api/assessment'
import { rolePlan, type TrainingFact } from '../../api/training'
type AiReview = { model: string; summary: string; priorities: { title: string; explanation: string; nextGame: string; facts: TrainingFact[] }[] }

export default function Edik({ match, timeline, rating, heroMap, meSlot, initialFight }: {
  match: MatchDetails; timeline: MatchTimeline | null; rating: DraftRating | null; heroMap: Map<number, HeroInfo>; meSlot: number | null; initialFight: number | null
}) {
  const roster = [true, false].flatMap(radiant => match.players.filter(p => p.isRadiant === radiant).map((p, i) => ({ p, slot: (radiant ? 0 : 128) + i })))
  const [selected, setSelected] = useState(meSlot ?? roster[0]?.slot ?? 0)
  const [mode, setMode] = useState<'lane' | 'fight' | 'match'>(initialFight !== null ? 'fight' : 'lane')
  const fights = rankTeamfights(timeline)
  const key = keyTeamfight(timeline)
  const [fightId, setFightId] = useState<number | null>(initialFight)
  const [ai, setAi] = useState<AiReview | null>(null)
  const [aiError,setAiError]=useState('')
  const [aiBusy,setAiBusy]=useState(false)
  const generation=useRef(0)
  useEffect(()=>{generation.current++;setAi(null);setAiError('');setAiBusy(false);return ()=>{generation.current++}},[selected,match.id])
  const fight = fights.find(f => f.index === fightId) ?? key ?? fights[0]
  const member = roster.find(m => m.slot === selected) ?? roster[0]
  if (!member) return null
  const { p, slot } = member
  const hero = heroMap.get(p.heroId)
  const lane = rating?.lanes.find(l => [...l.radiant, ...l.dire].some(q => q.heroId === p.heroId)) ?? null
  const notes = mode === 'lane' ? reviewLane(p, lane, timeline) : mode === 'match' ? reviewMatch(p, match.durationSeconds, match.players.filter(q=>q.isRadiant!==p.isRadiant))
    : fight && timeline ? reviewFight(p, fight, timeline, slot) : []
  const team=match.players.filter(q=>q.isRadiant===p.isRadiant)
  const assessment=assessPlayer({...p,teamKills:team.reduce((n,q)=>n+q.kills,0),teamDamage:team.reduce((n,q)=>n+q.heroDamage,0)},match.durationSeconds,null)
  async function loadCoach() {
    setAiBusy(true);setAiError('')
    const target=generation.current
    try {
      const res=await fetch(`/api/matches/${match.id}/coach/${slot}`)
      const data=await res.json()
      if(!res.ok) throw new Error(data.error??'Не удалось загрузить разбор')
      if(target===generation.current)setAi(data)
    } catch(e){if(target===generation.current)setAiError(e instanceof Error?e.message:'Не удалось загрузить разбор')}
    finally{if(target===generation.current)setAiBusy(false)}
  }

  return <section className="edik" aria-labelledby="edik-title">
    <header className="edik-header">
      <div><h2 id="edik-title">Эдик · разбор для следующей игры</h2><p>Линия, экономика, предметы, драки и действия по роли.</p></div>
      <span className="edik-source">По событиям реплея</span>
    </header>
    <div className="edik-controls">
      <div className="edik-player">
        {hero && <img src={heroImageUrl(hero.shortName)} alt="" width="64" height="38" />}
        <div><label htmlFor="edik-player">Чью игру разбираем</label>
          <select id="edik-player" value={slot} onChange={e => setSelected(Number(e.target.value))}>
            {[true, false].map(radiant => <optgroup key={String(radiant)} label={radiant ? 'Radiant' : 'Dire'}>
              {roster.filter(m => m.p.isRadiant === radiant).map(m => <option key={m.slot} value={m.slot}>{heroMap.get(m.p.heroId)?.name ?? `Герой #${m.p.heroId}`} · {m.p.name ?? 'скрытый профиль'}</option>)}
            </optgroup>)}
          </select></div>
      </div>
      <div className="edik-modes" role="group" aria-label="Отрезок разбора">
        <button type="button" aria-pressed={mode === 'lane'} onClick={() => setMode('lane')}>Линия · 0–10 мин</button>
        <button type="button" aria-pressed={mode === 'fight'} onClick={() => setMode('fight')}>Конкретный файт</button>
        <button type="button" aria-pressed={mode === 'match'} onClick={() => setMode('match')}>Весь матч</button>
      </div>
    </div>
    <p className="edik-context">{rolePlan(p)}</p>
    {assessment && <details className="analysis-method"><summary>Оценка {assessment.value > 0 ? '+' : ''}{assessment.value} · что вошло в расчёт</summary>
      <p>{assessment.note}</p>
      {assessment.factors.map(f=><p key={f.label}><b>{f.label}: {f.contribution>0?'+':''}{f.contribution}</b> — {f.detail}</p>)}
      <p><b>Измерено:</b> {assessment.coverage.join('; ')}.</p><p><b>Чего пока не хватает:</b> {assessment.missing.join('; ')}.</p>
    </details>}
    <section className="edik-ai" aria-label="Разбор ИИ-тренера">
      <div><h3>Приоритеты от тренера</h3><p>Llama 3.3 70B объясняет факты реплея и даёт упражнения. Бесплатный дневной лимит; готовый разбор сохраняется.</p></div>
      <button type="button" disabled={aiBusy || !p.evidence} onClick={loadCoach}>{aiBusy?'Тренер разбирает игру…':ai?'Обновить сохранённый разбор':'Получить разбор тренера'}</button>
      {aiError&&<p role="status">{aiError}</p>}
      {ai&&<><p>{ai.summary}</p>{ai.priorities.map((priority,i)=><article className="edik-note" key={i}>
        <h3>{i+1}. {priority.title}</h3>{priority.facts.map(f=><p className="edik-fact" key={f.id}>{f.fact}</p>)}
        <p>{priority.explanation}</p><p className="edik-advice"><b>В следующей игре</b>{priority.nextGame}</p>
      </article>)}<p className="dim">{ai.model} · экспериментальные советы по перечисленным фактам; причины ошибок могут требовать проверки реплея.</p></>}
    </section>
    {mode === 'lane' && lane && <p className="edik-context">{lane.label}: Radiant — {lane.radiant.map(q => heroMap.get(q.heroId)?.name).join(', ')}; Dire — {lane.dire.map(q => heroMap.get(q.heroId)?.name).join(', ')}. {rating?.realLanes ? 'Группы определены по данным линий.' : 'Распределение по линиям оценено по ролям.'}</p>}
    {mode === 'fight' && (fight ? <div className="edik-fight-picker">
      <label htmlFor="edik-fight">Какой бой смотрим</label>
      <select id="edik-fight" value={fight.index} onChange={e => setFightId(Number(e.target.value))}>
        {[...fights].sort((a, b) => a.t - b.t).map(f => <option key={f.index} value={f.index}>{fmtDuration(f.t)}–{fmtDuration(f.end)} · Radiant {f.radiantKills}:{f.direKills} Dire{f.index === key?.index ? ' · ключевой по данным' : ''}</option>)}
      </select>
      <p>{key ? `Ключевой по данным — бой на ${fmtDuration(key.t)}. Сейчас разбираем ${fmtDuration(fight.t)}; можно выбрать любой другой.` : `Убедительного перелома не найдено. Сейчас разбираем бой на ${fmtDuration(fight.t)}; он не объявлен решающим.`}</p>
    </div> : <p className="edik-empty">В реплее нет записанных драк от трёх смертей. Разбор линии и действий по карте доступен, если эти данные сохранены.</p>)}
    <div className="edik-notes">
      {notes.map((note, i) => <article key={`${mode}-${slot}-${fight?.index}-${i}`} className={`edik-note ${note.status}`}>
        <div className="edik-note-main">
          <header><h3>{note.title}</h3><span>{note.t != null ? fmtDuration(note.t) : mode === 'lane' ? 'К 10:00' : 'Контекст'}</span></header>
          <p className="edik-fact">{note.fact}</p>
          <p className="edik-advice"><b>{note.status === 'good' ? 'Что удалось' : 'Что проверить'}</b>{note.advice}</p>
          {'referenceIds' in note && (note as TrainingFact).referenceIds?.length ? <p className="edik-references">Сравнить реплеи: {(note as TrainingFact).referenceIds!.map(id=><a key={id} href={`https://www.opendota.com/matches/${id}`} target="_blank" rel="noreferrer">{id}</a>)}</p> : null}
        </div>
        {note.play && <div className="edik-route"><Route play={note.play} heroId={p.heroId} /><p>Жёлтый — твой маршрут; зелёный — Radiant, красный — Dire. Истинные позиции без тумана войны.</p></div>}
      </article>)}
    </div>
    <details className="analysis-method"><summary>На чём основаны объяснения Эдика</summary><p>Ниже — измерения и правила разбора, сверху по кнопке — объяснения Llama 3.3 70B с обязательными ссылками на исходные факты. Примеры сильных игроков содержат реальные матчи, экономику и покупки; для части примеров также разобраны маршруты. Медаль учитывается в оценке, а сильные примеры помогают учиться. Видимость и готовность способностей не восстановлены полностью: предполагаемые причины нужно проверять в эпизоде.</p></details>
  </section>
}
