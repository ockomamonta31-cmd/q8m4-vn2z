import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchHeroStats, fetchMatches, fetchMatchesPages, fetchPeers, fetchProfile } from '../api'
import { ApiError, type HeroInfo, type HeroStat, type Peer, type PlayerMatch, type Profile } from '../api/types'
import { getHeroMap } from '../api/heroes'
import { fmtWinrate, kda, winrate } from '../api/formats'
import PlayerHeader from '../components/PlayerHeader'
import MatchesTable from '../components/MatchesTable'
import HeroesTable from '../components/HeroesTable'
import PeersList from '../components/PeersList'
import ActivityHeatmap from '../components/ActivityHeatmap'

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
    // матчей, и страница висит на спиннере вместо того чтобы показывать данные.
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
        .catch((e) => alive && setPeersError(e instanceof Error ? e.message : 'Пиры недоступны'))
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
      setFatal(e instanceof Error ? e.message : 'Не удалось загрузить матчи')
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
      kda: (sum.k + sum.a) / Math.max(1, sum.d),
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

  if (loading) {
    return (
      <div>
        <div className="spinner" />
      </div>
    )
  }

  if (fatal) {
    return (
      <div className="error-panel">
        <h3>Не удалось загрузить данные</h3>
        <div>{fatal}</div>
        <p className="muted">
          Проверь <code>STEAM_WEB_API_KEY</code> в файле <code>stratz/.env</code> — бесплатный ключ
          создаётся на{' '}
          <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">
            steamcommunity.com/dev/apikey
          </a>
          . Затем перезапусти <code>npm run dev</code>.
        </p>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="player-page">
      <PlayerHeader profile={profile} lastMatchTime={matches[0]?.startDateTime ?? null} />

      <nav className="tabs" role="tablist" aria-label="Разделы профиля">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={t === tab} className={`tab ${t === tab ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      {tab === 'Обзор' && (
        <div className="overview-grid">
          <div className="overview-main">
            {averages ? (
              <section className="stat-band" aria-label="Средняя статистика по загруженным матчам">
                <div className="stat-cell stat-primary"><span>Винрейт · последние {averages.n}</span><strong>{fmtWinrate(averages.wins, averages.n)}</strong><small>{averages.wins} побед / {averages.n - averages.wins} поражений</small></div>
                <div className="stat-cell"><span>Средний KDA</span><strong>{averages.kda.toFixed(2)}</strong><small>{averages.avgK.toFixed(1)} / {averages.avgD.toFixed(1)} / {averages.avgA.toFixed(1)}</small></div>
                <div className="stat-cell"><span>Золото в минуту</span><strong>{Math.round(averages.gpm)}</strong><small>GPM</small></div>
                <div className="stat-cell"><span>Опыт в минуту</span><strong>{Math.round(averages.xpm)}</strong><small>XPM</small></div>
                <div className="stat-cell"><span>Убийства / матч</span><strong>{averages.avgK.toFixed(1)}</strong><small>в среднем</small></div>
                <div className="stat-cell"><span>Смерти / матч</span><strong>{averages.avgD.toFixed(1)}</strong><small>в среднем</small></div>
              </section>
            ) : <div className="inline-note">Нет загруженных матчей для статистики.</div>}

            <section className="content-section">
              <header className="section-heading"><h2>Последние матчи</h2><span>10 последних</span></header>
              <MatchesTable matches={matches.slice(0, 10)} heroMap={heroMap} seasonRank={profile.rank} />
            </section>
          </div>

          <aside className="overview-aside">
            <section className="content-section heroes-preview">
              <header className="section-heading"><h2>Чаще всего играет</h2><span>Герои</span></header>
              {heroStats ? <HeroesTable stats={heroStats.slice(0, 5)} heroMap={heroMap} /> : <div className="inline-note">Статистика по героям недоступна.</div>}
            </section>
            <div className="data-note"><strong>Что попало в обзор</strong><span>Сводка рассчитана по загруженным матчам. История и активность догружаются отдельно.</span></div>
          </aside>
        </div>
      )}

      {tab === 'Матчи' && (
        <section className="content-section">
          <header className="section-heading"><h2>История матчей</h2><span>{matches.length} загружено</span></header>
          <MatchesTable matches={matches} heroMap={heroMap} seasonRank={profile.rank} />
          <button className="btn load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Загрузка…' : 'Показать ещё матчи'}</button>
        </section>
      )}

      {tab === 'Герои' && (
        <section className="content-section">
          <header className="section-heading"><h2>Герои</h2>{heroStats && <span>{heroStats.length} героев</span>}</header>
          {heroStats ? <><HeroesTable stats={heroStats} heroMap={heroMap} />{heroStatsSource === 'matches' && <div className="inline-note">Агрегировано из последних {recent.length} матчей: точные счётчики из API героев недоступны.</div>}</> : <div className="inline-note">Статистика по героям недоступна.</div>}
        </section>
      )}

      {tab === 'Друзья' && (
        <section className="content-section">
          <header className="section-heading"><h2>Друзья, с которыми играл</h2>{peers && <span>{peers.length} игроков</span>}</header>
          {peers ? <PeersList peers={peers} /> : <div className="inline-note">{peersError ?? 'Друзья недоступны.'}</div>}
        </section>
      )}

      {tab === 'Активность' && (
        <section className="content-section">
          <header className="section-heading"><h2>Активность</h2><span>По дням</span></header>
          {activityLoading || !activityMatches ? <div className="loading-line" aria-label="Загружаем активность" /> : <ActivityHeatmap matches={activityMatches} />}
        </section>
      )}
    </div>
  )
}
