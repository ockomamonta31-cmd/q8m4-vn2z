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
            <div className="chart-t">Предсказание и реальность</div>
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
      <header className="chart-h">
        <div>
          <div className="chart-t">Предсказание и реальность</div>
          <div className="chart-s">
            По драфту: {call.text === 'равные' ? 'драфты равны' : call.text} · вероятность победы Radiant {pct(rating.prediction.probability)}
            {rating.prediction.games >= 20 ? ` (такие оценки в нашей базе выигрывали ${pct(rating.prediction.probability)} на ${rating.prediction.games} матчах)` : ''}
          </div>
        </div>
      </header>

      <div className="dp-predict">
        <div className="dp-total">
          <span className="dp-total-r" style={{ width: `${rating.total.radiant}%` }} />
          <span className="dp-total-d" style={{ width: `${rating.total.dire}%` }} />
          <b className="dp-total-l">{rating.total.radiant.toFixed(0)}</b>
          <b className="dp-total-rr">{rating.total.dire.toFixed(0)}</b>
        </div>
        <div className="dp-facts">
          <div className="dp-fact">
            <span className="dim t12">предсказание</span>
            <b>{rating.total.radiant.toFixed(0)} : {rating.total.dire.toFixed(0)}</b>
            <span className="dim t12">{pct(rating.prediction.probability)} — Radiant</span>
          </div>
          <div className="dp-fact">
            <span className="dim t12">итог матча</span>
            <b>{winner ? (winner === 'radiant' ? 'Radiant' : 'Dire') : '—'}</b>
            <span className={hit === null ? 'dim t12' : hit ? 'pos t12' : 'neg t12'}>
              {hit === null ? 'исхода нет' : hit ? 'предсказание сработало' : 'предсказание не сработало'}
            </span>
          </div>
          {rating.model && (
            <div className="dp-fact">
              <span className="dim t12">модель на нашей базе</span>
              <b>{pct(rating.model.matchAccuracy)}</b>
              <span className="dim t12">угаданных матчей из {rating.model.matches}</span>
            </div>
          )}
        </div>
      </div>

      <div className="dr-block">
        <h4 className="dr-h">Что пошло не так</h4>
        <ul className="dp-why">
          {rating.why.map((w, i) => (
            <li key={i} className={w.tone}>{w.text}</li>
          ))}
        </ul>
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
                ? <i className="r" style={{ width: `${Math.min(50, ((a.share - 0.5) / 0.12) * 50)}%`, left: '50%' }} />
                : <i className="d" style={{ width: `${Math.min(50, ((0.5 - a.share) / 0.12) * 50)}%`, right: '50%' }} />}
            </span>
            <span className="dp-n">
              <b className={a.share > 0.5 ? 'pos' : a.share < 0.5 ? 'neg' : 'dim'}>{(a.share * 100).toFixed(0)}:{((1 - a.share) * 100).toFixed(0)}</b>
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
      </p>
    </section>
  )
}
