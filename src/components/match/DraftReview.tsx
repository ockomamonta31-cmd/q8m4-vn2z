// Линии матча: кто против кого стоит на самом деле и кто, по-хорошему,
// свою линию забирает. Состав описан тегами Valve, цифры — из этого матча.

import { useEffect, useState } from 'react'
import type { HeroInfo, MatchPlayer } from '../../api/types'
import { heroImageUrl } from '../../api/heroes'
import { ATTR_RU, ATTACK_RU, TAG_ORDER, TAG_RU, getHeroMeta, type HeroMeta } from '../../api/heroMeta'
import { draftNotes, teamProfile, type TeamProfile } from '../../api/draft'
import { type DraftRating, type LaneCall } from '../../api/draftStrength'
import RoleIcon from '../RoleIcon'

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

function Hero({ player, heroMap, side }: { player: MatchPlayer | null; heroMap: Map<number, HeroInfo>; side: 'r' | 'd' }) {
  if (!player) return <span className={`lm-hero ${side} empty`}>на этой линии с той стороны никого</span>
  const h = heroMap.get(player.heroId)
  const early = laning(player)
  return (
    <span className={`lm-hero ${side}`}>
      <RoleIcon position={player.position} source={player.positionSource} lane={player.lane} size={24} />
      <span className={`port xs ${side}`}>{h && <img src={heroImageUrl(h.shortName)} alt="" loading="lazy" />}</span>
      <span className="lm-hero-txt">
        <b>{h?.name ?? `герой #${player.heroId}`}</b>
        {early
          ? <span className="dim t12">{early.lastHits} LH · {early.experience.toLocaleString('ru-RU')} XP · {early.gold.toLocaleString('ru-RU')} золота за 10 мин</span>
          : <span className="dim t12">{player.goldPerMinute} GPM · {player.experiencePerMinute} XPM · {player.numLastHits} LH — за весь матч</span>}
      </span>
    </span>
  )
}

const fmt = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(0)}`

/** Первые 10 минут героя из нашего разбора реплея — это и есть линия. */
const laning = (p: MatchPlayer) => p.impactPhases?.find((x) => x.label.startsWith('Начало')) ?? null

function Call({ kind, title, call, missing }: { kind: 'expected' | 'result'; title: string; call: LaneCall['expected'] | LaneCall['laning']; missing: string }) {
  return (
    <div className={`lm-call ${kind}`}>
      <span className="lm-call-k">{title}</span>
      {call ? (
        <>
          <b className="lm-call-t">{call.text}</b>
          {!!call.lines.length && (
            <ul className="lm-call-l">
              {call.lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          )}
        </>
      ) : <b className="lm-call-t dim">{missing}</b>}
    </div>
  )
}

function Lane({ lane, heroMap }: { lane: LaneCall; heroMap: Map<number, HeroInfo> }) {
  return (
    <section className="lm">
      <header className="lm-h">
        <span className="lm-t-wrap">
          <h5 className="lm-t">{lane.label}</h5>
          <span className="dim t12">{lane.note}</span>
        </span>
        <span className={`lm-badge ${lane.expected?.side === 'even' ? 'dim' : lane.hit === null ? 'dim' : lane.hit ? 'pos' : 'neg'}`}>
          {lane.expected?.side === 'even'
            ? 'драфт обещал равную'
            : lane.hit === null
              ? 'проверить нечем'
              : lane.hit ? 'совпало' : 'не совпало'}
        </span>
      </header>

      <div className="lm-calls">
        <Call kind="expected" title="Что обещал драфт" call={lane.expected} missing="предсказать нечего: профилей этих героев на этих ролях мало" />
        <Call kind="result" title="Первые 10 минут — сама линия" call={lane.laning} missing="реплей не разобран: чем закончилась именно линия, не измерено" />
      </div>

      {!!lane.full && (
        <details className="lm-full">
          <summary>Вся игра этой парой — это не итог линии, а что стороны вынесли из матча</summary>
          <ul className="lm-call-l">
            {lane.full.lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </details>
      )}

      <ul className="lm-pairs">
        {lane.pairs.map((pair, i) => {
          const r = pair.radiant
          const d = pair.dire
          const rl = r ? laning(r) : null
          const dl = d ? laning(d) : null
          const gap = rl && dl ? { lh: rl.lastHits - dl.lastHits, xp: rl.experience - dl.experience, gold: rl.gold - dl.gold } : null
          return (
            <li className="lm-pair" key={`${i}-${r?.heroId ?? 'x'}-${d?.heroId ?? 'x'}`}>
              <Hero player={r} heroMap={heroMap} side="r" />
              <span className="lm-vs">против</span>
              <Hero player={d} heroMap={heroMap} side="d" />
              <span className="lm-d">
                {gap
                  ? <>
                    <b className={gap.lh > 0 ? 'pos' : gap.lh < 0 ? 'neg' : 'dim'}>{fmt(gap.lh)} LH</b>
                    <span className="dim t12">{fmt(gap.xp)} XP · {fmt(gap.gold)} золота за 10 мин</span>
                  </>
                  : <span className="dim t12">{r && d ? 'первых 10 минут нет в разборе' : 'прямого соперника нет'}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function DraftReview({ players, heroMap, rating }: {
  players: MatchPlayer[]
  heroMap: Map<number, HeroInfo>
  rating: DraftRating | null
}) {
  const [meta, setMeta] = useState<Map<number, HeroMeta> | null>(null)
  useEffect(() => { let alive = true; getHeroMeta().then((m) => alive && setMeta(m)); return () => { alive = false } }, [])

  if (!meta || meta.size === 0) return null

  const radiant = teamProfile(players, true, meta)
  const dire = teamProfile(players, false, meta)

  return (
    <section className="dr-review">
      <header className="chart-h">
        <div>
          <div className="chart-t">Линии</div>
          <div className="chart-s">Мид против мида, керри с саппортом против чужого оффлейна — как это устроено на карте</div>
        </div>
      </header>

      {rating ? (
        <div className="lm-list">
          {rating.lanes.map((lane) => <Lane key={lane.key} lane={lane} heroMap={heroMap} />)}
        </div>
      ) : (
        <p className="pnote">Профиль героев ещё не подгрузился — линии без предсказания.</p>
      )}

      <p className="pnote">
        Линия — это первые ~10 минут, и измеряются они только в разобранном реплее:
        справа то, что стороны нафармили и получили за этот отрезок (добивания, опыт,
        золото), а линию отдаём той стороне, за которой большинство замеров. Слева —
        что обещал драфт: как эти герои на этих ролях стоят такие линии по нашей базе
        ({rating ? rating.corpus : '…'} матчей), по осям фарма, драки и поддержки.
        Числа за весь матч вынесены отдельно и линией не называются.
        {rating?.model && (rating.model.lanesMeasured >= 50
          ? ` Предсказание проверено на ${rating.model.lanesMeasured} разобранных линиях — совпало в ${(rating.model.laneAccuracy * 100).toFixed(0)}% случаев.`
          : ` Проверить предсказание линии пока можно только на ${rating?.model ? rating.model.lanesMeasured : 0} разобранных линиях — это капля, выводом не называем.`)}
        {rating && !rating.realLanes ? ' Линии этого матча взяты из порядка фарма, а не из разобранного реплея.' : ''}
      </p>

      <div className="dr-block">
        <h4 className="dr-h">Состав по тегам Valve</h4>
        <div className="dr-cols">
          <Side team={radiant} />
          <Side team={dire} />
        </div>
      </div>

      <div className="dr-block">
        <h4 className="dr-h">Что следует из состава</h4>
        <div className="dr-cols">
          {([radiant, dire] as const).map((t) => {
            const notes = draftNotes(t, t.radiant ? dire : radiant)
            return (
              <ul className={`dr-notes ${t.radiant ? 'r' : 'd'}`} key={t.radiant ? 'r' : 'd'}>
                {notes.length
                  ? notes.map((n) => <li key={n}>{n}</li>)
                  : <li className="dim">Состав без явных перекосов по тегам.</li>}
              </ul>
            )
          })}
        </div>
      </div>
    </section>
  )
}
