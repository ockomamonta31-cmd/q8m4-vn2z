import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { HeroInfo, PlayerMatch } from '../api/types'
import { fetchMatch } from '../api'
import { heroImageUrl } from '../api/heroes'
import { fmtDuration, gameModeName, lobbyName, timeAgo, fmtKda } from '../api/formats'
import { fitImpEstimator } from '../api/performance'
import { IMPACT_MODEL_READY, impactModelInfo } from '../api/impact'
import { localImpact, resolveImpact, type ImpactScore } from '../api/score'
import { ImpactMeter } from './Impact'
import PositionIcon from './PositionIcon'
import { EmptyState } from './States'

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
  // Локальная модель нужна только если ни основная, ни глобальная не готовы.
  const estimator = useMemo(
    () => (IMPACT_MODEL_READY ? null : fitImpEstimator(matches)),
    [matches],
  )
  const modelInfo = IMPACT_MODEL_READY ? impactModelInfo() : null

  if (matches.length === 0) {
    return (
      <EmptyState title="Матчей в истории нет">
        Steam не отдаёт матчи скрытых профилей. Проверь ID и открой другой профиль, а если ID верный —
        начни с любого матча на странице разбора.
      </EmptyState>
    )
  }

  const scoreOf = (m: PlayerMatch): ImpactScore | null =>
    resolveImpact(m.player, m.durationSeconds, seasonRank ?? null) ?? localImpact(estimator, m)

  return (
    <>
      <div className="match-list" role="list">
        {matches.map((m) => {
          const hero = heroMap.get(m.player.heroId)
          const p = m.player
          return (
            <Link
              key={m.id}
              to={`/match/${m.id}`}
              className={`match-row ${p.isVictory ? 'win' : 'loss'}`}
              onMouseEnter={() => void fetchMatch(m.id)}
              aria-label={`${p.isVictory ? 'Победа' : 'Поражение'} на ${hero?.name ?? `герой ${m.player.heroId}`}, матч ${m.id}`}
            >
              <span className="mr-outcome">
                <b>{p.isVictory ? 'Победа' : 'Поражение'}</b>
                <small>{timeAgo(m.startDateTime)}</small>
              </span>
              <span className="mr-hero">
                <span className="hero-portrait">
                  {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
                  <PositionIcon position={p.position} source={p.positionSource} />
                </span>
                <span>
                  <strong>{hero?.name ?? `Герой #${p.heroId}`}</strong>
                  <span className="mr-tags">
                    <span>{gameModeName(m.gameMode)}</span>
                    <span>{lobbyName(m.lobbyType)}</span>
                  </span>
                </span>
              </span>
              <span className="mr-kda">
                <strong>
                  <i>{p.kills}</i> / <u>{p.deaths}</u> / {p.assists}
                </strong>
                <small>KDA {fmtKda(p.kills, p.deaths, p.assists)}</small>
              </span>
              <ImpactMeter score={scoreOf(m)} />
              <span className="mr-econ">
                <strong>{p.goldPerMinute} <span className="unit">GPM</span></strong>
                <span className="mr-tags">
                  <span>{p.experiencePerMinute} XPM</span>
                  <span>{p.numLastHits}/{p.numDenies} LH/DN</span>
                </span>
              </span>
              <span className="mr-time">
                <strong>{fmtDuration(m.durationSeconds)}</strong>
                <small>#{m.id}</small>
              </span>
              <svg className="mr-open" viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
            </Link>
          )
        })}
      </div>
      <div className="list-foot">
        Показано <b>{matches.length}</b> матчей, лобби: {lobbyName(matches[0]?.lobbyType ?? '').toLowerCase()}.
        {' '}Импакт считает{' '}
        {modelInfo
          ? `модель на ${modelInfo.matches.toLocaleString('ru-RU')} матчах, AUC ${modelInfo.auc.toFixed(2)}`
          : estimator
            ? `локальная модель на ${estimator.samples} матчах этого профиля`
            : 'оценка по линии статов'}
        .
      </div>
    </>
  )
}
