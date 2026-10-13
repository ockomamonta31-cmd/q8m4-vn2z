import type { HeroInfo, HeroStat, Profile } from '../api/types'
import { avatarImageUrl, heroImageUrl } from '../api/heroes'
import { fmtWinrate, steamProfileUrl, timeAgo, winrate } from '../api/formats'
import { Counter } from './primitives'

type Averages = {
  kda: number; avgK: number; avgD: number; avgA: number
  gpm: number; xpm: number; wins: number; wr: number; n: number
} | null

/** Левая колонка профиля. Единственное крупное число на экране — винрейт:
 *  всё остальное здесь подчинено ему и не спорит за внимание. */
export default function PlayerAside({
  profile,
  averages,
  heroStats,
  heroMap,
  lastMatchTime,
}: {
  profile: Profile
  averages: Averages
  heroStats: HeroStat[] | null
  heroMap: Map<number, HeroInfo>
  lastMatchTime: number | null
}) {
  const { matchCount } = profile

  return (
    <aside className="pside">
      <div className="pwho">
        <img src={avatarImageUrl(profile.avatar)} alt="" width={96} height={96} />
        <div>
          <h1>{profile.name}</h1>
          <div className="meta">
            <a href={steamProfileUrl(profile.steamAccountId)} target="_blank" rel="noreferrer">
              Steam ID {profile.steamAccountId}
            </a>
            {lastMatchTime && (
              <>
                <span className="dotsep" aria-hidden="true" />
                <span>последний матч {timeAgo(lastMatchTime)}</span>
              </>
            )}
            {matchCount != null && (
              <>
                <span className="dotsep" aria-hidden="true" />
                <span>{matchCount.toLocaleString('ru-RU')} матчей</span>
              </>
            )}
          </div>
        </div>
      </div>

      {averages && (
        <div className="pwr">
          <Counter
            className={`pwr-v ${averages.wr >= 50 ? 'pos' : 'neg'}`}
            value={averages.wr}
            duration={600}
            format={(n) => n.toFixed(1)}
          />
          <div className="pwr-l">% побед по {averages.n} загруженным матчам</div>
          <div
            className="split"
            style={{ marginTop: 'var(--sp-16)' }}
            role="img"
            aria-label={`Побед ${averages.wins}, поражений ${averages.n - averages.wins}, винрейт ${averages.wr.toFixed(1)}%`}
          >
            <i className="w" style={{ width: `${averages.wr}%` }} />
            <i className="l" style={{ width: `${100 - averages.wr}%` }} />
          </div>
          <div className="pwr-legend">
            <span className="pos">{averages.wins} побед</span>
            <span className="neg">{averages.n - averages.wins} поражений</span>
          </div>
        </div>
      )}

      {averages && (
        <div className="psum">
          <h2 className="psum-t">Сводка</h2>
          <div className="psum-big">
            <span>Средний KDA</span>
            <b>
              {averages.kda.toFixed(2)}
              <div className="t12 dim">{averages.avgK.toFixed(1)} / {averages.avgD.toFixed(1)} / {averages.avgA.toFixed(1)}</div>
            </b>
          </div>
          <div className="psum-r"><span>Золото в минуту</span><b>{Math.round(averages.gpm)}</b></div>
          <div className="psum-r"><span>Опыт в минуту</span><b>{Math.round(averages.xpm)}</b></div>
          <div className="psum-r"><span>Убийства за матч</span><b>{averages.avgK.toFixed(1)}</b></div>
          <div className="psum-r"><span>Смерти за матч</span><b>{averages.avgD.toFixed(1)}</b></div>
        </div>
      )}

      {heroStats && heroStats.length > 0 && (
        <div className="pher">
          <h2 className="psum-t">Чаще всего играет</h2>
          {heroStats.slice(0, 5).map((s) => {
            const hero = heroMap.get(s.heroId)
            const wr = winrate(s.winCount, s.matchCount)
            return (
              <div className="pher-r" key={s.heroId}>
                <span className={`port ${wr >= 50 ? 'r' : 'd'}`}>
                  {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
                </span>
                <b title={hero?.name}>{hero?.name ?? `герой #${s.heroId}`}</b>
                <span className={`wr ${wr >= 50 ? 'pos' : 'neg'}`}>{fmtWinrate(s.winCount, s.matchCount)}</span>
              </div>
            )
          })}
        </div>
      )}

      <p className="pnote">{note(profile, averages)}</p>
    </aside>
  )
}

function note(profile: Profile, averages: Averages) {
  const n = averages?.n ?? 0
  const window = profile.matchCount != null ? ` из окна Valve в ${profile.matchCount.toLocaleString('ru-RU')} публичных игр` : ''
  return `Все числа считаются по ${n} загруженным матчам${window}. Полная история, герои и активность — на вкладках справа.`
}
