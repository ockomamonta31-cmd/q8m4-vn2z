// Страница матча. Данные — из кэша (матч неизменяем), повторное открытие мгновенное.
// Таймлайн реплея опционален: без него вкладки «Графики» и «Таймлайн» не показываются.

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { fetchMatch, getItemMap } from '../api'
import { ApiError, type HeroInfo, type ItemInfo, type MatchDetails } from '../api/types'
import { getHeroMap } from '../api/heroes'
import { fetchTimeline, type MatchTimeline } from '../api/timeline'
import { resolveImpact } from '../api/score'
import { buildBoard, buildInsights, playerLabel, slotOfPlayer } from './match-model'
import { fetchAuth } from '../auth'
import { Notice, PageSkeleton } from '../components/States'
import { TabBar } from '../components/primitives'
import { Icon } from '../components/Icons'
import HeroPlate from '../components/match/HeroPlate'
import Insights from '../components/match/Insights'
import PowerSpine from '../components/match/PowerSpine'
import Rosters from '../components/match/Roster'
import Draft from '../components/match/Draft'
import TimelinePanel from '../components/match/Timeline'
import Teamfights from '../components/match/Teamfights'
import { CompareBars, MomentumChart, PlayerBars } from '../components/match/Charts'

type TabId = 'overview' | 'roster' | 'charts' | 'timeline' | 'draft'
const TABS: TabId[] = ['overview', 'roster', 'charts', 'timeline', 'draft']

export default function MatchPage() {
  const { id } = useParams()
  const matchId = Number(id)
  const [params, setParams] = useSearchParams()
  const [match, setMatch] = useState<MatchDetails | null>(null)
  const [timeline, setTimeline] = useState<MatchTimeline | null>(null)
  const [heroMap, setHeroMap] = useState<Map<number, HeroInfo>>(new Map())
  const [itemMap, setItemMap] = useState<Map<number, ItemInfo>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [meId, setMeId] = useState<number | null>(null)

  // Вкладка живёт в URL: ссылка на «Графики» должна открывать «Графики».
  const tab: TabId = (TABS as string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as TabId) : 'overview'
  const setTab = (next: TabId) => setParams((p) => { p.set('tab', next); return p }, { replace: true })

  useEffect(() => {
    let alive = true
    fetchAuth().then((a) => alive && setMeId(a?.loggedIn ? a.steamAccountId ?? null : null))
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setReady(false)
    setError(null)
    setMatch(null)
    setTimeline(null)
    Promise.all([getHeroMap(), getItemMap()]).then(([h, i]) => {
      if (!alive) return
      setHeroMap(h)
      setItemMap(i)
    })
    fetchMatch(matchId)
      .then((m) => alive && setMatch(m))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Матч не загрузился'))
      .finally(() => alive && setLoading(false))
    // таймлайн не блокирует отрисовку: секции графиков включатся, когда придёт
    fetchTimeline(matchId).then((t) => alive && setTimeline(t))
    return () => { alive = false }
  }, [matchId, attempt])

  const board = useMemo(
    () => (match ? buildBoard(match, (p) => resolveImpact(p, match.durationSeconds, null)) : null),
    [match],
  )

  const insights = useMemo(
    () => (match && board ? buildInsights(match, board, timeline, (p) => playerLabel(p, heroMap.get(p.heroId)?.name)) : []),
    [match, board, timeline, heroMap],
  )

  // Единственный оркестрованный момент страницы: табло, затем ось, затем
  // составы. Секции ниже по скроллу больше ничего не выезжают.
  useEffect(() => {
    if (loading || error || !match) return
    const raf = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(raf)
  }, [loading, error, match])

  if (loading) return <PageSkeleton rows={5} />

  if (error || !match || !board) {
    return (
      <Notice kind="error" title={error ? 'Матч не загрузился' : 'Данные не получены'}>
        {error ?? 'Ответ пришёл пустым.'}
        <p>Матч мог быть скрыт или удалён. Проверь ID — и открой другой из истории профиля.</p>
        <div className="notice-actions">
          <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
            <Icon.Timeline size={16} />
            Повторить
          </button>
          <a className="btn btn-ghost" href="/">
            <Icon.ArrowLeft size={16} />
            На главную
          </a>
        </div>
      </Notice>
    )
  }

  const allPlayers = match.players
  const meSlot = meId != null ? slotOfPlayer(match, meId) : null
  const hasEvents = Boolean(timeline && (timeline.structures.length || timeline.kills.length || timeline.roshans.length))
  const tabs = [
    { id: 'overview' as const, label: 'Обзор', icon: <Icon.Spark size={15} /> },
    { id: 'roster' as const, label: 'Игроки', icon: <Icon.Roster size={15} /> },
    { id: 'charts' as const, label: 'Графики', icon: <Icon.Chart size={15} />, disabled: !timeline, hint: timeline ? undefined : 'Реплей ещё не разобран — кривые преимущества нет что строить' },
    { id: 'timeline' as const, label: 'Таймлайн', icon: <Icon.Timeline size={15} />, disabled: !hasEvents, hint: hasEvents ? undefined : 'Событий реплея нет' },
    { id: 'draft' as const, label: 'Драфт', icon: <Icon.Draft size={15} />, disabled: !match.picksBans.length },
  ]

  return (
    <div className={`match${ready ? ' ready' : ''}`}>
      <div className="stage-1">
        <HeroPlate match={match} board={board} timeline={timeline} heroMap={heroMap} />
      </div>

      <div className="stage-2">
        <TabBar items={tabs} value={tab} onChange={setTab} className="subnav" />
      </div>

      <div className="stage-3">
      {tab === 'overview' && (
        <div className="tab-body" role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
          <Insights items={insights} />

          {timeline && (
            <PowerSpine timeline={timeline} durationSeconds={match.durationSeconds} />
          )}

          <div className="chart-grid">
            <CompareBars board={board} />
            <PlayerBars
              title="Нетворт игроков"
              sub="Итоговое состояние на конец матча"
              players={allPlayers}
              pick={(p) => p.networth}
              heroMap={heroMap}
              format={(n) => n.toLocaleString('ru-RU')}
            />
          </div>

          {timeline && (
            <div className="section">
              <Teamfights timeline={timeline} heroMap={heroMap} match={match} meSlot={meSlot} limit={3} />
            </div>
          )}

          <div className="section">
            <Rosters board={board} heroMap={heroMap} itemMap={itemMap} durationSec={match.durationSeconds} />
          </div>
        </div>
      )}

      {tab === 'roster' && (
        <div className="tab-body" role="tabpanel" id="panel-roster" aria-labelledby="tab-roster">
          <Rosters board={board} heroMap={heroMap} itemMap={itemMap} durationSec={match.durationSeconds} />
        </div>
      )}

      {tab === 'charts' && timeline && (
        <div className="tab-body" role="tabpanel" id="panel-charts" aria-labelledby="tab-charts">
          <div className="rosters">
            <MomentumChart timeline={timeline} durationSeconds={match.durationSeconds} />
            <CompareBars board={board} />
            <div className="chart-grid">
              <PlayerBars
                title="Урон по героям"
                sub="Сырой урон без поправки на время матча"
                players={allPlayers}
                pick={(p) => p.heroDamage}
                heroMap={heroMap}
                format={(n) => n.toLocaleString('ru-RU')}
              />
              <PlayerBars
                title="Лечение"
                sub="Кто держал команду на плаву"
                players={allPlayers}
                pick={(p) => p.heroHealing}
                heroMap={heroMap}
                format={(n) => n.toLocaleString('ru-RU')}
              />
            </div>
            <div className="chart-grid">
              <PlayerBars
                title="Золото в минуту"
                sub="Эффективность фарма"
                players={allPlayers}
                pick={(p) => p.goldPerMinute}
                heroMap={heroMap}
                format={(n) => String(n)}
              />
              <PlayerBars
                title="Опыт в минуту"
                sub="Скорость набора уровней"
                players={allPlayers}
                pick={(p) => p.experiencePerMinute}
                heroMap={heroMap}
                format={(n) => String(n)}
              />
            </div>
            <PlayerBars
              title="Урон по строениям"
              sub="Давление на карту"
              players={allPlayers}
              pick={(p) => p.towerDamage}
              heroMap={heroMap}
              format={(n) => n.toLocaleString('ru-RU')}
            />
          </div>
        </div>
      )}

      {tab === 'timeline' && timeline && (
        <div className="tab-body" role="tabpanel" id="panel-timeline" aria-labelledby="tab-timeline">
          <div className="rosters">
            <Teamfights timeline={timeline} heroMap={heroMap} match={match} meSlot={meSlot} />
            <TimelinePanel timeline={timeline} heroMap={heroMap} durationSec={match.durationSeconds} />
          </div>
        </div>
      )}

      {tab === 'draft' && (
        <div className="tab-body" role="tabpanel" id="panel-draft" aria-labelledby="tab-draft">
          <Draft picks={match.picksBans} heroMap={heroMap} match={match} />
        </div>
      )}
      </div>
    </div>
  )
}
