// Предсказание матча по драфту, факт и разбор расхождения. Оценка своя:
// профиль героев считается из нашей базы матчей (scripts/build-hero-profile.mjs),
// вероятность откалибрована бэктестом этой же модели по той же базе
// (npm run draft:backtest). Никаких чужих винрейтов.

import type { HeroInfo } from '../../api/types'
import { heroImageUrl } from '../../api/heroes'
import { callShare, type DraftRating } from '../../api/draftStrength'
import RoleIcon from '../RoleIcon'

const pct = (v: number) => `${(v * 100).toFixed(0)}%`

export default function DraftPower({ rating, heroMap }: { rating: DraftRating | null; heroMap: Map<number, HeroInfo> }) {
  if (!rating || !rating.axes.length) {
    return (
      <section className="dp">
        <header className="chart-h">
          <div>
            <h2 className="chart-t">Что давал драфт</h2>
            <div className="chart-s">Профиль героев из нашей базы ещё не подгрузился — предсказания нет</div>
          </div>
        </header>
      </section>
    )
  }

  const call = callShare(rating.prediction.share)
  const winner = rating.outcome?.winner ?? null
  const hit = rating.outcome?.hit ?? null

  return (
    <section className="dp">
      <header className="chart-h"><div><h2 className="chart-t">Что давал драфт</h2><p className="chart-s">Сила составов по профилям героев. Исполнение в матче смотрим отдельно.</p></div></header>
      <div className="draft-verdict">
        <div><h3>{call.text === 'равные' ? 'Явного фаворита нет' : call.text === 'перевес Radiant' ? 'Профили дают перевес Radiant' : 'Профили дают перевес Dire'}</h3><p>{call.text === 'равные' ? 'Разница между составами мала. Исход матча нельзя объяснить одним драфтом.' : 'Модель сравнивает средние показатели этих героев на своих ролях. Это ориентир для разбора, а не гарантия победы.'}</p></div>
        <div className="draft-outcome"><span>Фактический победитель</span><b className={winner === 'radiant' ? 'pos' : winner === 'dire' ? 'neg' : 'dim'}>{winner === 'radiant' ? 'Radiant' : winner === 'dire' ? 'Dire' : 'Неизвестен'}</b><span>{call.text === 'равные' ? 'При равных драфтах прогноз победителя не заявлен' : hit === null ? 'Итог ещё не записан' : hit ? 'Фаворит по профилям победил' : 'Победил соперник фаворита'}</span></div>
      </div>
      <div className="draft-scale"><div><b className="pos">Radiant {rating.total.radiant.toFixed(0)}</b><span>Доля модельной силы · сумма 100</span><b className="neg">Dire {rating.total.dire.toFixed(0)}</b></div><div className="draft-scale-track"><i style={{width: rating.total.radiant + '%'}} /></div></div>
      <p className="analysis-caption">Ниже — сравнение свойств составов. В числах сначала Radiant, затем Dire.</p>
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
                ? <i className="r" style={{ width: `${Math.min(50, ((a.share - 0.5) / 0.12) * 50)}%`, left: '50%' }} />
                : <i className="d" style={{ width: `${Math.min(50, ((0.5 - a.share) / 0.12) * 50)}%`, right: '50%' }} />}
            </span>
            <span className="dp-n">
              <b className={Math.abs(a.share - .5) < .02 ? 'dim' : a.share > .5 ? 'pos' : 'neg'}>{Math.abs(a.share - .5) < .02 ? 'Примерно равно' : a.share > .5 ? 'Перевес Radiant' : 'Перевес Dire'}</b>
              <span className="dim t12">{a.rValue.toFixed(2)}× против {a.dValue.toFixed(2)}× · {a.games.toLocaleString('ru-RU')} матчей</span>
            </span>
          </li>
        ))}
      </ul>

      <details className="analysis-method"><summary>Средний профиль каждого героя и показатели в этом матче</summary><p>1,00× — средний показатель героя на этой роли. Итоговые показатели матча описывают исполнение и условия игры, а не ошибку в выборе героя.</p><div className="dp-teams">
        {([true, false] as const).map((radiant) => (
          <div key={radiant ? 'r' : 'd'} className={`dp-side ${radiant ? 'r' : 'd'}`}>
            <h4 className={`dr-team ${radiant ? 'r' : 'd'}`}>{radiant ? 'Radiant' : 'Dire'}</h4>
            <ul className="dp-hlist">
              {rating.heroes.filter((h) => h.player.isRadiant === radiant).map((h) => {
                const hero = heroMap.get(h.player.heroId)
                const delta = h.index !== null && h.realized !== null ? h.realized - h.index : null
                return (
                  <li className="dp-hrow" key={`${h.player.heroId}:${h.player.steamAccountId}`}>
                    <RoleIcon position={h.role} source={h.roleFromReplay ? (h.player.positionSource ?? 'replay') : 'stats'} lane={h.player.lane} size={24} />
                    <span className={`port xs ${radiant ? 'r' : 'd'}`}>
                      {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
                    </span>
                    <span className="dp-hname">
                      <b>{hero?.name ?? `герой #${h.player.heroId}`}</b>
                      <span className="dim t12">{h.role}-я роль · профиль по {h.games} матч.</span>
                    </span>
                    <span className="dp-hnums">
                      <b>{h.index === null ? '—' : `${h.index.toFixed(2)}×`}</b>
                      <span className="dim t12">по профилю</span>
                    </span>
                    <span className="dp-hnums">
                      <b className={delta === null ? 'dim' : delta >= 0 ? 'pos' : 'neg'}>{h.realized === null ? '—' : `${h.realized.toFixed(2)}×`}</b>
                      <span className="dim t12">по матчу</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      </details>
      <details className="analysis-method"><summary>Данные модели и ограничения</summary>
      <p>Оценки такого диапазона в нашей базе выигрывали за Radiant в {pct(rating.prediction.probability)} случаев ({rating.prediction.games} матчей). Это наблюдение в базе, не проверенная вероятность этого матча. {rating.model && <>Совпадение с победителем в базе: {pct(rating.model.matchAccuracy)} на {rating.model.matches} матчах.</>}</p>
      <p className="pnote">
        Как считаем: берём средние статы Valve по каждому герою на его роли из
        нашей базы ({rating.corpus} матчей) и делим на среднее по этой роли — 1.00
        значит «делает свою работу как средний». Ось команды — среднее по её
        героям, итог — среднее по осям, где данных хватило обеим сторонам.
        Вероятность — не наша догадка: это частота побед в тех же {rating.corpus} матчах,
        где модель выдавала такую же долю силы. Столбцы «по профилю / по матчу» —
        что герой обещает в среднем и что он выдал здесь, в одних и тех же
        единицах; из разницы и сложен разбор расхождения.
        Это разбор драфта, а не ставка.
      </p></details>
    </section>
  )
}
