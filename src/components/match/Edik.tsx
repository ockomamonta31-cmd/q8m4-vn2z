import { useState } from 'react'
import type { DraftRating } from '../../api/draftStrength'
import type { HeroInfo, MatchDetails } from '../../api/types'
import { keyTeamfight, rankTeamfights, type MatchTimeline } from '../../api/timeline'
import { reviewFight, reviewLane, reviewMatch } from '../../api/coach'
import { heroImageUrl } from '../../api/heroes'
import { fmtDuration } from '../../api/formats'
import { Route } from './MapPlays'
import { assessPlayer } from '../../api/assessment'
import type { TrainingFact } from '../../api/training'
import { deepReview, type DeepItem, type DeepSection } from '../../api/deepReview'

const adviceLabel = (status: DeepItem['status']) => status === 'good' ? 'Что удалось' : status === 'review' ? 'Что проверить' : 'Что видно'

function Notes({ items, slot, section }: { items: DeepItem[]; slot: number; section?: string }) {
  return <div className="edik-notes">
    {items.map(item => <article key={`${slot}-${item.id}`} className={`edik-note ${item.status}`}>
      <div className="edik-note-main">
        <header>
          <h3>{item.title}</h3>
          <span>{[section, item.t != null ? fmtDuration(item.t) : null].filter(Boolean).join(' · ') || 'Контекст'}</span>
        </header>
        <p className="edik-fact">{item.fact}</p>
        <p className="edik-advice"><b>{adviceLabel(item.status)}</b>{item.advice}</p>
      </div>
    </article>)}
  </div>
}

export default function Edik({ match, timeline, rating, heroMap, meSlot, initialFight }: {
  match: MatchDetails; timeline: MatchTimeline | null; rating: DraftRating | null; heroMap: Map<number, HeroInfo>; meSlot: number | null; initialFight: number | null
}) {
  const roster = [true, false].flatMap(radiant => match.players.filter(p => p.isRadiant === radiant).map((p, i) => ({ p, slot: (radiant ? 0 : 128) + i })))
  const [selected, setSelected] = useState(meSlot ?? roster[0]?.slot ?? 0)
  const [mode, setMode] = useState<'lane' | 'fight' | 'match'>(initialFight !== null ? 'fight' : 'lane')
  const [fightId, setFightId] = useState<number | null>(initialFight)
  const [episodes, setEpisodes] = useState(initialFight !== null)
  const [run, setRun] = useState(initialFight !== null)
  const fights = rankTeamfights(timeline), key = keyTeamfight(timeline)
  const fight = fights.find(f => f.index === fightId) ?? key ?? fights[0]
  const member = roster.find(m => m.slot === selected) ?? roster[0]
  if (!member) return null
  const { p, slot } = member
  const hero = heroMap.get(p.heroId)
  const lane = rating?.lanes.find(l => [...l.radiant, ...l.dire].some(q => q.heroId === p.heroId)) ?? null
  const opponents = match.players.filter(q => q.isRadiant !== p.isRadiant)
  const review = run && p.evidence ? deepReview(p, opponents, match.durationSeconds) : null
  const build = review?.sections.find(section => section.id === 'build') ?? null
  const rest: DeepSection[] = review?.sections.filter(section => section.id !== 'build') ?? []
  const notes = !episodes ? [] : mode === 'lane' ? reviewLane(p, lane, timeline) : mode === 'match' ? reviewMatch(p, match.durationSeconds, opponents)
    : fight && timeline ? reviewFight(p, fight, timeline, slot) : []
  const team = match.players.filter(q => q.isRadiant === p.isRadiant)
  const assessment = episodes ? assessPlayer({ ...p, teamKills: team.reduce((n, q) => n + q.kills, 0), teamDamage: team.reduce((n, q) => n + q.heroDamage, 0) }, match.durationSeconds, null) : null

  return <section className="edik" aria-labelledby="edik-title">
    <header className="edik-header">
      <div><h2 id="edik-title">Эдик · разбор одной игры</h2><p>Разбор по желанию: выбери героя, запусти проверку и получи главные ошибки, разбор сборки под пик врага и план на следующую игру.</p></div>
      <span className="edik-source">По событиям разобранного реплея</span>
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
      <button type="button" className="btn" aria-expanded={run} disabled={!p.evidence} onClick={() => setRun(!run)}>
        {run ? 'Закрыть разбор' : 'Хочу разбор'}
      </button>
    </div>

    {!p.evidence && <p className="edik-empty">Реплей этой игры ещё не разобран: как только он загрузится, разбор появится здесь. Пока можно смотреть матч целиком.</p>}

    {!run && p.evidence && <div className="edik-start">
      <h3>Что проверяет Эдик</h3>
      <ul>
        <li>Главные ошибки: смерти, размены и потерянный темп — с фактом из реплея и советом.</li>
        <li>Сборка под пик врага: хватало ли контроля, магии и защиты от физического урона у врага, и когда появился ответ.</li>
        <li>Вывод по игре и план, как играть лучше на этом герое.</li>
      </ul>
      <p>Разбор идёт по событиям реплея: смерти, поминутная линия, драки, применения предметов. Туман войны, доступность крипов и готовность способностей реплей не показывает — там, где данных нет, разбор говорит об этом прямо.</p>
    </div>}

    {review && <>
      <section className="edik-summary" aria-labelledby="edik-errors-title">
        <header className="edik-deep-head"><h3 id="edik-errors-title">Главные ошибки</h3><p>{review.lead}</p></header>
        {review.priorities.length
          ? <Notes items={review.priorities} slot={slot} />
          : <p className="edik-empty">Измеряемые поводы проверить не выделены: смерти, линия и темп в этом матче не дали эпизода с конкретной потерей. Это не значит, что игра была без ошибок — реплей не показывает обзор и готовность способностей.</p>}
      </section>

      {build && <section className="edik-deep-section" aria-labelledby="edik-build-title">
        <header className="edik-deep-head"><h3 id="edik-build-title">{build.title}</h3><p>{build.lead}</p></header>
        <Notes items={build.items} slot={slot} />
      </section>}

      <section className="edik-verdict" aria-labelledby="edik-verdict-title">
        <h3 id="edik-verdict-title">Вывод</h3>
        <p>{review.verdict}</p>
        <h3>Как играть лучше</h3>
        <ol>{review.playbook.map(line => <li key={line}>{line}</li>)}</ol>
      </section>

      {rest.length ? <details className="edik-deep">
        <summary>Полный разбор по разделам</summary>
        {rest.map(section => <section key={section.id} className="edik-deep-section">
          <header className="edik-deep-head"><h3>{section.title}</h3><p>{section.lead}</p></header>
          <Notes items={section.items} slot={slot} />
        </section>)}
      </details> : null}

      <details className="analysis-method edik-gaps"><summary>Чего реплей не показывает</summary>
        <ul>{review.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
      </details>
    </>}

    <details className="analysis-method edik-details" open={episodes} onToggle={e => setEpisodes(e.currentTarget.open)}>
      <summary>Все эпизоды и измерения</summary>
      {episodes && <>
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
    <details className="analysis-method"><summary>Как выбираются пункты разбора</summary><p>С начала идёт сравнение с тем, как на этом герое играют сильные игроки: медианы и перцентили берутся из наших разобранных матчей Ancient и выше. Дальше разбираются все смерти, поминутная линия, драки и применения способностей. Сборка проверяется от пика врага: контроль, магический и физический урон считаются по игровым файлам Valve, а ответ — по твоим покупкам и по тому, кто и когда тебя убивал. Смерти раньше десятой минуты в претензию по сборке не идут: к этому времени ответ купить не успевают. Один эпизод показывается один раз, а смерть сама по себе не доказывает ошибку решения.</p></details>
  </section>
}