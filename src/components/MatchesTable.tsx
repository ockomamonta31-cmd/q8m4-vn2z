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
import { LANE_RESULT_LABELS } from '../../server/gc/lane-outcome.mjs'

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
          const lane = p.laneOutcome
          const laneText = lane ? LANE_RESULT_LABELS[lane.result] : 'Нет замера'
          const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('ru-RU')}`
          const names = (ids: number[]) => ids.map(id => heroMap.get(id)?.name ?? `Герой #${id}`).join(' + ')
          const laneDetail = lane
            ? `${names(lane.allyHeroIds)} против ${names(lane.enemyHeroIds)}. К 10:00: ${signed(lane.goldDelta)} золота, ${signed(lane.xpDelta)} опыта. Перевес ${signed(lane.score)}%.`
            : m.durationSeconds < 600 ? 'Матч закончился раньше 10:00.' : 'Нужны первые 10 минут реплея и определённый состав стартовых линий.'
          return (
            <Link
              key={m.id}
              to={`/match/${m.id}`}
              className={`mrow ${p.isVictory ? 'w' : 'l'}`}
              onMouseEnter={() => void fetchMatch(m.id)}
              title={`${heroName} · ${p.numLastHits}/${p.numDenies} LH/DN · ${p.experiencePerMinute} XPM · матч ${m.id}`}
              aria-label={`${p.isVictory ? 'Победа' : 'Поражение'} на ${heroName}, линия: ${laneText}, матч ${m.id}`}
            >
              <span className="mrow-out">
                <b>{p.isVictory ? 'Победа' : 'Поражение'}</b>
                <span>{timeAgo(m.startDateTime)}</span>
              </span>

              <span className={`port ${p.isVictory ? 'r' : 'd'}`}>
                {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
              </span>
              <RoleIcon position={p.position} source={p.positionSource} lane={p.lane} size={40} />

              <span className="mrow-hero">
                <b>{heroName}</b>
                <span>{gameModeName(m.gameMode)} · {lobbyName(m.lobbyType)}</span>
                <span className={`mrow-lane ${lane?.result ?? 'unknown'}`} title={laneDetail}>Линия · {laneText}</span>
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

      <details className="pnote lane-method">
        <summary>Результат линии · замерено {matches.filter(m => m.player.laneOutcome).length} из {matches.length} матчей</summary>
        <p>Состав берём из перемещений на 1–5-й минутах. Сравниваем суммарное заработанное золото (65%) и опыт (35%) участников одной линии к 10:00, включая их последующие ротации и лес. Керри и саппорт получают общий результат линии.</p>
        <p>Разница считается относительно среднего двух сторон. Перевес менее 10% — ничья, от 10% — победа, от 30% — разгром, если и золото, и опыт впереди хотя бы на 10%. Это наша формула; результат игры её не меняет. Без полного замера показываем «Нет замера».</p>
      </details>

      <p className="pnote" style={{ marginTop: 'var(--sp-16)' }}>
        Показано {matches.length} матчей. Оценка v5 общая для профиля и матча: герой, роль, медаль, статистика и доступные события реплея. Без разобранного реплея оценка предварительная. 0 — около нормы; +100 не означает идеальную игру.
      </p>
    </>
  )
}
