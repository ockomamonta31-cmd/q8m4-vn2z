// Линии матча: кто против кого стоит на самом деле и кто, по-хорошему,
// свою линию забирает. Состав описан тегами Valve, цифры — из этого матча.

import { useEffect, useState } from 'react'
import type { HeroInfo, MatchPlayer } from '../../api/types'
import { heroImageUrl } from '../../api/heroes'
import { ATTR_RU, ATTACK_RU, TAG_ORDER, TAG_RU, getHeroMeta, type HeroMeta } from '../../api/heroMeta'
import { draftNotes, laneGaps, teamProfile, type TeamProfile } from '../../api/draft'
import { callShare, type DraftRating, type LaneCall } from '../../api/draftStrength'
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
  return (
    <span className={`lm-hero ${side}`}>
      <RoleIcon position={player.position} source={player.positionSource} lane={player.lane} size={24} />
      <span className={`port xs ${side}`}>{h && <img src={heroImageUrl(h.shortName)} alt="" loading="lazy" />}</span>
      <span className="lm-hero-txt">
        <b>{h?.name ?? `герой #${player.heroId}`}</b>
        <span className="dim t12">{player.goldPerMinute} GPM · {player.experiencePerMinute} XPM · {player.numLastHits} LH · {player.numDenies} DN</span>
      </span>
    </span>
  )
}

const fmt = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(0)}`

const ratio = (share: number | null) => (share === null ? '—' : `${(share * 100).toFixed(0)} : ${((1 - share) * 100).toFixed(0)}`)

function Lane({ lane, heroMap }: { lane: LaneCall; heroMap: Map<number, HeroInfo> }) {
  const gaps = laneGaps(lane.radiant, lane.dire)
  const call = callShare(lane.share)
  const fact = lane.actual === 'radiant' ? 'взял Radiant' : lane.actual === 'dire' ? 'взяла Dire' : lane.actual === 'even' ? 'равная' : 'неизвестно'
  return (
    <section className="lm">
      <header className="lm-h">
        <span className="lm-t-wrap">
          <h5 className="lm-t">{lane.label}</h5>
          <span className="dim t12">{lane.note}</span>
        </span>
        <span className="lm-calls">
          <span className="lm-call">
            <span className="dim t12">по драфту</span>
            <b>{ratio(lane.share)}</b>
            <span className={`t12 ${call.tone}`}>{call.text}</span>
          </span>
          <span className="lm-call">
            <span className="dim t12">по факту</span>
            <b>{lane.actualEdge === null ? '—' : fmt(lane.actualEdge)}</b>
            <span className="dim t12">{fact}{lane.hit === null ? '' : lane.hit ? ' · совпало' : ' · не совпало'}</span>
          </span>
        </span>
      </header>

      <ul className="lm-pairs">
        {lane.pairs.map((pair, i) => {
          const r = pair.radiant
          const d = pair.dire
          const gap = r && d
            ? { gpm: r.goldPerMinute - d.goldPerMinute, xpm: r.experiencePerMinute - d.experiencePerMinute, lh: r.numLastHits - d.numLastHits }
            : null
          return (
            <li className="lm-pair" key={`${i}-${r?.heroId ?? 'x'}-${d?.heroId ?? 'x'}`}>
              <Hero player={r} heroMap={heroMap} side="r" />
              <span className="lm-vs">против</span>
              <Hero player={d} heroMap={heroMap} side="d" />
              <span className="lm-d">
                {gap
                  ? <>
                    <b className={gap.gpm > 0 ? 'pos' : gap.gpm < 0 ? 'neg' : 'dim'}>{fmt(gap.gpm)} GPM</b>
                    <span className="dim t12">{fmt(gap.xpm)} XPM · {fmt(gap.lh)} LH</span>
                  </>
                  : <span className="dim t12">прямого соперника нет</span>}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="lm-foot">
        <span className="lm-sum r"><b>{gaps.totals.r.gpm}</b> GPM · <b>{gaps.totals.r.xpm}</b> XPM · <b>{gaps.totals.r.lh}</b> LH · <b>{gaps.totals.r.nw}</b> NW</span>
        <span className="dr-mu-bar">
          <i className="mid" aria-hidden="true" />
          {gaps.edge >= 0
            ? <i className="r" style={{ width: `${Math.min(50, Math.abs(gaps.edge) / 2)}%`, left: '50%' }} />
            : <i className="d" style={{ width: `${Math.min(50, Math.abs(gaps.edge) / 2)}%`, right: '50%' }} />}
        </span>
        <span className="lm-sum d"><b>{gaps.totals.d.gpm}</b> GPM · <b>{gaps.totals.d.xpm}</b> XPM · <b>{gaps.totals.d.lh}</b> LH · <b>{gaps.totals.d.nw}</b> NW</span>
      </div>
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
        «По драфту» — предсказание до матча: как такие герои на своих ролях стоят
        такие линии по нашей базе ({rating ? rating.corpus : '…'} матчей). «По факту» —
        что линия реально дала в этом матче: край по GPM, опыту, добиваниям и
        нетворсу. {rating?.model ? `По нашей же базе такая модель берёт линию в ${(rating.model.laneAccuracy * 100).toFixed(0)}% случаев из ${rating.model.lanes} разобранных линий.` : ''}
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
