import { useState } from 'react'
import type { DraftRating } from '../../api/draftStrength'
import type { HeroInfo, MatchDetails } from '../../api/types'
import { keyTeamfight, rankTeamfights, type MatchTimeline } from '../../api/timeline'
import { reviewFight, reviewLane, reviewMatch } from '../../api/coach'
import { heroImageUrl } from '../../api/heroes'
import { fmtDuration } from '../../api/formats'
import { Route } from './MapPlays'

export default function Edik({ match, timeline, rating, heroMap, meSlot, initialFight }: {
  match: MatchDetails; timeline: MatchTimeline | null; rating: DraftRating | null; heroMap: Map<number, HeroInfo>; meSlot: number | null; initialFight: number | null
}) {
  const roster = [true, false].flatMap(radiant => match.players.filter(p => p.isRadiant === radiant).map((p, i) => ({ p, slot: (radiant ? 0 : 128) + i })))
  const [selected, setSelected] = useState(meSlot ?? roster[0]?.slot ?? 0)
  const [mode, setMode] = useState<'lane' | 'fight' | 'match'>(initialFight !== null ? 'fight' : 'lane')
  const fights = rankTeamfights(timeline)
  const key = keyTeamfight(timeline)
  const [fightId, setFightId] = useState<number | null>(initialFight)
  const fight = fights.find(f => f.index === fightId) ?? key ?? fights[0]
  const member = roster.find(m => m.slot === selected) ?? roster[0]
  if (!member) return null
  const { p, slot } = member
  const hero = heroMap.get(p.heroId)
  const lane = rating?.lanes.find(l => [...l.radiant, ...l.dire].some(q => q.heroId === p.heroId)) ?? null
  const notes = mode === 'lane' ? reviewLane(p, lane, timeline) : mode === 'match' ? reviewMatch(p)
    : fight && timeline ? reviewFight(p, fight, timeline, slot) : []

  return <section className="edik" aria-labelledby="edik-title">
    <header className="edik-header">
      <div><h2 id="edik-title">Эдик разберёт</h2><p>Где потерял темп, как вошёл в бой и что получилось на карте.</p></div>
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
        </div>
        {note.play && <div className="edik-route"><Route play={note.play} heroId={p.heroId} /><p>Жёлтый — твой маршрут; зелёный — Radiant, красный — Dire. Истинные позиции без тумана войны.</p></div>}
      </article>)}
    </div>
    <details className="analysis-method"><summary>На чём основаны объяснения Эдика</summary><p>Эдик сопоставляет измеренные первые десять минут, события смертей, строки участников боёв и маршруты. Советы — правила разбора с привязкой к этим событиям. Видимость, кулдауны, команды союзников и альтернативные решения пока не восстановлены: причины ошибок остаются вопросами для проверки, а не доказанными обвинениями.</p></details>
  </section>
}
