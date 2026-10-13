// Общая оценка драфта — одна цифра на команду. Считается у нас: каждый герой
// сравнивается со средним по СВОЕЙ роли из нашей базы матчей, потом оси
// складываются в долю силы. Никаких чужих винрейтов.

import type { HeroInfo } from '../../api/types'
import { heroImageUrl } from '../../api/heroes'
import { callShare, type DraftRating } from '../../api/draftStrength'
import RoleIcon from '../RoleIcon'

const share100 = (share: number) => (share * 100).toFixed(0)

export default function DraftPower({ rating, heroMap }: { rating: DraftRating | null; heroMap: Map<number, HeroInfo> }) {
  if (!rating || !rating.axes.length) {
    return (
      <section className="dp">
        <header className="chart-h">
          <div>
            <div className="chart-t">Общая оценка драфта</div>
            <div className="chart-s">Профиль героев из нашей базы ещё не подгрузился — оценки нет</div>
          </div>
        </header>
      </section>
    )
  }

  const call = callShare(rating.total.radiant / 100)
  const scale = Math.max(0.06, ...rating.axes.map((a) => Math.abs(a.share - 0.5)))

  return (
    <section className="dp">
      <header className="chart-h">
        <div>
          <div className="chart-t">Общая оценка драфта</div>
          <div className="chart-s">
            Radiant {share100(rating.total.radiant / 100)} : {share100(rating.total.dire / 100)} Dire — {call.text} · {rating.axes.length} осей, база {rating.corpus} матчей
          </div>
        </div>
      </header>

      <div className="dp-total">
        <span className="dp-total-r" style={{ width: `${rating.total.radiant}%` }} />
        <span className="dp-total-d" style={{ width: `${rating.total.dire}%` }} />
        <b className="dp-total-l">{share100(rating.total.radiant / 100)}</b>
        <b className="dp-total-rr">{share100(rating.total.dire / 100)}</b>
      </div>

      <ul className="dp-axes">
        {rating.axes.map((a) => (
          <li key={a.key} className="dp-axis">
            <span className="dp-l">
              <b>{a.label}</b>
              <span className="dim t12">{a.detail}</span>
            </span>
            <span className="dr-mu-bar">
              <i className="mid" aria-hidden="true" />
              {a.share >= 0.5
                ? <i className="r" style={{ width: `${Math.min(50, ((a.share - 0.5) / scale) * 50)}%`, left: '50%' }} />
                : <i className="d" style={{ width: `${Math.min(50, ((0.5 - a.share) / scale) * 50)}%`, right: '50%' }} />}
            </span>
            <span className="dp-n">
              <b className={a.share > 0.5 ? 'pos' : a.share < 0.5 ? 'neg' : 'dim'}>{share100(a.share)}:{share100(1 - a.share)}</b>
              <span className="dim t12">{a.rValue.toFixed(2)}× против {a.dValue.toFixed(2)}× · {a.games.toLocaleString('ru-RU')} матчей</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="dp-teams">
        {([true, false] as const).map((radiant) => (
          <div key={radiant ? 'r' : 'd'} className={`dp-side ${radiant ? 'r' : 'd'}`}>
            <h4 className={`dr-team ${radiant ? 'r' : 'd'}`}>{radiant ? 'Radiant' : 'Dire'}</h4>
            <ul className="dp-hlist">
              {rating.heroes.filter((h) => h.player.isRadiant === radiant).map((h) => {
                const hero = heroMap.get(h.player.heroId)
                return (
                  <li className="dp-hrow" key={`${h.player.heroId}:${h.player.steamAccountId}`}>
                    <RoleIcon position={h.role} source={h.roleFromReplay ? (h.player.positionSource ?? 'replay') : 'stats'} lane={h.player.lane} size={24} />
                    <span className={`port xs ${radiant ? 'r' : 'd'}`}>
                      {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
                    </span>
                    <span className="dp-hname">
                      <b>{hero?.name ?? `герой #${h.player.heroId}`}</b>
                      <span className="dim t12">{h.role}-я роль{h.roleFromReplay ? '' : ' (по фармам)'} · профиль по {h.games} матч.</span>
                    </span>
                    <span className="dp-hnums">
                      <b className={h.index === null ? 'dim' : h.index >= 1 ? 'pos' : 'neg'}>{h.index === null ? '—' : `${h.index.toFixed(2)}×`}</b>
                      <span className="dim t12">к среднему по роли</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <p className="pnote">
        Как считаем: берём средние статы Valve по каждому герою на его роли из
        нашей базы ({rating.corpus} матчей) и делим на среднее по этой роли — 1.00
        значит «делает свою работу как средний», 1.15 — «на 15% лучше». Ось
        команды — среднее по её героям, а итог — среднее по осям, где данных
        хватило у обеих сторон. Синергия считается по парам, которые в нашей
        базе играли вместе не меньше {rating.minPairGames} раз; если таких пар
        мало, ось выпадает из среднего, а не обнуляется. Это оценка состава, а
        не прогноз на результат.
      </p>
    </section>
  )
}
