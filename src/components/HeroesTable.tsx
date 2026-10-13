import { useState } from 'react'
import type { HeroInfo, HeroStat } from '../api/types'
import { heroImageUrl } from '../api/heroes'
import { fmtWinrate, winrate } from '../api/formats'
import { EmptyState } from './States'

type Sort = 'matches' | 'wr'

/** Сетка героев: портрет, матчи, винрейт цветом и полоска. Сортировка — по
 *  матчам или по винрейту, других порядков здесь нет. */
export default function HeroesTable({ stats, heroMap }: { stats: HeroStat[]; heroMap: Map<number, HeroInfo> }) {
  const [sort, setSort] = useState<Sort>('matches')

  if (stats.length === 0) {
    return (
      <EmptyState title="Героев в истории нет">
        Список появится, как только в профиле найдётся хотя бы один доступный матч.
      </EmptyState>
    )
  }

  const rows = [...stats].sort((a, b) =>
    sort === 'matches' ? b.matchCount - a.matchCount : winrate(b.winCount, b.matchCount) - winrate(a.winCount, a.matchCount),
  )

  return (
    <>
      <div className="rail" role="group" aria-label="Сортировка героев" style={{ height: 40, gap: 'var(--sp-24)', marginBottom: 'var(--sp-16)' }}>
        <button type="button" className={`rail-i${sort === 'matches' ? ' on' : ''}`} aria-selected={sort === 'matches'} onClick={() => setSort('matches')}>
          По матчам
        </button>
        <button type="button" className={`rail-i${sort === 'wr' ? ' on' : ''}`} aria-selected={sort === 'wr'} onClick={() => setSort('wr')}>
          По винрейту
        </button>
      </div>

      <div className="hgrid">
        {rows.map((s) => {
          const hero = heroMap.get(s.heroId)
          const wr = winrate(s.winCount, s.matchCount)
          return (
            <div className="hcard" key={s.heroId}>
              <span className={`port ${wr >= 50 ? 'r' : 'd'}`}>
                {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
              </span>
              <b title={hero?.name}>{hero?.name ?? `герой #${s.heroId}`}</b>
              <div className="hcard-r">
                <span>{s.matchCount} матчей</span>
                <span className={wr >= 50 ? 'pos' : 'neg'}>{fmtWinrate(s.winCount, s.matchCount)}</span>
              </div>
              <span className="split" role="img" aria-label={`${s.winCount} побед и ${s.matchCount - s.winCount} поражений`}>
                <i className="w" style={{ width: `${wr}%` }} />
                <i className="l" style={{ width: `${100 - wr}%` }} />
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}
