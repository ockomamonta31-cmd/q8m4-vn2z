import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { HeroInfo, PlayerMatch } from '../api/types'
import { fetchMatch } from '../api'
import { heroImageUrl } from '../api/heroes'
import { fmtDuration, fmtKda, gameModeName, lobbyName, timeAgo } from '../api/formats'
import { fitImpEstimator } from '../api/performance'
import { IMPACT_MODEL_READY, impactModelInfo } from '../api/impact'
import { localImpact, resolveImpact, type ImpactScore } from '../api/score'
import { ImpactMeter } from './Impact'
import RoleIcon from './RoleIcon'
import { EmptyState } from './States'
import { Icon } from './Icons'

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
      <div className="mlist" role="list">
        {matches.map((m) => {
          const hero = heroMap.get(m.player.heroId)
          const p = m.player
          const heroName = hero?.name ?? `Герой #${p.heroId}`
          return (
            <Link
              key={m.id}
              to={`/match/${m.id}`}
              className={`mrow ${p.isVictory ? 'w' : 'l'}`}
              onMouseEnter={() => void fetchMatch(m.id)}
              title={`${heroName} · ${p.numLastHits}/${p.numDenies} LH/DN · ${p.experiencePerMinute} XPM · матч ${m.id}`}
              aria-label={`${p.isVictory ? 'Победа' : 'Поражение'} на ${heroName}, матч ${m.id}`}
            >
              <span className="mrow-out">
                <b>{p.isVictory ? 'Победа' : 'Поражение'}</b>
                <span>{timeAgo(m.startDateTime)}</span>
              </span>

              <span className={`port ${p.isVictory ? 'r' : 'd'}`}>
                {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
              </span>
              <RoleIcon position={p.position} source={p.positionSource} lane={p.lane} radiant={p.isVictory} size={40} />

              <span className="mrow-hero">
                <b>{heroName}</b>
                <span>{gameModeName(m.gameMode)} · {lobbyName(m.lobbyType)}</span>
              </span>

              <span className="mrow-kda">
                <b>{p.kills} / <i>{p.deaths}</i> / {p.assists}</b>
                <span>KDA {fmtKda(p.kills, p.deaths, p.assists)}</span>
              </span>

              <span className="mrow-imp"><ImpactMeter score={scoreOf(m)} /></span>
              <span className="mrow-gpm">{p.goldPerMinute} GPM</span>
              <span className="mrow-dur">{fmtDuration(m.durationSeconds)}</span>
              <span className="mrow-go"><Icon.Chevron size={20} /></span>
            </Link>
          )
        })}
      </div>

      <p className="pnote" style={{ marginTop: 'var(--sp-16)' }}>
        Показано {matches.length} матчей. Импакт считает{' '}
        {modelInfo
          ? `модель на ${modelInfo.matches.toLocaleString('ru-RU')} матчах, AUC ${modelInfo.auc.toFixed(2)}`
          : estimator
            ? `локальная модель на ${estimator.samples} матчах этого профиля`
            : 'оценка по линии статов'
        }. Наведи на строку — покажет LH/DN, XPM и ID матча.
      </p>
    </>
  )
}
