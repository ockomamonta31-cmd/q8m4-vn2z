// Драфт — лента выборов и банов в общем порядке очереди. Бан приглушён и
// перечёркнут, пик обведён цветом команды; номер хода подписан на плитке.

import type { HeroInfo, MatchDetails } from '../../api/types'
import { heroImageUrl } from '../../api/heroes'
import RoleIcon from '../RoleIcon'

export default function Draft({ picks, heroMap, match }: {
  picks: MatchDetails['picksBans']
  heroMap: Map<number, HeroInfo>
  match: MatchDetails
}) {
  if (!picks.length) return null
  const sorted = [...picks].sort((a, b) => a.order - b.order)
  const hero = (id: number) => heroMap.get(id)

  const lineup = (radiant: boolean) => {
    const players = match.players
      .filter((p) => p.isRadiant === radiant)
      .sort((a, b) => (a.positionSource ? a.position : 6) - (b.positionSource ? b.position : 6))
    return (
      <div className={`lu${radiant ? ' r' : ' d'}`}>
        <span className="lu-h">{radiant ? 'Radiant' : 'Dire'}</span>
        {players.map((p) => {
          const h = hero(p.heroId)
          return (
            <div className="lu-r" key={`${p.steamAccountId}:${p.heroId}`}>
              <RoleIcon position={p.position} source={p.positionSource} lane={p.lane} size={40} />
              <span className={`port ${radiant ? 'r' : 'd'}`}>
                {h && <img src={heroImageUrl(h.shortName)} alt="" loading="lazy" />}
              </span>
              <span className="lu-n">
                <b>{h?.name ?? `герой #${p.heroId}`}</b>
                <span className="dim">{p.name ?? (p.steamAccountId ? `#${p.steamAccountId}` : 'приватный')}</span>
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <section className="chart">
      <div className="chart-h">
        <div>
          <div className="chart-t">Драфт</div>
          <div className="chart-s">Порядок выборов и банов слева направо: очередь 1 — первый бан Radiant</div>
        </div>
      </div>

      <ol className="drf">
        {sorted.map((p) => {
          const h = hero(p.heroId)
          const ban = !p.isPick
          return (
            <li
              key={`${p.order}-${p.heroId}`}
              className={`drf-c ${p.isRadiant ? 'r' : 'd'}${ban ? ' ban' : ''}`}
              title={`${h?.name ?? `герой #${p.heroId}`} · ${ban ? 'бан' : 'выбор'} · ${p.isRadiant ? 'Radiant' : 'Dire'} · ход ${p.order + 1}`}
            >
              {h && <img src={heroImageUrl(h.shortName)} alt={h.name} loading="lazy" />}
              <span className="drf-n">{p.order + 1}</span>
            </li>
          )
        })}
      </ol>

      <div className="lu-board">
        {lineup(true)}
        {lineup(false)}
      </div>
    </section>
  )
}
