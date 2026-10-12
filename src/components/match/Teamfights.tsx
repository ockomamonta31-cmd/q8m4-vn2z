// Тимфайты, упорядоченные по влиянию на матч, с разбор по каждому игроку.
// Порядок важнее размера: драка на 4 трупа, после которой команда пошла кончить
// игру, важнее потасовки на 9 трупов без последствий.

import { useState } from 'react'
import type { HeroInfo, MatchDetails } from '../../api/types'
import { rankTeamfights } from '../../api/timeline'
import { heroImageUrl } from '../../api/heroes'
import { fmtDuration } from '../../api/formats'
import { fmtK } from '../../pages/match-model'
import { Icon } from '../Icons'

/** Слоты Valve: 0-4 Radiant, 128-132 Dire, порядок — как в match.players. */
function useSlotMap(match: MatchDetails) {
  const map = new Map<number, { name: string; heroId: number; radiant: boolean }>()
  for (const radiant of [true, false]) {
    match.players.filter((p) => p.isRadiant === radiant).forEach((p, i) => {
      map.set((radiant ? 0 : 128) + i, {
        name: p.name ?? (p.steamAccountId ? `#${p.steamAccountId}` : 'приватный игрок'),
        heroId: p.heroId,
        radiant,
      })
    })
  }
  return map
}

/** Русское согласование числительного: 1 смерть / 2 смерти / 5 смертей. */
function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10, mod100 = n % 100
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? few : many
  return `${n} ${word}`
}

function fightLength(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  return s < 60 ? `${s}с` : `${Math.floor(s / 60)}м ${String(s % 60).padStart(2, '0')}с`
}

export default function Teamfights({ timeline, heroMap, match, meSlot, limit }: {
  timeline: import('../../api/timeline').MatchTimeline
  heroMap: Map<number, HeroInfo>
  match: MatchDetails
  meSlot: number | null
  limit?: number
}) {
  const all = rankTeamfights(timeline)
  const fights = limit ? all.slice(0, limit) : all
  const [open, setOpen] = useState<number | null>(fights[0]?.index ?? null)
  const who = useSlotMap(match)
  if (!fights.length) return null

  const hasLines = fights.some((f) => f.lines?.length)

  return (
    <section className="panel fights">
      <div className="chart-head">
        <div>
          <div className="chart-title">Тимфайты по важности</div>
          <div className="chart-sub">
            {hasLines
              ? 'Отсортированы по золоту, которое стороны унесли из возни, — оно сходится со строками игроков. Нажми на драку — покажет вклад каждого.'
              : `${fights.length} драк от трёх смертей. Пересобери реплей, чтобы добавить вклад каждого игрока.`}
          </div>
        </div>
        <div className="chart-legend">
          <span className="legend-item"><i style={{ background: 'var(--radiant)' }} />Radiant</span>
          <span className="legend-item"><i style={{ background: 'var(--dire)' }} />Dire</span>
        </div>
      </div>

      <ol className="fight-list">
        {fights.map((fight, rank) => {
          const expanded = open === fight.index
          const decisive = rank === 0
          const side = fight.winner === 'even' ? null : fight.winner === 'radiant' ? 'r' : 'd'
          return (
            <li key={fight.index} className={`fight${expanded ? ' open' : ''}${decisive ? ' decisive' : ''}`}>
              <button
                type="button"
                className="fight-row"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : fight.index)}
              >
                <span className="fight-rank">{rank + 1}</span>
                <span className="fight-time">
                  {fmtDuration(fight.t)}
                  <small>{fightLength(fight.end - fight.t)}</small>
                </span>
                <span className="fight-score">
                  <b className="green">{fight.radiantKills}</b>
                  <span className="sep">:</span>
                  <b className="red">{fight.direKills}</b>
                </span>
                <span className="fight-meta">
                  {plural(fight.deaths, 'смерть', 'смерти', 'смертей')}
                  {fight.buybacks ? ` · ${plural(fight.buybacks, 'байбек', 'байбека', 'байбеков')}` : ''}
                </span>
                <span className={`fight-swing ${side ?? ''}`}>
                  {fight.lines?.length
                    ? `${fight.fightGold >= 0 ? '+' : '−'}${fmtK(Math.abs(fight.fightGold))}`
                    : `${fight.deaths} ×`}
                  <small>{fight.lines?.length ? 'золота в драке' : 'масштаб'}</small>
                  {fight.swing != null && Math.abs(fight.mapSwing - fight.fightGold) > 900 && (
                    <em title="Сдвиг преимущества на карте за окно вокруг драки — сюда попадают башни, крипы и добивания после возни, поэтому цифра может отличаться и даже иметь обратный знак">
                      карта {fight.mapSwing >= 0 ? '+' : '−'}{fmtK(Math.abs(fight.mapSwing))}
                    </em>
                  )}
                </span>
                {decisive && <span className="fight-tag">решающая</span>}
                <Icon.Chevron size={12} className="fight-caret" />
              </button>

              {expanded && fight.lines?.length ? (
                <div className="fight-lines">
                  {[true, false].map((radiant) => (
                    <div className="fight-col" key={radiant ? 'r' : 'd'}>
                      <div className="fight-cols-head">
                        <span />
                        <span />
                        <span title="Урон по героям в драке">урон</span>
                        <span title="Лечение в драке">лечение</span>
                        <span title="Изменение золота в драке">золото</span>
                        <span />
                      </div>
                      {(fight.lines ?? []).filter((l) => (l.slot < 128) === radiant)
                        .sort((a, b) => b.damage - a.damage)
                        .map((l) => {
                          const person = who.get(l.slot)
                          const hero = person ? heroMap.get(person.heroId) : undefined
                          return (
                            <div className={`fight-line ${radiant ? 'r' : 'd'}${l.slot === meSlot ? ' me' : ''}`} key={l.slot}>
                              {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" width={30} height={20} />}
                              <span className="fight-who">
                                <b>{person?.name ?? `слот ${l.slot}`}</b>
                                <small>{l.kills}/{l.deaths}{l.buybacks ? ' · байбек' : ''}</small>
                              </span>
                              <span className="fight-num">{l.damage ? fmtK(l.damage) : '—'}</span>
                              <span className={`fight-num${l.healing ? '' : ' zero'}`}>{l.healing ? fmtK(l.healing) : '—'}</span>
                              <span className={`fight-num ${l.gold >= 0 ? 'green' : 'red'}`}>
                                {l.gold >= 0 ? '+' : '−'}{fmtK(Math.abs(l.gold))}
                              </span>
                              {l.slot === meSlot && <span className="fight-me">ты</span>}
                            </div>
                          )
                        })}
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
