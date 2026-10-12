import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { HeroInfo, PlayerMatch } from '../api/types'
import { fetchMatch } from '../api'
import { heroImageUrl } from '../api/heroes'
import { fmtDate, fmtDuration, fmtKda, gameModeName, lobbyName } from '../api/formats'
import {
  scoreClass,
  fantasyPoints,
  fitImpEstimator,
  predictImpGlobal,
  globalModelInfo,
} from '../api/performance'
import { IMPACT_MODEL_READY, impactClass, impactModelInfo, personalImpact } from '../api/impact'

export default function MatchesTable({
  matches,
  heroMap,
  seasonRank,
}: {
  matches: PlayerMatch[]
  heroMap: Map<number, HeroInfo>
  /** сезонный ранг игрока — базлайн для оценки */
  seasonRank?: number | null
}) {
  // Глобальная модель (обучена на чужих матчах) — фолбэк, если наша модель не готова;
  // локальный оценщик — второй фолбэк
  const hasGlobal = globalModelInfo() !== null
  const estimator = useMemo(
    () => (IMPACT_MODEL_READY || hasGlobal ? null : fitImpEstimator(matches)),
    [hasGlobal, matches],
  )
  const modelInfo = IMPACT_MODEL_READY ? impactModelInfo() : null
  const navigate = useNavigate()

  if (matches.length === 0) {
    return <div className="inline-note">Матчи не найдены. Возможно, профиль скрыт или ID неверный.</div>
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Результат</th>
            <th>Герой</th>
            <th className="num">K / D / A</th>
            <th className="num">KDA</th>
            <th className="num" title="Наша честная оценка: насколько игрок сдвигал шанс победы команды относительно типичного игрока своего ранга и позиции (−100…+100). Считается нашей моделью, обученной на реальных исходах матчей.">Импакт ★</th>
            <th className="num col-md">GPM</th>
            <th className="num col-md">Урон</th>
            <th className="num col-md">XPM</th>
            <th className="num col-sm">LH</th>
            <th className="col-sm">Длит.</th>
            <th className="col-md">Режим</th>
            <th>Дата</th>
            <th className="col-sm">Матч</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => {
            const hero = heroMap.get(m.player.heroId)
            const p = m.player
            return (
              <tr
                key={m.id}
                className={`row-clickable ${p.isVictory ? 'result-win' : 'result-loss'}`}
                tabIndex={0}
                role="link"
                aria-label={`Матч ${m.id} · ${hero ? hero.name : `герой ${m.player.heroId}`}`}
                onMouseEnter={() => void fetchMatch(m.id)}
                onClick={() => navigate(`/match/${m.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate(`/match/${m.id}`)
                  }
                }}
              >
                <td>
                  <span className={`res-tag ${p.isVictory ? 'win' : 'loss'}`}>
                    {p.isVictory ? 'Победа' : 'Поражение'}
                  </span>
                </td>
                <td>
                  <div className="hero-cell">
                    {hero && <img className="hero-icon" src={heroImageUrl(hero.shortName)} alt={hero.name} loading="lazy" />}
                    <span className="hero-name">{hero ? hero.name : `hero #${m.player.heroId}`}</span>
                  </div>
                </td>
                <td className="num">
                  <span className="green">{p.kills}</span>
                  <span className="muted"> / </span>
                  <span className="red">{p.deaths}</span>
                  <span className="muted"> / {p.assists}</span>
                </td>
                <td className="num">{fmtKda(p.kills, p.deaths, p.assists)}</td>
                <td className="num">
                  {IMPACT_MODEL_READY ? (() => {
                    const our = personalImpact(p, m.durationSeconds, seasonRank ?? null)
                    if (our === null) {
                      return <span className="muted" title="Оценка недоступна для этой строки">—</span>
                    }
                    return (
                      <span
                        className={`score-badge ${impactClass(our)}`}
                        title={`Оценка по той же модели, что и на странице матча: насколько линия статов сильнее типичной для твоего уровня игры.${modelInfo ? `\nМодель: ${modelInfo.matches} матчей, обучена ${new Date(modelInfo.trainedAt).toLocaleDateString('ru-RU')}` : ''}`}
                      >
                        {our > 0 ? `+${our}` : our}
                      </span>
                    )
                  })() : p.imp !== null ? (
                    <span
                      className={`score-badge ${scoreClass(p.imp)}`}
                      title={`IMP: −100…+100, оценка влияния на победу. Valve-фэнтези (публичная формула): ${fantasyPoints(p).toFixed(1)} баллов`}
                    >
                      {p.imp > 0 ? `+${p.imp}` : p.imp}
                    </span>
                  ) : (() => {
                    const est = hasGlobal ? predictImpGlobal(p, m.durationSeconds) : (estimator?.predict(m) ?? null)
                    if (est === null) {
                      return <span className="muted" title="IMP не посчитан">—</span>
                    }
                    const estTitle = hasGlobal
                      ? `Рассчитано моделью, обученной на ${globalModelInfo()!.samples.toLocaleString('ru-RU')} матчах (MAE ±${globalModelInfo()!.mae}, r=${globalModelInfo()!.r.toFixed(2)} к их IMP на контроле). Признаки: K/D/A, GPM/XPM, LH/DN, нетворт, уровень, урон, башни, исход, сторона.`
                      : `Рассчитано локальной моделью (${estimator!.samples} матчей профиля, r=${estimator!.fitCorr.toFixed(2)}). Valve-фэнтези: ${fantasyPoints(p).toFixed(1)}`
                    return (
                      <span
                        className={`score-badge score-est ${scoreClass(est)}`}
                        title={estTitle}
                      >
                        {est > 0 ? `+${est}` : est}
                      </span>
                    )
                  })()}
                </td>
                <td className="num col-md">{p.goldPerMinute}</td>
                <td className="num col-md" title={`Урон по героям за матч${p.towerDamage > 0 ? `, по башням: ${p.towerDamage}` : ''}${p.heroHealing > 0 ? `, лечение: ${p.heroHealing}` : ''}`}>
                  {p.heroDamage > 0 ? p.heroDamage.toLocaleString('ru-RU') : '—'}
                </td>
                <td className="num col-md">{p.experiencePerMinute}</td>
                <td className="num col-sm">{p.numLastHits}</td>
                <td className="col-sm muted">{fmtDuration(m.durationSeconds)}</td>
                <td className="col-md muted">
                  {gameModeName(m.gameMode)}
                  {m.lobbyType === 'RANKED' ? ' · ranked' : ''}
                  {m.gameMode.includes('ONE_VS_ONE') ? ' · 1v1' : ''}
                </td>
                <td className="muted">{fmtDate(m.startDateTime)}</td>
                <td className="col-sm">
                  <Link to={`/match/${m.id}`} onClick={(e) => e.stopPropagation()} title="Открыть матч">
                    {m.id}
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="inline-note">
        {lobbyName(matches[0]?.lobbyType ?? '')} · показано {matches.length} матчей
        {IMPACT_MODEL_READY && modelInfo
          ? ` · Импакт ★ — модель на ${modelInfo.matches.toLocaleString('ru-RU')} матчах (AUC ${modelInfo.auc.toFixed(2)} на контроле)`
          : ''}
        {hasGlobal
          ? `, фолбэк — модель на ${globalModelInfo()!.samples.toLocaleString('ru-RU')} матчах (MAE ±${globalModelInfo()!.mae})`
          : estimator
            ? ` (локальная модель: ${estimator.samples} матчей, r=${estimator.fitCorr.toFixed(2)})`
            : ''}
      </div>
    </div>
  )
}
