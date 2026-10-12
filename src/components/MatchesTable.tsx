import { useMemo } from 'react'
import { Link } from 'react-router-dom'
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

  if (matches.length === 0) {
    return <div className="inline-note">Матчи не найдены. Возможно, профиль скрыт или ID неверный.</div>
  }
  return (
    <div className="match-list" role="list">
      {matches.map((m) => {
            const hero = heroMap.get(m.player.heroId)
            const p = m.player
            return (
              <Link
                key={m.id}
                to={`/match/${m.id}`}
                className={`match-row ${p.isVictory ? 'result-win' : 'result-loss'}`}
                onMouseEnter={() => void fetchMatch(m.id)}
              >
                <span className="match-result-mark" aria-label={p.isVictory ? 'Победа' : 'Поражение'}><i /><b>{p.isVictory ? 'Победа' : 'Поражение'}</b></span>
                <span className="match-hero-cell">
                  {hero && <img className="hero-icon" src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
                  <span><strong>{hero ? hero.name : `Герой #${p.heroId}`}</strong><small>{gameModeName(m.gameMode)} · {lobbyName(m.lobbyType)}</small></span>
                </span>
                <span className="match-kda"><strong><i>{p.kills}</i><em>{p.deaths}</em>{p.assists}</strong><small>K / D / A</small></span>
                <span className="match-kda-value"><strong>{fmtKda(p.kills, p.deaths, p.assists)}</strong><small>KDA</small></span>
                <span className="match-impact">
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
                </span>
                <span className="match-gold"><strong>{p.goldPerMinute}</strong><small>GPM</small></span>
                <span className="match-date"><strong>{fmtDate(m.startDateTime)}</strong><small>{fmtDuration(m.durationSeconds)} · #{m.id}</small></span>
                <svg className="match-row-open" viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
              </Link>
            )
      })}
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
