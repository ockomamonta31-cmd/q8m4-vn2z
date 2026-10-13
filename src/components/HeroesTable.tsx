import type { HeroInfo, HeroStat } from '../api/types'
import { heroImageUrl } from '../api/heroes'
import { fmtWinrate, winrate } from '../api/formats'
import { EmptyState } from './States'

export default function HeroesTable({ stats, heroMap, compact = false }: { stats: HeroStat[]; heroMap: Map<number, HeroInfo>; compact?: boolean }) {
  if (stats.length === 0) {
    return (
      <EmptyState title="Героев в истории нет">
        Список появится, как только в профиле найдётся хотя бы один доступный матч.
      </EmptyState>
    )
  }
  return (
    <div className={`table-wrap table-heroes${compact ? ' table-compact' : ''}`}>
      <table className="table">
        <thead>
          <tr>
            <th className="col-hero">Герой</th>
            <th className="num">Матчи</th>
            {!compact && <th className="num">Победы</th>}
            {!compact && <th className="num">Поражения</th>}
            <th>{compact ? 'WR' : 'Винрейт'}</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => {
            const hero = heroMap.get(s.heroId)
            const losses = s.matchCount - s.winCount
            const wr = winrate(s.winCount, s.matchCount)
            const side = wr >= 50 ? 'hi' : 'lo'
            return (
              <tr key={s.heroId}>
                <td>
                  <div className="hero-cell">
                    <span className="hero-portrait">
                      {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
                    </span>
                    <span className="hero-name" title={hero?.name}>{hero?.name ?? `герой #${s.heroId}`}</span>
                  </div>
                </td>
                <td className="num" data-label="матчей">{s.matchCount}</td>
                {!compact && <td className="num green" data-label="побед">{s.winCount}</td>}
                {!compact && <td className="num red" data-label="поражений">{losses}</td>}
                <td data-label="винрейт">
                  <span className="wr-cell">
                    <b className={side}>{fmtWinrate(s.winCount, s.matchCount)}</b>
                    <span className="wr-bar" role="img" aria-label={`${s.winCount} побед и ${losses} поражений`}>
                      <i className={side} style={{ width: `${wr}%` }} />
                    </span>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
