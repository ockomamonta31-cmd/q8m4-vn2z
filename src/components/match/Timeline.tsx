// Лента событий матча: горизонтальная ось и feed убийств / строений / Рошана.
// Без реплея секция не показывается.

import { useMemo, useState } from 'react'
import type { HeroInfo } from '../../api/types'
import type { MatchTimeline } from '../../api/timeline'
import { fmtDuration } from '../../api/formats'
import { Icon } from '../Icons'

const LANE_RU: Record<string, string> = { top: 'верхняя', mid: 'центральная', bot: 'нижняя' }

type FeedItem = {
  t: number
  side: 'r' | 'd' | ''
  kind: 'kill' | 'tower' | 'barracks' | 'fort' | 'roshan' | 'blood'
  text: string
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
      })
    }
    for (const r of timeline.roshans) {
      items.push({ t: r.t, side: r.radiant ? 'r' : 'd', kind: 'roshan', text: `Рошан убит — ${r.radiant ? 'Radiant' : 'Dire'}` })
    }
    if (showKills) {
      for (const k of timeline.kills) {
        items.push({ t: k.t, side: k.radiant ? 'r' : 'd', kind: 'kill', text: `${heroName(k.heroId)} убивает ${heroName(k.victimHeroId)}` })
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
    <section className="chart">
      <div className="chart-h">
        <div>
          <div className="chart-t">Хронология матча</div>
          <div className="chart-s">
            {marks.kills} убийств · {marks.structures} строений · {marks.roshans} Рошан · {marks.fights} тимфайтов
          </div>
        </div>
        <div className="rail" role="group" aria-label="Показ убийств" style={{ height: 40, gap: 'var(--sp-24)' }}>
          <button type="button" className={`rail-i${!showKills ? ' on' : ''}`} aria-selected={!showKills} onClick={() => setShowKills(false)}>
            Ключевые
          </button>
          <button type="button" className={`rail-i${showKills ? ' on' : ''}`} aria-selected={showKills} onClick={() => setShowKills(true)}>
            Все убийства
          </button>
        </div>
      </div>

      <div className="tl" aria-hidden="true">
        {Array.from({ length: Math.floor(durationSec / 300) + 1 }, (_, i) => (
          <span key={`m${i}`} className="tl-t" style={{ left: `${((i * 300) / durationSec) * 100}%` }}>{i * 5}′</span>
        ))}
        {timeline.teamfights.map((fight) => (
          <span
            key={fight.index}
            className="tl-band"
            style={{
              left: `${(fight.t / durationSec) * 100}%`,
              width: `${(Math.max(fight.end - fight.t, 30) / durationSec) * 100}%`,
            }}
          />
        ))}
        <span className="tl-lane" />
        {timeline.structures.map((s, i) => (
          <span
            key={`s${i}`}
            className={`tl-e ${s.radiant ? 'r' : s.radiant === false ? 'd' : ''}`}
            style={{ left: `${(s.t / durationSec) * 100}%`, top: s.kind === 'fort' ? '72%' : s.kind === 'barracks' ? '58%' : '34%' }}
            title={`${fmtDuration(s.t)} · ${s.kind === 'tower' ? `башня T${s.tier}` : s.kind === 'barracks' ? 'казарма' : 'древний'}${s.lane ? ` · ${LANE_RU[s.lane]}` : ''} · ${s.radiant ? 'снес Dire' : s.radiant === false ? 'снес Radiant' : 'крипы'}`}
          >
            {s.kind === 'tower' ? <Icon.Tower size={20} /> : s.kind === 'barracks' ? <Icon.Shield size={20} /> : <Icon.Target size={20} />}
          </span>
        ))}
        {timeline.roshans.map((r, i) => (
          <span
            key={`r${i}`}
            className={`tl-e ${r.radiant ? 'r' : 'd'}`}
            style={{ left: `${(r.t / durationSec) * 100}%`, top: '86%' }}
            title={`${fmtDuration(r.t)} · Рошан — ${r.radiant ? 'Radiant' : 'Dire'}`}
          >
            <Icon.Roshan size={20} />
          </span>
        ))}
      </div>

      <div className="feed" role="list">
        {feed.map((item, i) => (
          <div className="feed-r" role="listitem" key={`${item.t}-${i}`}>
            <time>{fmtDuration(item.t)}</time>
            <span className={item.side === 'r' ? 'pos' : item.side === 'd' ? 'neg' : 'dim'}>{item.text}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
