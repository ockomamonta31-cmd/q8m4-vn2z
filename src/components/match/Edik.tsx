import { useState } from 'react'
import type { DraftRating } from '../../api/draftStrength'
import type { HeroInfo, MatchDetails } from '../../api/types'
import { keyTeamfight, rankTeamfights, type MatchTimeline } from '../../api/timeline'
import { reviewFight, reviewLane, reviewMatch } from '../../api/coach'
import { heroImageUrl } from '../../api/heroes'
import { fmtDuration } from '../../api/formats'
import { Route } from './MapPlays'
import { assessPlayer } from '../../api/assessment'
import { keyMistakes, type TrainingFact } from '../../api/training'
import { deepReview } from '../../api/deepReview'

export default function Edik({ match, timeline, rating, heroMap, meSlot, initialFight }: {
  match: MatchDetails; timeline: MatchTimeline | null; rating: DraftRating | null; heroMap: Map<number, HeroInfo>; meSlot: number | null; initialFight: number | null
}) {
  const roster = [true, false].flatMap(radiant => match.players.filter(p => p.isRadiant === radiant).map((p, i) => ({ p, slot: (radiant ? 0 : 128) + i })))
  const [selected, setSelected] = useState(meSlot ?? roster[0]?.slot ?? 0)
  const [mode, setMode] = useState<'lane' | 'fight' | 'match'>(initialFight !== null ? 'fight' : 'lane')
  const [fightId, setFightId] = useState<number | null>(initialFight)
  const [showDetails, setShowDetails] = useState(initialFight !== null)
  const [deep, setDeep] = useState(false)
  const fights = rankTeamfights(timeline), key = keyTeamfight(timeline)
  const fight = fights.find(f => f.index === fightId) ?? key ?? fights[0]
  const member = roster.find(m => m.slot === selected) ?? roster[0]
  if (!member) return null
  const { p, slot } = member
  const hero = heroMap.get(p.heroId)
  const lane = rating?.lanes.find(l => [...l.radiant, ...l.dire].some(q => q.heroId === p.heroId)) ?? null
  const opponents = match.players.filter(q => q.isRadiant !== p.isRadiant)
  const mistakes = keyMistakes(p, opponents)
  const review = deep ? deepReview(p, opponents, match.durationSeconds) : null
  const notes = !showDetails ? [] : mode === 'lane' ? reviewLane(p, lane, timeline) : mode === 'match' ? reviewMatch(p, match.durationSeconds, opponents)
    : fight && timeline ? reviewFight(p, fight, timeline, slot) : []
  const team = match.players.filter(q => q.isRadiant === p.isRadiant)
  const assessment = showDetails ? assessPlayer({ ...p, teamKills: team.reduce((n, q) => n + q.kills, 0), teamDamage: team.reduce((n, q) => n + q.heroDamage, 0) }, match.durationSeconds, null) : null

  return <section className="edik" aria-labelledby="edik-title">
    <header className="edik-header">
      <div><h2 id="edik-title">Эдик · главные ошибки</h2><p>До трёх важных эпизодов: что потерял и как изменить следующее решение.</p></div>
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
    </div>
    <div className="edik-notes edik-key-notes" aria-live="polite">
      {mistakes.map(note => <article key={`${slot}-${note.id}`} className="edik-note review">
        <div className="edik-note-main">
          <header><h3>{note.title}</h3><span>{fmtDuration(note.t!)}</span></header>
          <p className="edik-fact">{note.fact}</p>
          <p className="edik-advice"><b>Как исправить</b>{note.advice}</p>
          {note.detail && <details className="analysis-method"><summary>Почему выделен этот эпизод</summary><p>{note.detail}</p></details>}
        </div>
      </article>)}
      {!mistakes.length && <p className="edik-empty">{p.evidence ? 'Явных ошибок с достаточным контекстом не выделено. Эпизоды и измерения можно посмотреть ниже.' : 'Для разбора нужен реплей. Ошибки появятся после его загрузки.'}</p>}
    </div>
    {p.evidence && <div className="edik-deep-toggle">
      <p>Выше — до трёх эпизодов, выбранных автоматически. Подробный разбор идёт по всем смертям, поминутной линии, дракам, применениям способностей и экономике этого игрока.</p>
      <button type="button" className="btn" aria-expanded={deep} onClick={() => setDeep(!deep)}>{deep ? 'Свернуть разбор' : 'Разобрать мою игру подробно'}</button>
    </div>}
    {review && <div className="edik-deep">
      <p className="edik-context">{review.lead}</p>
      {review.sections.map(section => <section key={section.id} className="edik-deep-section">
        <header className="edik-deep-head"><h3>{section.title}</h3><p>{section.lead}</p></header>
        <div className="edik-notes">
          {section.items.map(item => <article key={`${slot}-${item.id}`} className={`edik-note ${item.status}`}>
            <div className="edik-note-main">
              <header><h3>{item.title}</h3>{item.t != null && <span>{fmtDuration(item.t)}</span>}</header>
              <p className="edik-fact">{item.fact}</p>
              <p className="edik-advice"><b>{item.status === 'good' ? 'Что удалось' : 'Что проверить'}</b>{item.advice}</p>
            </div>
          </article>)}
        </div>
      </section>)}
      <details className="analysis-method"><summary>Что реплей не показывает</summary>
        <ul>{review.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul></details>
    </div>}
    <details className="analysis-method edik-details" open={showDetails} onToggle={e => setShowDetails(e.currentTarget.open)}>
      <summary>Все эпизоды и измерения</summary>
      {showDetails && <>
        <div className="edik-modes" role="group" aria-label="Отрезок разбора">
          <button type="button" aria-pressed={mode === 'lane'} onClick={() => setMode('lane')}>Линия · 0–10 мин</button>
          <button type="button" aria-pressed={mode === 'fight'} onClick={() => setMode('fight')}>Конкретный файт</button>
          <button type="button" aria-pressed={mode === 'match'} onClick={() => setMode('match')}>Весь матч</button>
        </div>
        {assessment && <details className="analysis-method"><summary>Оценка {assessment.value > 0 ? '+' : ''}{assessment.value} · что вошло в расчёт</summary>
          <p>{assessment.note}</p>
          {assessment.factors.map(f => <p key={f.label}><b>{f.label}: {f.contribution > 0 ? '+' : ''}{f.contribution}</b> — {f.detail}</p>)}
          <p><b>Измерено:</b> {assessment.coverage.join('; ')}.</p><p><b>Чего пока не хватает:</b> {assessment.missing.join('; ')}.</p>
        </details>}
        {mode === 'lane' && lane && <p className="edik-context">{lane.label}: Radiant — {lane.radiant.map(q => heroMap.get(q.heroId)?.name).join(', ')}; Dire — {lane.dire.map(q => heroMap.get(q.heroId)?.name).join(', ')}. {rating?.realLanes ? 'Группы определены по данным линий.' : 'Распределение по линиям оценено по ролям.'}</p>}
        {mode === 'fight' && (fight ? <div className="edik-fight-picker">
          <label htmlFor="edik-fight">Какой бой смотрим</label>
          <select id="edik-fight" value={fight.index} onChange={e => setFightId(Number(e.target.value))}>
            {[...fights].sort((a, b) => a.t - b.t).map(f => <option key={f.index} value={f.index}>{fmtDuration(f.t)}–{fmtDuration(f.end)} · Radiant {f.radiantKills}:{f.direKills} Dire{f.index === key?.index ? ' · ключевой по данным' : ''}</option>)}
          </select>
          <p>{key ? `Ключевой по данным — бой на ${fmtDuration(key.t)}. Сейчас разбираем ${fmtDuration(fight.t)}; можно выбрать любой другой.` : `Убедительного перелома не найдено. Сейчас разбираем бой на ${fmtDuration(fight.t)}; он не объявлен решающим.`}</p>
        </div> : <p className="edik-empty">В реплее нет записанных драк от трёх смертей.</p>)}
        <div className="edik-notes">
          {notes.map((note, i) => <article key={`${mode}-${slot}-${fight?.index}-${i}`} className={`edik-note ${note.status}`}>
            <div className="edik-note-main">
              <header><h3>{note.title}</h3><span>{note.t != null ? fmtDuration(note.t) : mode === 'lane' ? 'К 10:00' : 'Контекст'}</span></header>
              <p className="edik-fact">{note.fact}</p>
              <p className="edik-advice"><b>{note.status === 'good' ? 'Что удалось' : 'Что проверить'}</b>{note.advice}</p>
              {'referenceIds' in note && (note as TrainingFact).referenceIds?.length ? <p className="edik-references">Сравнить реплеи: {(note as TrainingFact).referenceIds!.map(id => <a key={id} href={`https://www.opendota.com/matches/${id}`} target="_blank" rel="noreferrer">{id}</a>)}</p> : null}
            </div>
            {note.play && <div className="edik-route"><Route play={note.play} heroId={p.heroId} structures={(note as TrainingFact).referenceIds?.length ? undefined : p.mapPlays?.structures} /><p>Зелёный — Radiant, красный — Dire. Истинные позиции без тумана войны. Для примера из другого матча показаны только ориентиры строений.</p></div>}
          </article>)}
        </div>
      </>}
    </details>
    <details className="analysis-method"><summary>Как выбраны ошибки</summary><p>Эдик выделяет до трёх эпизодов с конкретным риском или потерей темпа: одиночная позиция под ганк, близкие смерти, смерть после байбека, размены при слабом добивании, ускорение без атак. Один эпизод показывается один раз. Смерть сама по себе не доказывает ошибку решения; видимость врагов и доступность спасения могут требовать проверки на реплее.</p></details>
  </section>
}
