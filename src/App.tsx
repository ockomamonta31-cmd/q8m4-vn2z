import { useEffect, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import PlayerPage from './pages/PlayerPage'
import MatchPage from './pages/MatchPage'
import TopBar from './components/TopBar'
import ScrollToTop from './components/ScrollToTop'
import { DEMO_MODE } from './api/client'
import { apiHealth } from './api'
import { avatarImageUrl } from './api/heroes'
import { parseQuery } from './api/formats'
import { fetchAuth, logoutAuth, type Auth } from './auth'
import { readRecentSearches, type RecentSearch } from './recents'
import { Icon } from './components/Icons'

/** Декоративных кривых на главной нет: линия преимущества строится только по
 *  реальным минутам конкретного матча, на экране поиска данных ещё нет. */
function HomePage({ auth, onSearch }: { auth: Auth | null; onSearch: (q: string) => void }) {
  const [value, setValue] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [recents] = useState<RecentSearch[]>(readRecentSearches)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseQuery(value)
    if (!parsed) {
      setHint('Нужен ID матча или профиля. Можно вставить ссылку на stratz, dotabuff, opendota или Steam.')
      return
    }
    setHint(null)
    onSearch(parsed.kind === 'match' ? `/match/${parsed.id}` : `/player/${parsed.id}`)
  }

  const examples = [
    { kind: 'матч', value: '9040683473' },
    { kind: 'профиль', value: '1858036696' },
    { kind: 'steam64', value: '76561198146069424' },
  ]

  return (
    <div className="home">
      <section className="gate" aria-label="Поиск матча или профиля">
        <div className="gate-body">
          <h1 className="gate-h1">Что случилось<br />в этом матче</h1>

          <p className="gate-lead">
            Винрейт ничего не объясняет. Здесь видно, кто вытянул катку, кто просел относительно своего
            уровня, как качались и что покупали по ходу игры — и в какую минуту матч переломился.
          </p>

          <form className="gate-form" onSubmit={submit}>
            <input
              className="gate-input"
              value={value}
              onChange={(e) => { setValue(e.target.value); setHint(null) }}
              placeholder="ID матча или профиля, ссылка на stratz / dotabuff / Steam"
              aria-label="Найти матч или игрока"
              aria-invalid={Boolean(hint)}
              aria-describedby={hint ? 'search-hint-text' : undefined}
              autoFocus
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="btn" type="submit">Найти</button>
          </form>

          {hint && <p className="gate-error" id="search-hint-text" role="alert">{hint}</p>}
        </div>

        <div className="gate-base">
          <div className="camp-axis" aria-hidden="true">
            <span className="ca-side ca-r">Radiant</span>
            <span className="ca-track" />
            <span className="ca-side ca-d">Dire</span>
          </div>

          <div className="gate-suggest">
            <span>Например</span>
            {examples.map((example) => (
              <button key={example.value} type="button" className="suggest-chip" onClick={() => setValue(example.value)}>
                {example.value}
                <span>{example.kind}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="home-side">
        <section className="panel home-recent" aria-label="Недавние поиски">
          <h2 className="side-title">Недавние поиски</h2>
          {recents.length > 0 ? (
            <div className="recent-list">
              {recents.map((item) => (
                <button
                  key={`${item.kind}:${item.id}`}
                  type="button"
                  className="recent-row"
                  onClick={() => onSearch(item.kind === 'match' ? `/match/${item.id}` : `/player/${item.id}`)}
                >
                  <span className="rr-name">{item.name}</span>
                  <span className="rr-kind">{item.kind === 'match' ? 'матч' : 'профиль'}</span>
                  <span className="rr-id">{item.id}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="side-empty">
              Здесь соберётся то, что ты открывал. Вставь ID матча или ссылку выше — и следующий заход
              начнётся с этого списка.
            </p>
          )}
        </section>

        <section className="panel home-account" aria-label="Аккаунт Steam">
          {auth?.loggedIn && auth.steamAccountId ? (
            <>
              <img className="ha-avatar" src={avatarImageUrl(auth.avatar)} alt="" width={46} height={46} />
              <div className="ha-text">
                <span className="ha-name">{auth.name}</span>
                <span className="ha-note">Аккаунт подключён через Steam.</span>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => onSearch(`/player/${auth.steamAccountId}`)}>
                Открыть свой профиль
              </button>
            </>
          ) : (
            <>
              <span className="ha-mark"><Icon.Steam size={22} /></span>
              <div className="ha-text">
                <span className="ha-name">Аккаунт Steam не подключён</span>
                <span className="ha-note">Вход нужен, чтобы открыть свой профиль и друзей из истории матчей.</span>
              </div>
              <a className="btn btn-ghost" href="/api/auth/steam">Войти через Steam</a>
            </>
          )}
        </section>

        <section className="home-notes" aria-label="Что видно в разборе">
          <h2 className="side-title">Что видно в разборе</h2>

          <article className="note note-lead">
            <h3>Вклад вместо KDA</h3>
            <p>Оценка от −100 до +100: линия статов против типичной для этой позиции и уровня.</p>
            <div className="scale" aria-hidden="true">
              <span className="scale-track"><i className="scale-mid" /></span>
              <span className="scale-ends"><b>−100</b><b>0</b><b>+100</b></span>
            </div>
          </article>

          <div className="note-list">
            <article className="note">
              <h3>Кривая преимущества</h3>
              <p>Золото и опыт по минутам, тимфайты, башни и Рошан на одной оси времени.</p>
            </article>
            <article className="note">
              <h3>Решения по времени</h3>
              <p>Прокачка и покупки привязаны к минутам матча, а не к итоговому списку предметов.</p>
            </article>
          </div>
        </section>
      </div>
    </div>
  )
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [steamKey, setSteamKey] = useState<boolean | null>(null)
  const [auth, setAuth] = useState<Auth | null>(null)

  useEffect(() => {
    if (DEMO_MODE) return
    let alive = true
    apiHealth().then((h) => alive && setSteamKey(h.steamKey))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetchAuth().then((a) => alive && setAuth(a))
    return () => {
      alive = false
    }
  }, [location.pathname])

  const search = (path: string) => navigate(path)

  return (
    <div className="app">
      <div className="world-layer" aria-hidden="true">
        <div className="world-grain" />
      </div>
      <ScrollToTop />
      <TopBar
        auth={auth}
        onSearch={search}
        onLogout={async () => {
          await logoutAuth()
          setAuth({ loggedIn: false })
        }}
      />
      {steamKey === false && (
        <div className="setup-banner">
          <strong>Свой API запущен, но ключ Steam Web API не задан.</strong> Бесплатный ключ создаётся на{' '}
          <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">
            steamcommunity.com/dev/apikey
          </a>{' '}
          и кладётся в <code>.env</code> как <code>STEAM_WEB_API_KEY</code>, после чего{' '}
          <code>npm run dev</code> перезапускают. Данные идут напрямую из Valve, без сторонних
          парсеров. Без ключа интерфейс смотрятся в демо: <code>VITE_DEMO=1</code>.
        </div>
      )}
      <main className="layout">
        <Routes>
          <Route path="/" element={<HomePage auth={auth} onSearch={search} />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/match/:id" element={<MatchPage />} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <span>Dota Match Lab: разбор одного матча на своих данных</span>
          <span>
            Источник — <a href="https://steamcommunity.com/dev/api" target="_blank" rel="noreferrer">Steam Web API</a>{' '}
            и разобранные реплеи, оценки считает локальная модель
          </span>
        </div>
      </footer>
    </div>
  )
}
