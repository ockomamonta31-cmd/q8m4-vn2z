// Лента событий матча: ось времени с полосами тимфайтов и feed
// убийств / строений / Рошана. Без реплея секция не показывается.

import { useMemo, useState } from 'react'
import type { HeroInfo } from '../../api/types'
import type { MatchTimeline } from '../../api/timeline'
import { heroImageUrl } from '../../api/heroes'
import { fmtDuration } from '../../api/formats'
import { Icon } from '../Icons'

const LANE_RU: Record<string, string> = { top: 'верхняя', mid: 'центральная', bot: 'нижняя' }

type FeedItem = {
  t: number
  side: 'r' | 'd' | ''
  kind: 'kill' | 'tower' | 'barracks' | 'fort' | 'roshan' | 'blood'
  text: string
  heroId?: number
  victimId?: number
}

export default function Timeline({ timeline, heroMap, durationSec }: {
  timeline: MatchTimeline
  heroMap: Map<number, HeroInfo>
  durationSec: number
}) {
  const [showKills, setShowKills] = useState(false)
  const heroName = (id?: number | null) => (id ? (heroMap.get(id)?.name ?? `герой #${id}`) : 'кто-то')

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = []
    if (timeline.firstBlood.t) {
      items.push({
        t: timeline.firstBlood.t,
        side: timeline.kills.find((k) => k.t === timeline.firstBlood.t)?.radiant ? 'r' : 'd',
        kind: 'blood',
        text: `Первая кровь — ${heroName(timeline.firstBlood.heroId)}`,
        heroId: timeline.firstBlood.heroId ?? undefined,
      })
    }
    for (const s of timeline.structures) {
      const lane = s.lane ? ` · ${LANE_RU[s.lane]}` : ''
      items.push({
        t: s.t,
        side: s.radiant == null ? '' : s.radiant ? 'r' : 'd',
        kind: s.kind,
        text: s.kind === 'tower'
          ? `Снесена башня T${s.tier}${lane}`
          : s.kind === 'barracks'
            ? `Снесены казармы (${s.tier === 1 ? 'ближнего' : 'дальнего'} боя)${lane}`
            : 'Древний пал',
        heroId: s.heroId ?? undefined,
      })
    }
    for (const r of timeline.roshans) {
      items.push({ t: r.t, side: r.radiant ? 'r' : 'd', kind: 'roshan', text: `Рошан убит — ${r.radiant ? 'Radiant' : 'Dire'}` })
    }
    if (showKills) {
      for (const k of timeline.kills) {
        items.push({
          t: k.t,
          side: k.radiant ? 'r' : 'd',
          kind: 'kill',
          text: `${heroName(k.heroId)} убивает ${heroName(k.victimHeroId)}`,
          heroId: k.heroId,
          victimId: k.victimHeroId,
        })
      }
    }
    return items.sort((a, b) => a.t - b.t)
  }, [timeline, showKills, heroMap])

  const marks = {
    kills: timeline.kills.length,
    structures: timeline.structures.length,
    roshans: timeline.roshans.length,
    fights: timeline.teamfights.length,
  }

  return (
    <section className="panel timeline-wrap">
      <div className="chart-head">
        <div>
          <div className="chart-title">Хронология матча</div>
          <div className="chart-sub">
            {marks.kills} убийств · {marks.structures} строений · {marks.roshans} Рошан · {marks.fights} тимфайтов
          </div>
        </div>
        <div className="tabs" role="group" aria-label="Показ убийств" style={{ margin: 0, padding: 2 }}>
          <button type="button" className={`tab${!showKills ? ' active' : ''}`} style={{ padding: '5px 12px' }} aria-pressed={!showKills} onClick={() => setShowKills(false)}>
            Ключевые
          </button>
          <button type="button" className={`tab${showKills ? ' active' : ''}`} style={{ padding: '5px 12px' }} aria-pressed={showKills} onClick={() => setShowKills(true)}>
            Все убийства
          </button>
        </div>
      </div>

      <div className="timeline-axis" aria-hidden="true">
        {timeline.teamfights.map((fight) => (
          <span
            key={fight.index}
            className="tl-band"
            style={{
              left: `${(fight.t / durationSec) * 100}%`,
              width: `${(Math.max(fight.end - fight.t, 30) / durationSec) * 100}%`,
            }}
            title={`Тимфайт ${fmtDuration(fight.t)}–${fmtDuration(fight.end)} · ${fight.deaths} смертей`}
          />
        ))}
        <span className="tl-lane" style={{ top: '46px' }} />
        {timeline.structures.map((s, i) => (
          <span
            key={`s${i}`}
            className={`tl-event ${s.radiant ? 'r' : s.radiant === false ? 'd' : ''}`}
            style={{ left: `${(s.t / durationSec) * 100}%`, top: s.kind === 'fort' ? 58 : s.kind === 'barracks' ? 40 : 22 }}
            title={`${fmtDuration(s.t)} · ${s.kind === 'tower' ? `башня T${s.tier}` : s.kind === 'barracks' ? 'казарма' : 'древний'}${s.lane ? ` · ${LANE_RU[s.lane]}` : ''} · ${s.radiant ? 'снес Dire' : s.radiant === false ? 'снес Radiant' : 'крипы'}`}
          >
            {s.kind === 'tower' ? <Icon.Tower size={11} /> : s.kind === 'barracks' ? <Icon.Shield size={11} /> : <Icon.Target size={11} />}
          </span>
        ))}
        {timeline.roshans.map((r, i) => (
          <span
            key={`r${i}`}
            className={`tl-event ${r.radiant ? 'r' : 'd'}`}
            style={{ left: `${(r.t / durationSec) * 100}%`, top: 70 }}
            title={`${fmtDuration(r.t)} · Рошан — ${r.radiant ? 'Radiant' : 'Dire'}`}
          >
            <Icon.Roshan size={11} />
          </span>
        ))}
      </div>

      <div className="feed" role="list">
        {feed.map((item, i) => (
          <div className="feed-row" role="listitem" key={`${item.t}-${i}`}>
            <span className="feed-time">{fmtDuration(item.t)}</span>
            <span className="feed-who left">
              {item.side === 'r' && item.heroId && heroMap.get(item.heroId) && (
                <img src={heroImageUrl(heroMap.get(item.heroId)!.shortName)} alt="" loading="lazy" width={26} height={18} />
              )}
              {item.side === 'r' && item.heroId && <span>{heroName(item.heroId)}</span>}
            </span>
            <span className={`feed-mark ${item.kind === 'roshan' || item.kind === 'fort' || item.kind === 'blood' ? 'milestone' : ''} ${item.side}`}>
              {item.kind === 'kill' ? <Icon.Sword size={12} />
                : item.kind === 'roshan' ? <Icon.Roshan size={12} />
                : item.kind === 'blood' ? <Icon.Blood size={12} />
                : item.kind === 'tower' ? <Icon.Tower size={12} />
                : item.kind === 'fort' ? <Icon.Target size={12} />
                : <Icon.Shield size={12} />}
              {item.text}
            </span>
            <span className="feed-who right">
              {item.side === 'd' && item.heroId && heroMap.get(item.heroId) && (
                <img src={heroImageUrl(heroMap.get(item.heroId)!.shortName)} alt="" loading="lazy" width={26} height={18} />
              )}
              {item.side === 'd' && item.heroId && <span>{heroName(item.heroId)}</span>}
            </span>
          </div>
        ))}
      </div>

      {timeline.teamfights.length > 0 && (
        <div className="tf-table" aria-label="Крупнейшие тимфайты">
          {timeline.teamfights
            .slice()
            .sort((a, b) => b.deaths - a.deaths)
            .slice(0, 5)
            .map((fight) => (
              <div className="tf-row" key={fight.index}>
                <b>{fmtDuration(fight.t)}</b>
                <span className="muted">{fight.deaths} смертей за {fmtDuration(fight.end - fight.t)}</span>
                <span className="tf-score">
                  <span className="green">{fight.radiantKills}</span> : <span className="red">{fight.direKills}</span>
                </span>
                <span className="muted" style={{ textAlign: 'right' }}>
                  {fight.radiantKills === fight.direKills ? 'ничья' : fight.radiantKills > fight.direKills ? 'Radiant' : 'Dire'}
                </span>
              </div>
            ))}
        </div>
      )}
    </section>
  )
}
