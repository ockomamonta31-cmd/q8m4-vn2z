// Тимфайты, упорядоченные по влиянию на матч, с разбор по каждому игроку.
// Порядок важнее размера: драка на 4 трупа, после которой команда пошла кончить
// игру, важнее потасовки на 9 трупов без последствий.

import { useState } from 'react'
import type { HeroInfo, MatchDetails } from '../../api/types'
import { keyTeamfight, rankTeamfights } from '../../api/timeline'
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
  const key = keyTeamfight(timeline)
  const fights = limit ? all.slice(0, limit) : all
  const [open, setOpen] = useState<number | null>(fights[0]?.index ?? null)
  const who = useSlotMap(match)
  if (!fights.length) return null

  const hasLines = fights.some((f) => f.lines?.length)

  return (
    <section className="chart">
      <div className="chart-h">
        <div>
          <div className="chart-t">Какие бои изменили игру</div>
          <div className="chart-s">
            {hasLines
              ? 'Смотрим изменение перевеса относительно стадии игры, смену лидера и объекты после боя. Открой бой, чтобы увидеть основание и строки игроков.'
              : `${fights.length} драк от трёх смертей. Пересобери реплей, чтобы добавить вклад каждого игрока.`}
          </div>
        </div>
        <div className="legend">
          <span className=""><i style={{ background: 'var(--radiant)' }} />Radiant</span>
          <span className=""><i style={{ background: 'var(--dire)' }} />Dire</span>
        </div>
      </div>

      {!key && <p className="analysis-caption">По записанным событиям убедительный перелом не найден. Первая строка не объявляется решающей.</p>}

      <ol className="flist">
        {fights.map((fight, rank) => {
          const expanded = open === fight.index
          const decisive = fight.index === key?.index
          const side = fight.winner === 'even' ? null : fight.winner === 'radiant' ? 'r' : 'd'
          return (
            <li key={fight.index} className={`frow${expanded ? ' open' : ''}${decisive ? ' top' : ''}`}>
              <button
                type="button"
                className="fbtn"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : fight.index)}
              >
                <span className="fr">{rank + 1}</span>
                <span className="ft">
                  {fmtDuration(fight.t)}
                  <small>{fightLength(fight.end - fight.t)}</small>
                </span>
                <span className="fs">
                  <b className="pos">{fight.radiantKills}</b>
                  <span className="sep">:</span>
                  <b className="neg">{fight.direKills}</b>
                </span>
                <span className="fm">
                  {plural(fight.deaths, 'смерть', 'смерти', 'смертей')}
                  {fight.buybacks ? ` · ${plural(fight.buybacks, 'байбек', 'байбека', 'байбеков')}` : ''}
                </span>
                <span className={`fw ${side ?? ''}`}>
                  {fight.lines?.length
                    ? `${fight.fightGold >= 0 ? '+' : '−'}${fmtK(Math.abs(fight.fightGold))}`
                    : `${fight.deaths} ×`}
                  <small>{fight.lines?.length ? 'золота в драке' : 'масштаб'}</small>
                  {fight.mapSwing != null && Math.abs(fight.mapSwing - fight.fightGold) > 900 && (
                    <em title="Сдвиг преимущества на карте за окно вокруг драки — сюда попадают башни, крипы и добивания после возни, поэтому цифра может отличаться и даже иметь обратный знак">
                      карта {fight.mapSwing >= 0 ? '+' : '−'}{fmtK(Math.abs(fight.mapSwing))}
                    </em>
                  )}
                </span>
                <span className="badge">{decisive ? 'ключевой по данным' : ''}</span>
                <Icon.Chevron size={12} className="c-go" />
              </button>

              {expanded && <div className="fight-reasons"><h3>Почему этот бой здесь</h3><ul>{fight.reasons.map(r => <li key={r}>{r}</li>)}</ul><a href={`?tab=edik&fight=${fight.index}`}>Разобрать бой с Эдиком</a></div>}
              {expanded && fight.lines?.length ? (
                <div className="fcols">
                  {[true, false].map((radiant) => (
                    <div className="fcol" key={radiant ? 'r' : 'd'}>
                      <h4 className={radiant ? 'pos' : 'neg'}>{radiant ? 'Radiant' : 'Dire'}</h4>
                      <div className="fcolh">
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
                            <div className={`fline ${radiant ? 'r' : 'd'}${l.slot === meSlot ? ' me' : ''}`} key={l.slot}>
                              {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" width={30} height={20} />}
                              <span className="fwho">
                                <b>{person?.name ?? `слот ${l.slot}`}</b>
                                <small>{l.kills}/{l.deaths}{l.buybacks ? ' · байбек' : ''}</small>
                              </span>
                              <span className="fn">{l.damage ? fmtK(l.damage) : '—'}</span>
                              <span className={`fn${l.healing ? '' : ' zero'}`}>{l.healing ? fmtK(l.healing) : '—'}</span>
                              <span className={`fn ${l.gold >= 0 ? 'pos' : 'neg'}`}>
                                {l.gold >= 0 ? '+' : '−'}{fmtK(Math.abs(l.gold))}
                              </span>
                              {l.slot === meSlot && <span className="fme">ты</span>}
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
