import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchHeroStats, fetchMatches, fetchMatchesPages, fetchPeers, fetchProfile } from '../api'
import { ApiError, type HeroInfo, type HeroStat, type Peer, type PlayerMatch, type Profile } from '../api/types'
import { getHeroMap } from '../api/heroes'
import { kda, winrate } from '../api/formats'
import PlayerAside from '../components/PlayerAside'
import MatchesTable from '../components/MatchesTable'
import HeroesTable from '../components/HeroesTable'
import PeersList from '../components/PeersList'
import ActivityHeatmap from '../components/ActivityHeatmap'
import { EmptyState, Notice, PageSkeleton } from '../components/States'
import { TabBar } from '../components/primitives'

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
  const [attempt, setAttempt] = useState(0)
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
  }, [playerId, attempt])

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

  const counts: Record<Tab, string | null> = {
    'Обзор': recent.length ? String(recent.length) : null,
    'Матчи': String(matches.length),
    'Герои': heroStats ? String(heroStats.length) : null,
    'Друзья': peers ? String(peers.length) : null,
    'Активность': null,
  }

  if (loading) return <div className="wrap"><PageSkeleton rows={7} variant="profile" /></div>

  if (fatal) {
    return (
      <div className="wrap">
        <Notice kind="error" title="Профиль не загрузился">
          {fatal}
          <p>
            Проверь <code>STEAM_WEB_API_KEY</code> в <code>.env</code>: бесплатный ключ создаётся на{' '}
            <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">steamcommunity.com/dev/apikey</a>{' '}
            и после перезапуска <code>npm run dev</code> начинает работать.
          </p>
          <div className="note-a">
            <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>Повторить</button>
            <Link className="btn btn-q" to="/">Найти другой матч</Link>
          </div>
        </Notice>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="wrap prof">
      <PlayerAside
        profile={profile}
        averages={averages}
        heroStats={heroStats}
        heroMap={heroMap}
        lastMatchTime={matches[0]?.startDateTime ?? null}
      />

      <div className="pmain">
        <div className="pmain-h">
          <TabBar
            items={TABS.map((t) => ({ id: t, label: t, count: counts[t] }))}
            value={tab}
            onChange={setTab}
          />
        </div>

        <div key={tab}>
          {tab === 'Обзор' && (
            matches.length > 0 ? (
              <section className="sec">
                <div className="sec-h">
                  <h2 className="sec-t">Последние матчи</h2>
                  <span className="sec-n">10 из {matches.length}</span>
                </div>
                <MatchesTable matches={matches.slice(0, 10)} heroMap={heroMap} seasonRank={profile.rank} />
              </section>
            ) : (
              <EmptyState title="Матчей в истории нет">
                Steam не отдаёт историю скрытых аккаунтов. Проверь ID или открой матч, который помнишь, —
                разбор соберётся по нему.
              </EmptyState>
            )
          )}

          {tab === 'Матчи' && (
            <section className="sec">
              <div className="sec-h">
                <h2 className="sec-t">История матчей</h2>
                <span className="sec-n">загружено {matches.length}</span>
              </div>
              <MatchesTable matches={matches} heroMap={heroMap} seasonRank={profile.rank} />
              <div style={{ marginTop: 'var(--sp-24)' }}>
                <button className="btn btn-q" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Загружаем…' : 'Показать ещё матчи'}
                </button>
              </div>
            </section>
          )}

          {tab === 'Герои' && (
            <section className="sec">
              <div className="sec-h">
                <h2 className="sec-t">Герои</h2>
                {heroStats && <span className="sec-n">{heroStats.length} героев</span>}
              </div>
              {heroStats ? (
                <>
                  <HeroesTable stats={heroStats} heroMap={heroMap} />
                  {heroStatsSource === 'matches' && (
                    <div className="note" style={{ marginTop: 'var(--sp-24)' }}>
                      <strong className="note-t">Посчитано по последним {recent.length} матчам</strong>
                      <div className="note-b">Точных счётчиков по героям API не отдаёт, поэтому это оценка по доступной истории.</div>
                    </div>
                  )}
                </>
              ) : <PageSkeleton rows={5} band={false} />}
            </section>
          )}

          {tab === 'Друзья' && (
            <section className="sec">
              <div className="sec-h">
                <h2 className="sec-t">Друзья, с которыми играл</h2>
                {peers && <span className="sec-n">{peers.length} игроков</span>}
              </div>
              {peers ? <PeersList peers={peers} /> : (peersError ? (
                <Notice kind="error" title="Друзья не загрузились">
                  {peersError}
                  <p>Без списка друзей профиль всё равно разбирается: пиры считаются по общим матчам, как только список откроют.</p>
                </Notice>
              ) : <PageSkeleton rows={3} band={false} />)}
            </section>
          )}

          {tab === 'Активность' && (
            <section className="sec">
              <div className="sec-h">
                <h2 className="sec-t">Активность</h2>
                <span className="sec-n">матчи по дням</span>
              </div>
              {activityLoading || !activityMatches ? <PageSkeleton rows={3} band={false} /> : <ActivityHeatmap matches={activityMatches} />}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
