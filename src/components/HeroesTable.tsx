import type { HeroInfo, HeroStat } from '../api/types'
import { heroImageUrl } from '../api/heroes'
import { fmtWinrate, winrate } from '../api/formats'

export default function HeroesTable({ stats, heroMap, compact = false }: { stats: HeroStat[]; heroMap: Map<number, HeroInfo>; compact?: boolean }) {
  if (stats.length === 0) {
    return <div className="notice">По героям пока нечего показать — матчей в истории нет.</div>
  }
  return (
    <div className={`table-wrap${compact ? ' table-compact' : ''}`}>
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
            return (
              <tr key={s.heroId}>
                <td>
                  <div className="hero-cell">
                    <span className="hero-portrait">
                      {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
                    </span>
                    <span className="hero-name">{hero?.name ?? `герой #${s.heroId}`}</span>
                  </div>
                </td>
                <td className="num">{s.matchCount}</td>
                {!compact && <td className="num green">{s.winCount}</td>}
                {!compact && <td className="num red">{losses}</td>}
                <td>
                  <span className="wr-cell">
                    <b>{fmtWinrate(s.winCount, s.matchCount)}</b>
                    <span className="wr-bar"><i style={{ width: `${wr}%` }} /></span>
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
