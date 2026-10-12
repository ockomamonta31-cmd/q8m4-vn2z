import type { HeroInfo, HeroStat } from '../api/types'
import { heroImageUrl } from '../api/heroes'
import { fmtWinrate, winrate } from '../api/formats'

export default function HeroesTable({ stats, heroMap }: { stats: HeroStat[]; heroMap: Map<number, HeroInfo> }) {
  if (stats.length === 0) {
    return <div className="inline-note">Статистика по героям пока пуста.</div>
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Герой</th>
            <th className="num">Матчи</th>
            <th className="num">Победы</th>
            <th className="num">Поражения</th>
            <th>Винрейт</th>
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
                    {hero && <img className="hero-icon" src={heroImageUrl(hero.shortName)} alt={hero.name} loading="lazy" />}
                    <span className="hero-name">{hero ? hero.name : `hero #${s.heroId}`}</span>
                  </div>
                </td>
                <td className="num">{s.matchCount}</td>
                <td className="num green">{s.winCount}</td>
                <td className="num red">{losses}</td>
                <td>
                  <span className="wr-mini">
                    <span>{fmtWinrate(s.winCount, s.matchCount)}</span>
                    <span className="bar">
                      <span className="fill-win" style={{ width: `${wr}%` }} />
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
