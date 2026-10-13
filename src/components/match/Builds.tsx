// Вкладка «Билды»: порядок предметов по времени и прокачка способностей
// по уровням для всех десяти игроков, команда за командой.

import type { HeroInfo, ItemInfo, MatchPlayer } from '../../api/types'
import { heroImageUrl } from '../../api/heroes'
import type { TeamSide } from '../../pages/match-model'
import RoleIcon from '../RoleIcon'
import { BuildTimeline, PurchaseTimeline } from './Build'

const posOf = (p: MatchPlayer) => (p.positionSource ? p.position : 6)

function Side({ side, heroMap, itemMap }: { side: TeamSide; heroMap: Map<number, HeroInfo>; itemMap: Map<number, ItemInfo> }) {
  return (
    <section className={`team ${side.radiant ? 'r' : 'd'}`}>
      <header className="team-h">
        <span className="flag" aria-hidden="true" />
        <h2 className="team-n">{side.label}</h2>
      </header>
      <div className="blds">
        {[...side.players].sort((a, b) => posOf(a) - posOf(b)).map((p) => {
          const hero = heroMap.get(p.heroId)
          return (
            <div className="bld-p" key={`${p.steamAccountId}:${p.heroId}`}>
              <div className="bld-p-h">
                <RoleIcon position={p.position} source={p.positionSource} lane={p.lane} radiant={p.isRadiant} size={40} />
                <span className={`port ${p.isRadiant ? 'r' : 'd'}`}>
                  {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
                </span>
                <span>
                  <b>{p.name ?? `#${p.steamAccountId}`}</b>
                  <div className="dim t12">{hero?.name ?? `герой #${p.heroId}`}, {p.level} ур.</div>
                </span>
              </div>
              <div className="bld-p-grid">
                <BuildTimeline upgrades={p.abilityUpgrades} heroId={p.heroId} />
                <PurchaseTimeline events={p.purchaseEvents} itemMap={itemMap} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function Builds({ sides, heroMap, itemMap }: {
  sides: TeamSide[]
  heroMap: Map<number, HeroInfo>
  itemMap: Map<number, ItemInfo>
}) {
  return (
    <div>
      {sides.map((side) => <Side key={side.label} side={side} heroMap={heroMap} itemMap={itemMap} />)}
    </div>
  )
}
