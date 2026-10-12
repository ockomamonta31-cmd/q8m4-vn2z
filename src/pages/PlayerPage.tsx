import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchHeroStats, fetchMatches, fetchMatchesPages, fetchPeers, fetchProfile } from '../api'
import { ApiError, type HeroInfo, type HeroStat, type Peer, type PlayerMatch, type Profile } from '../api/types'
import { getHeroMap } from '../api/heroes'
import { kda, winrate } from '../api/formats'
import PlayerHeader from '../components/PlayerHeader'
import MatchesTable from '../components/MatchesTable'
import HeroesTable from '../components/HeroesTable'
import PeersList from '../components/PeersList'
import ActivityHeatmap from '../components/ActivityHeatmap'
import { Notice, PageSkeleton } from '../components/States'

const PAGE_SIZE = 25
const TABS = ['Обзор', 'Матчи', 'Герои', 'Друзья', 'Активность'] as const
type Tab = (typeof TABS)[number]

export default function PlayerPage() {
  const { id } = useParams()
  const playerId = Number(id)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [matches, setMatches] = useState<PlayerMatch[]>([])
  const [heroStats, setHeroStats] = useState<HeroStat[] | null>(null)
  const [heroStatsSource, setHeroStatsSource] = useState<'api' | 'matches'>('api')
  const [peers, setPeers] = useState<Peer[] | null>(null)
  const [peersError, setPeersError] = useState<string | null>(null)
  const [heroMap, setHeroMap] = useState<Map<number, HeroInfo>>(new Map())
  const [tab, setTab] = useState<Tab>(TABS[0])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [activityMatches, setActivityMatches] = useState<PlayerMatch[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setProfile(null)
    setMatches([])
    setHeroStats(null)
    setPeers(null)
    setPeersError(null)
    setFatal(null)
    setTab(TABS[0])
    setActivityMatches(null)

    getHeroMap().then((m) => alive && setHeroMap(m))

    // Герои и пиры считаются по всем 100 накачанным матчам. Их просим ПОСЛЕ
    // первого экрана: иначе сто фоновых запросов отъедают окно Steam у списка
    // матчей, и страница висит на скелетоне вместо того чтобы показывать данные.
    function loadAggregates() {
      fetchHeroStats(playerId)
        .then((r) => {
          if (!alive) return
          setHeroStats(r.stats)
          setHeroStatsSource(r.source)
        })
        .catch(() => {})
      fetchPeers(playerId)
        .then((v) => alive && setPeers(v))
        .catch((e) => alive && setPeersError(e instanceof Error ? e.message : 'Друзья не загрузились'))
    }

    async function load() {
      const [prof, ms] = await Promise.allSettled([fetchProfile(playerId), fetchMatches(playerId, PAGE_SIZE, 0)])
      if (!alive) return          // Фатальные ошибки (нет ключа / недоступен свой API) — показываем панель настройки
      for (const r of [prof, ms]) {
        if (r.status === 'rejected' && r.reason instanceof ApiError &&
            (r.reason.kind === 'no_token' || r.reason.kind === 'cloudflare' || r.reason.kind === 'http')) {
          setFatal(r.reason.message)
          setLoading(false)
          return
        }
      }

      if (prof.status === 'fulfilled') setProfile(prof.value)
      else setProfile({ steamAccountId: playerId, name: `#${playerId}`, avatar: null, matchCount: null, winCount: null, rank: null, rankIsCore: null })

      if (ms.status === 'fulfilled') setMatches(ms.value)
      else if (ms.reason instanceof ApiError) setFatal(ms.reason.message)

      setLoading(false)
      loadAggregates()
    }
    load()
    return () => {
      alive = false
    }
  }, [playerId])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const next = await fetchMatches(playerId, PAGE_SIZE, matches.length)
      setMatches((prev) => [...prev, ...next])
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'Матчи не загрузились')
    } finally {
      setLoadingMore(false)
    }
  }, [playerId, matches.length])

  // Тепловая карта: дозагружаем историю при открытии вкладки
  useEffect(() => {
    if (tab !== 'Активность' || activityMatches || activityLoading) return
    setActivityLoading(true)
    fetchMatchesPages(playerId, 500, 50)
      .then((all) => setActivityMatches(all.length ? all : matches))
      .catch(() => setActivityMatches(matches))
      .finally(() => setActivityLoading(false))
  }, [tab, activityMatches, activityLoading, playerId, matches])

  const recent = useMemo(() => matches.slice(0, 50), [matches])

  const averages = useMemo(() => {
    if (recent.length === 0) return null
    const n = recent.length
    const sum = recent.reduce(
      (acc, m) => {
        acc.k += m.player.kills
        acc.d += m.player.deaths
        acc.a += m.player.assists
        acc.gpm += m.player.goldPerMinute
        acc.xpm += m.player.experiencePerMinute
        acc.wins += m.player.isVictory ? 1 : 0
        return acc
      },
      { k: 0, d: 0, a: 0, gpm: 0, xpm: 0, wins: 0 },
    )
    return {
      kda: kda(sum.k, sum.d, sum.a),
      avgK: sum.k / n,
      avgD: sum.d / n,
      avgA: sum.a / n,
      gpm: sum.gpm / n,
      xpm: sum.xpm / n,
      wins: sum.wins,
      wr: winrate(sum.wins, n),
      n,
    }
  }, [recent])

  const counts = useMemo(() => ({
    'Обзор': recent.length ? String(recent.length) : null,
    'Матчи': String(matches.length),
    'Герои': heroStats ? String(heroStats.length) : null,
    'Друзья': peers ? String(peers.length) : null,
    'Активность': null,
  }), [recent.length, matches.length, heroStats, peers])

  if (loading) return <PageSkeleton rows={7} />

  if (fatal) {
    return (
      <Notice kind="error" title="Данные не загрузились">
        {fatal}
        <p>
          Проверь <code className="code">STEAM_WEB_API_KEY</code> в <code className="code">.env</code>: бесплатный
          ключ создаётся на{' '}
          <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">steamcommunity.com/dev/apikey</a>{' '}
          и после перезапуска <code className="code">npm run dev</code> начинает работать.
        </p>
      </Notice>
    )
  }

  if (!profile) return null

  return (
    <div className="player-page">
      <PlayerHeader profile={profile} lastMatchTime={matches[0]?.startDateTime ?? null} />

      <nav className="tabs" role="tablist" aria-label="Разделы профиля">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={t === tab} className={`tab${t === tab ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t}
            {counts[t] && <span className="tab-count">{counts[t]}</span>}
          </button>
        ))}
      </nav>

      {tab === 'Обзор' && (
        <div className="overview-grid">
          <div className="overview-main">
            {averages ? (
              <section className="readout" aria-label="Средние показатели по загруженным матчам">
                <div className="readout-cell primary cell-accent">
                  <div className="cell-label">Винрейт · {averages.n} матчей</div>
                  <div className="cell-value">{averages.wr.toFixed(1)}<span className="pct">%</span></div>
                  <div className="cell-sub">{averages.wins} побед · {averages.n - averages.wins} поражений</div>
                </div>
                <div className="readout-cell">
                  <div className="cell-label">Средний KDA</div>
                  <div className="cell-value">{averages.kda.toFixed(2)}</div>
                  <div className="cell-sub">{averages.avgK.toFixed(1)} / {averages.avgD.toFixed(1)} / {averages.avgA.toFixed(1)}</div>
                </div>
                <div className="readout-cell">
                  <div className="cell-label">Золото/мин</div>
                  <div className="cell-value">{Math.round(averages.gpm)}</div>
                  <div className="cell-sub">GPM</div>
                </div>
                <div className="readout-cell">
                  <div className="cell-label">Опыт/мин</div>
                  <div className="cell-value">{Math.round(averages.xpm)}</div>
                  <div className="cell-sub">XPM</div>
                </div>
                <div className="readout-cell">
                  <div className="cell-label">Убийства</div>
                  <div className="cell-value">{averages.avgK.toFixed(1)}</div>
                  <div className="cell-sub">в среднем за матч</div>
                </div>
                <div className="readout-cell">
                  <div className="cell-label">Смерти</div>
                  <div className="cell-value">{averages.avgD.toFixed(1)}</div>
                  <div className="cell-sub">в среднем за матч</div>
                </div>
              </section>
            ) : <div className="notice">Загруженных матчей нет — сводку считать не по чему.</div>}

            <section className="section">
              <header className="section-head">
                <h2 className="section-title">Последние матчи</h2>
                <span className="section-note">10 из {matches.length}</span>
              </header>
              <MatchesTable matches={matches.slice(0, 10)} heroMap={heroMap} seasonRank={profile.rank} />
            </section>
          </div>

          <aside className="overview-aside">
            <section className="section section-aside">
              <header className="section-head">
                <h2 className="section-title">Чаще всего играет</h2>
                <span className="section-note">герои</span>
              </header>
              {heroStats ? <HeroesTable stats={heroStats.slice(0, 5)} heroMap={heroMap} compact /> : <div className="notice">Считаем по героям — данные подгрузятся со следующих страниц истории.</div>}
            </section>
            <div className="notice">
              <strong className="notice-title">Что попало в обзор</strong>
              Сводка рассчитана по загруженным матчам. Полная история и активность догружаются на своих вкладках.
            </div>
          </aside>
        </div>
      )}

      {tab === 'Матчи' && (
        <section className="section">
          <header className="section-head">
            <h2 className="section-title">История матчей</h2>
            <span className="section-note">загружено {matches.length}</span>
          </header>
          <MatchesTable matches={matches} heroMap={heroMap} seasonRank={profile.rank} />
          <button className="btn load-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Загружаем…' : 'Показать ещё матчи'}
          </button>
        </section>
      )}

      {tab === 'Герои' && (
        <section className="section">
          <header className="section-head">
            <h2 className="section-title">Герои</h2>
            {heroStats && <span className="section-note">{heroStats.length} героев</span>}
          </header>
          {heroStats ? (
            <>
              <HeroesTable stats={heroStats} heroMap={heroMap} />
              {heroStatsSource === 'matches' && (
                <div className="notice">Посчитано по последним {recent.length} матчам: точных счётчиков по героям API не отдаёт.</div>
              )}
            </>
          ) : <PageSkeleton rows={5} band={false} />}
        </section>
      )}

      {tab === 'Друзья' && (
        <section className="section">
          <header className="section-head">
            <h2 className="section-title">Друзья, с которыми играл</h2>
            {peers && <span className="section-note">{peers.length} игроков</span>}
          </header>
          {peers ? <PeersList peers={peers} /> : (peersError ? <div className="notice">{peersError}</div> : <PageSkeleton rows={3} band={false} />)}
        </section>
      )}

      {tab === 'Активность' && (
        <section className="section">
          <header className="section-head">
            <h2 className="section-title">Активность</h2>
            <span className="section-note">матчи по дням</span>
          </header>
          {activityLoading || !activityMatches ? <PageSkeleton rows={3} band={false} /> : <ActivityHeatmap matches={activityMatches} />}
        </section>
      )}
    </div>
  )
}
