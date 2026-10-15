// Страница матча. Данные — из кэша (матч неизменяем), повторное открытие мгновенное.
// Таймлайн реплея опционален: без него вкладки «Графики» и «Таймлайн» не показываются.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { fetchMatch, getItemMap } from '../api'
import { ApiError, type HeroInfo, type ItemInfo, type MatchDetails, type MatchPlayer } from '../api/types'
import { getHeroMap } from '../api/heroes'
import { fetchTimeline, fetchReplayStatus, type ReplayStatus, type MatchTimeline } from '../api/timeline'
import { resolveImpact } from '../api/score'
import { buildBoard, buildInsights, playerLabel, slotOfPlayer } from './match-model'
import { fetchAuth } from '../auth'
import { Notice, PageSkeleton } from '../components/States'
import { TabBar } from '../components/primitives'
import { Icon } from '../components/Icons'
import HeroPlate from '../components/match/HeroPlate'
import Insights from '../components/match/Insights'
import Rosters from '../components/match/Roster'
import Draft from '../components/match/Draft'
import Builds from '../components/match/Builds'
import DraftReview from '../components/match/DraftReview'
import DraftPower from '../components/match/DraftPower'
import { useDraftRating } from '../components/match/useDraftRating'
import TimelinePanel from '../components/match/Timeline'
import Teamfights from '../components/match/Teamfights'
import Edik from '../components/match/Edik'
import { CompareBars, MomentumChart, PlayerBars } from '../components/match/Charts'

type TabId = 'overview' | 'roster' | 'charts' | 'timeline' | 'draft' | 'builds' | 'edik'
const TABS: TabId[] = ['overview', 'roster', 'charts', 'timeline', 'draft', 'builds', 'edik']
const NO_PLAYERS: MatchPlayer[] = []

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
  const [replayStatus, setReplayStatus] = useState<ReplayStatus | null>(null)
  const [replayCheck, setReplayCheck] = useState(0)
  const [replayError, setReplayError] = useState(false)
  const [checkingReplay, setCheckingReplay] = useState(false)

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
    setReplayStatus(null)
    setReplayError(false)
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

  const replayComplete = Boolean(timeline && match?.players.length === 10 && match.players.every(p=>p.evidence?.microVersion===1&&p.mapPlays?.structures?.length))
  useEffect(() => {
    if(loading||error||!match||replayComplete)return
    let alive=true,timer:ReturnType<typeof setTimeout>
    const controller=new AbortController()
    const check=async()=>{
      if(!alive)return
      setCheckingReplay(true)
      try {
        const status=await fetchReplayStatus(matchId,controller.signal)
        if(!alive)return
        setReplayStatus(status);setReplayError(false)
        if(status.state==='ready') {
          const [fresh,parsed]=await Promise.all([fetchMatch(matchId),fetchTimeline(matchId)])
          if(!alive)return
          setMatch(fresh);setTimeline(parsed)
        }
      } catch {if(alive)setReplayError(true)}
      finally {if(alive){setCheckingReplay(false);timer=setTimeout(check,30_000)}}
    }
    void check()
    return ()=>{alive=false;controller.abort();clearTimeout(timer)}
  },[matchId,attempt,replayCheck,loading,error,replayComplete])

  const board = useMemo(
    () => (match ? buildBoard(match, (p) => {
      const teammates = match.players.filter((q) => q.isRadiant === p.isRadiant)
      return resolveImpact({
        ...p,
        teamKills: teammates.reduce((sum, q) => sum + q.kills, 0),
        teamDamage: teammates.reduce((sum, q) => sum + q.heroDamage, 0),
      }, match.durationSeconds, null)
    }) : null),
    [match],
  )

  const insights = useMemo(
    () => (match && board ? buildInsights(match, board, timeline, (p) => playerLabel(p, heroMap.get(p.heroId)?.name)) : []),
    [match, board, timeline, heroMap],
  )

  // Оценка драфта считается один раз на страницу и нужна и вкладке «Драфт»,
  // и обзору. Массив-заглушка константный, чтобы хук не дёргался на каждом
  // рендере до того, как матч пришёл.
  const heroName = useCallback((id: number) => heroMap.get(id)?.name ?? `герой #${id}`, [heroMap])
  const { rating } = useDraftRating(match?.players ?? NO_PLAYERS, match ?? null, heroName)

  // Единственный оркестрованный момент страницы: табло, затем ось, затем
  // составы. Секции ниже по скроллу больше ничего не выезжают.
  useEffect(() => {
    if (loading || error || !match) return
    const raf = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(raf)
  }, [loading, error, match])

  if (loading) return <div className="wrap"><PageSkeleton rows={5} /></div>

  if (error || !match || !board) {
    return (
      <div className="wrap">
        <Notice kind="error" title="Матч не найден">
          {error ?? 'Ответ пришёл пустым.'}
          <p>Матч мог быть скрыт или удалён. Проверь ID — и открой другой из истории профиля.</p>
          <div className="note-a">
            <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>Повторить</button>
            <a className="btn btn-q" href="/">На главную</a>
          </div>
        </Notice>
      </div>
    )
  }

  const allPlayers = match.players
  const meSlot = meId != null ? slotOfPlayer(match, meId) : null
  const hasEvents = Boolean(timeline && (timeline.structures.length || timeline.kills.length || timeline.roshans.length))
  // Драфт есть там, где герои выбирались: баны либо хоть один зафиксированный
  // выбор. В All Random/ARDM ни того, ни другого в данных нет.
  const hasDraft = Boolean(match.draft?.picks.length) || match.picksBans.length > 0
  const hasBuilds = allPlayers.some((p) => p.abilityUpgrades.length > 0)
  const tabs = [
    { id: 'overview' as const, label: 'Обзор' },
    { id: 'edik' as const, label: 'Эдик' },
    { id: 'roster' as const, label: 'Игроки' },
    { id: 'charts' as const, label: 'Графики', disabled: !timeline, hint: timeline ? undefined : 'Реплей ещё не разобран — кривой преимущества нет' },
    { id: 'timeline' as const, label: 'Таймлайн', disabled: !hasEvents, hint: hasEvents ? undefined : 'Событий реплея нет' },
    { id: 'draft' as const, label: 'Драфт', disabled: !hasDraft, hint: hasDraft ? undefined : 'В этом режиме нет драфта: герои выбираются свободно' },
    { id: 'builds' as const, label: 'Билды', disabled: !hasBuilds, hint: hasBuilds ? undefined : 'Ни у одного игрока нет записей прокачки' },
  ]

  return (
    <div className="mpage">
      <div>
        <HeroPlate match={match} board={board} timeline={timeline} heroMap={heroMap} />
      </div>

      <div>
        <div className="mrail">
          <TabBar items={tabs} value={tab} onChange={setTab} />
        </div>
      </div>

      <div className="mbody">
      {!replayComplete && <Notice kind={replayStatus?.state==='retry'||replayError?'error':'info'} title={replayError?'Статус реплея временно недоступен':replayStatus?.state==='waiting'?'Ждём адрес реплея':replayStatus?.state==='parsing'?'Разбираем реплей':replayStatus?.state==='retry'?'Разбор реплея прервался':'Реплей в очереди на разбор'}>
        <p>{replayError?'Не удалось связаться с сервером. Повторим проверку автоматически.':replayStatus?.state==='waiting'?'Источник пока не отдаёт адрес реплея. Когда он появится, разбор запустится автоматически.':replayStatus?.state==='parsing'?'Реплей найден. Загружаем события, маршруты и данные для Эдика.':replayStatus?.state==='retry'?'При загрузке или обработке произошла ошибка. Система повторит попытку в следующем фоновом запуске.':'Основная статистика уже доступна. События, графики и подробный разбор Эдика появятся после обработки реплея.'} Страница проверяет готовность каждые 30 секунд.</p>
        <button type="button" className="btn btn-q" disabled={checkingReplay} onClick={()=>setReplayCheck(n=>n+1)}>{checkingReplay?'Проверяем…':'Проверить сейчас'}</button>
      </Notice>}
      {tab === 'overview' && (
        <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
          <Insights items={insights} />
          <div className="edik-entry"><div><h2>Разобрать свою игру с Эдиком</h2><p>Выбери героя и нажми «Хочу разбор»: Эдик проверит смерти, линию, драки и сборку под пик врага, а затем даст вывод и план на следующую игру.</p></div><button type="button" className="btn" onClick={() => setTab('edik')}>Открыть разбор</button></div>

          <div className="sec">
            {timeline && <MomentumChart timeline={timeline} durationSeconds={match.durationSeconds} />}
            <CompareBars board={board} />
            <PlayerBars
              title="Нетворс игроков"
              sub="Итоговое состояние на конец матча"
              players={allPlayers}
              pick={(p) => p.networth}
              heroMap={heroMap}
              format={(n) => n.toLocaleString('ru-RU')}
            />
          </div>

          {timeline && (
            <div className="sec">
              <Teamfights timeline={timeline} heroMap={heroMap} match={match} meSlot={meSlot} limit={3} />
            </div>
          )}

          <Rosters board={board} heroMap={heroMap} itemMap={itemMap} durationSec={match.durationSeconds} />

          <div className="sec">
            <DraftReview players={allPlayers} heroMap={heroMap} rating={rating} />
          </div>
        </div>
      )}

      {tab === 'roster' && (
        <div role="tabpanel" id="panel-roster" aria-labelledby="tab-roster">
          <Rosters board={board} heroMap={heroMap} itemMap={itemMap} durationSec={match.durationSeconds} />
        </div>
      )}

      {tab === 'charts' && timeline && (
        <div role="tabpanel" id="panel-charts" aria-labelledby="tab-charts">
          <MomentumChart timeline={timeline} durationSeconds={match.durationSeconds} />
          <div className="sec">
            <CompareBars board={board} />
          </div>
          <div className="sec">
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
          <div className="sec">
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
          <div className="sec">
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
        <div role="tabpanel" id="panel-timeline" aria-labelledby="tab-timeline">
          <Teamfights timeline={timeline} heroMap={heroMap} match={match} meSlot={meSlot} />
          <div className="sec">
            <TimelinePanel timeline={timeline} heroMap={heroMap} durationSec={match.durationSeconds} />
          </div>
        </div>
      )}

      {tab === 'draft' && hasDraft && (
        <div role="tabpanel" id="panel-draft" aria-labelledby="tab-draft">
          <DraftPower rating={rating} heroMap={heroMap} />
          <div className="sec">
            <DraftReview players={allPlayers} heroMap={heroMap} rating={rating} />
          </div>
          <div className="sec">
            <details className="analysis-method"><summary>История пиков и банов</summary><Draft heroMap={heroMap} match={match} /></details>
          </div>
        </div>
      )}

      {tab === 'edik' && <div role="tabpanel" id="panel-edik" aria-labelledby="tab-edik"><Edik key={match.id} match={match} timeline={timeline} rating={rating} heroMap={heroMap} meSlot={meSlot} initialFight={params.has('fight') && Number.isInteger(Number(params.get('fight'))) ? Number(params.get('fight')) : null} /></div>}

      {tab === 'builds' && (
        <div role="tabpanel" id="panel-builds" aria-labelledby="tab-builds">
          <Builds sides={board.sides} heroMap={heroMap} itemMap={itemMap} />
        </div>
      )}
      </div>
    </div>
  )
}
