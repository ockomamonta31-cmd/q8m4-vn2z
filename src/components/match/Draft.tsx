// Драфт: лента выборов и банов в порядке очереди плюс составы команд.

import type { HeroInfo, MatchDetails } from '../../api/types'
import { heroImageUrl } from '../../api/heroes'

export default function Draft({ picks, heroMap, match }: {
  picks: MatchDetails['picksBans']
  heroMap: Map<number, HeroInfo>
  match: MatchDetails
}) {
  if (!picks.length) return null
  const hero = (id: number) => heroMap.get(id)
  const sorted = [...picks].sort((a, b) => a.order - b.order)
  const row = (list: typeof picks, isPick: boolean) => list.length === 0 ? null : (
    <div className="drf-r">
      <span className="drf-l">{isPick ? 'Выбор' : 'Баны'}</span>
      <div className="drf-cells">
        {list.filter((p) => p.isRadiant).map((p) => (
          <Slot key={`${p.order}`} hero={hero(p.heroId)} order={p.order} cls="r" ban={!isPick} />
        ))}
      </div>
      <span className="drf-l" />
      <div className="drf-cells">
        {list.filter((p) => !p.isRadiant).map((p) => (
          <Slot key={`${p.order}`} hero={hero(p.heroId)} order={p.order} cls="d" ban={!isPick} />
        ))}
      </div>
    </div>
  )

  const lineup = (radiant: boolean) => {
    const players = match.players.filter((p) => p.isRadiant === radiant)
    return (
      <div className={`drf-lineup ${radiant ? 'r' : 'd'}`}>
        <span className="drf-lname">{radiant ? 'Radiant' : 'Dire'}</span>
        {players.map((p) => {
          const h = hero(p.heroId)
          return (
            <div className="drf-lrow" key={`${p.steamAccountId}:${p.heroId}`}>
              {h && <img src={heroImageUrl(h.shortName)} alt="" loading="lazy" width={40} height={26} />}
              <b>{h?.name ?? `герой #${p.heroId}`}</b>
              <span>{p.name ?? (p.steamAccountId ? `#${p.steamAccountId}` : 'приватный')}{p.position ? ` · pos ${p.position}` : ''}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <section className="chart">
      <div className="drf-board">
        <div className="chart-h">
          <div>
            <div className="chart-t">Драфт</div>
            <div className="chart-s">Порядок выборов и банов: слева Radiant, справа Dire</div>
          </div>
        </div>
        <div className="drf-r drf-teams">
          <span className="drf-l" />
          <span className="drf-team r">Radiant</span>
          <span className="drf-l" />
          <span className="drf-team d">Dire</span>
        </div>
        {row(sorted.filter((p) => p.isPick), true)}
        {row(sorted.filter((p) => !p.isPick), false)}
      </div>
      <div className="drf-lineups">
        {lineup(true)}
        {lineup(false)}
      </div>
    </section>
  )
}

function Slot({ hero, order, cls, ban }: { hero: HeroInfo | undefined; order: number; cls: 'r' | 'd'; ban: boolean }) {
  const name = hero?.name ?? `герой #${order}`
  return (
    <span className={`draft-slot ${cls}${ban ? ' ban' : ''}`} title={`${name} · ${ban ? 'бан' : 'выбор'} · ${cls === 'r' ? 'Radiant' : 'Dire'} · очередь ${order + 1}`}>
      {hero && <img src={heroImageUrl(hero.shortName)} alt={hero.name} loading="lazy" width={52} height={34} />}
      <span className="drf-n">{order + 1}</span>
    </span>
  )
}
