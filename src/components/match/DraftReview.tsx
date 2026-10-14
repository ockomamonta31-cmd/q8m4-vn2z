// Линии матча: кто против кого стоит на самом деле и кто, по-хорошему,
// свою линию забирает. Состав описан тегами Valve, цифры — из этого матча.

import { useEffect, useState } from 'react'
import type { HeroInfo, MatchPlayer } from '../../api/types'
import { heroImageUrl } from '../../api/heroes'
import { ATTR_RU, ATTACK_RU, TAG_ORDER, TAG_RU, getHeroMeta, type HeroMeta } from '../../api/heroMeta'
import { teamProfile, type TeamProfile } from '../../api/draft'
import { roleModelStats } from '../../api/roleModel'
import { type DraftRating, type LaneCall } from '../../api/draftStrength'
import RoleIcon from '../RoleIcon'
import { earlyPhase, laneMeasurements } from '../../api/coach'

function Side({ team }: { team: TeamProfile }) {
  return (
    <div className={`dr-side ${team.radiant ? 'r' : 'd'}`}>
      <h4 className={`dr-team ${team.radiant ? 'r' : 'd'}`}>{team.radiant ? 'Radiant' : 'Dire'}</h4>

      <div className="dr-chips">
        {Object.entries(team.attr).filter(([, n]) => n > 0).map(([a, n]) => (
          <span className="chip" key={a}><b>{n}</b> {ATTR_RU[a] ?? a}</span>
        ))}
        <span className="chip">{team.ranged} <span className="dim">{ATTACK_RU.ranged}</span> · {team.melee} <span className="dim">{ATTACK_RU.melee}</span></span>
      </div>

      <ul className="dr-tags">
        {TAG_ORDER.map((t) => {
          const n = team.tags[t] ?? 0
          return (
            <li key={t} className={n ? '' : 'zero'}>
              <span className="dr-tag-n">{n}</span>
              <span className="dr-tag-l">{TAG_RU[t] ?? t}</span>
              <span className="dr-tag-t"><i style={{ width: `${(n / 5) * 100}%` }} /></span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Hero({ player, heroMap, side }: { player: MatchPlayer; heroMap: Map<number, HeroInfo>; side: 'r' | 'd' }) {
  const h = heroMap.get(player.heroId)
  const early = earlyPhase(player)
  return <div className={`lane-player ${side}`}>
    {h && <img src={heroImageUrl(h.shortName)} alt="" width="48" height="28" loading="lazy" />}
    <div><b>{h?.name ?? `Герой #${player.heroId}`}</b><span>{player.name ?? 'Скрытый профиль'}</span></div>
    <RoleIcon position={player.position} source={player.positionSource} lane={player.lane} size={24} />
    {early && <span className="lane-player-farm">Добивания: {early.lastHits} · смерти: {early.deaths}</span>}
  </div>
}

function Lane({ lane, heroMap }: { lane: LaneCall; heroMap: Map<number, HeroInfo> }) {
  const totals = laneMeasurements(lane)
  const result = lane.laning?.side
  const expected = lane.expected?.side
  const metrics = totals ? [
    { label: 'Золото', r: totals.r.gold, d: totals.d.gold },
    { label: 'Опыт', r: totals.r.experience, d: totals.d.experience },
    { label: 'Добивания', r: totals.r.lastHits, d: totals.d.lastHits },
    { label: 'Смерти игроков группы', r: totals.r.deaths, d: totals.d.deaths },
  ] : []
  return <section className="lane-review">
    <header className="lane-heading"><div><h3>{lane.label}</h3><p>{lane.note}</p></div>
      <div className={`lane-result ${result === 'radiant' ? 'pos' : result === 'dire' ? 'neg' : 'dim'}`}><b>{!result ? 'Итог не измерен' : result === 'even' ? 'Примерно равная' : `Перевес ${result === 'radiant' ? 'Radiant' : 'Dire'}`}</b><span>Первые 10 минут</span></div>
    </header>
    <div className="lane-lineups">{([true, false] as const).map(radiant => <div key={String(radiant)}>
      <h4 className={radiant ? 'pos' : 'neg'}>{radiant ? 'Radiant' : 'Dire'}</h4>
      {(radiant ? lane.radiant : lane.dire).map(p => <Hero key={p.heroId} player={p} heroMap={heroMap} side={radiant ? 'r' : 'd'} />)}
    </div>)}</div>
    {totals ? <table className="lane-metrics"><caption>Что получили игроки этой линии к 10:00</caption><thead><tr><th scope="col">Показатель</th><th scope="col">Radiant</th><th scope="col">Dire</th></tr></thead><tbody>
      {metrics.map(m => <tr key={m.label}><th scope="row">{m.label}</th><td>{m.r.toLocaleString('ru-RU')}</td><td>{m.d.toLocaleString('ru-RU')}</td></tr>)}
    </tbody></table> : <p className="analysis-empty">Первые десять минут не разобраны. По итоговым показателям матча нельзя восстановить результат линии.</p>}
    <div className="lane-expectation"><b>Ожидание по составу</b><span>{!lane.expected ? 'Профилей героев недостаточно.' : expected === 'even' ? 'Без заметного перевеса.' : `Перевес ${expected === 'radiant' ? 'Radiant' : 'Dire'} по профилям героев.`}</span>{lane.share !== null && <span>Доля модельной силы: Radiant {Math.round(lane.share * 100)} / Dire {100 - Math.round(lane.share * 100)}. Это не шанс победы.</span>}</div>
    <details className="analysis-method"><summary>Почему ожидали такой результат</summary><ul>{lane.expected?.lines.map(l => <li key={l}>{l}</li>) ?? <li>Нет достаточной выборки.</li>}</ul></details>
    {lane.full && <details className="analysis-method"><summary>Показатели этой группы за весь матч</summary><ul>{lane.full.lines.map(l => <li key={l}>{l}</li>)}</ul></details>}
  </section>
}

export default function DraftReview({ players, heroMap, rating }: {
  players: MatchPlayer[]
  heroMap: Map<number, HeroInfo>
  rating: DraftRating | null
}) {
  const [meta, setMeta] = useState<Map<number, HeroMeta> | null>(null)
  useEffect(() => { let alive = true; getHeroMeta().then((m) => alive && setMeta(m)); return () => { alive = false } }, [])

  const radiant = meta ? teamProfile(players, true, meta) : null
  const dire = meta ? teamProfile(players, false, meta) : null

  return (
    <section className="dr-review">
      <header className="chart-h">
        <div>
          <h2 className="chart-t">Как закончились линии</h2>
          <div className="chart-s">Состав каждой стороны и измеренный результат к 10:00. Верх и низ названы по карте.</div>
        </div>
      </header>

      {rating ? (
        <div className="lm-list">
          {rating.lanes.map((lane) => <Lane key={lane.key} lane={lane} heroMap={heroMap} />)}
        </div>
      ) : (
        <p className="analysis-empty">Профили героев загружаются. Измеренные показатели появятся вместе с группами линий.</p>
      )}
      {rating && !rating.realLanes && <p className="analysis-caption">Распределение по линиям оценено по ролям; фактические линии в данных не указаны.</p>}
      <details className="analysis-method"><summary>Как определяем итог и насколько надёжен прогноз</summary>
        <p>Итог — большинство из трёх замеров: золото, опыт, добивания. Разница до 3% считается равной. Это показатели игроков группы за первые десять минут, включая выходы с линии; место каждой смерти здесь не утверждается.</p>
        <p>Прогноз основан на профилях героев на их ролях, база — {rating?.corpus ?? '…'} матчей. Проверено линий с измеренным началом: {rating?.model?.lanesMeasured ?? 0}. Малая выборка не позволяет считать прогноз надёжным.</p>
        {rating && !rating.realLanes && <p>Распределение по линиям оценено по ролям. Модель ролей обучена на {roleModelStats.teams.toLocaleString('ru-RU')} командах; точность на её проверочной выборке {Math.round(roleModelStats.accuracy * 100)}%.</p>}
      </details>

      {radiant && dire && <details className="analysis-method"><summary>Свойства составов по тегам Valve</summary>
      <div className="dr-block">
        <h4 className="dr-h">Состав по тегам Valve</h4>
        <div className="dr-cols">
          <Side team={radiant} />
          <Side team={dire} />
        </div>
      </div>

      <p>Теги описывают общие свойства героев. Они не определяют тип нанесённого урона, доступные в этом матче способности или причину поражения.</p>
      </details>}
    </section>
  )
}
