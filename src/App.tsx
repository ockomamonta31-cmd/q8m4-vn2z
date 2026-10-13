import { useEffect, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import PlayerPage from './pages/PlayerPage'
import MatchPage from './pages/MatchPage'
import TopBar from './components/TopBar'
import ScrollToTop from './components/ScrollToTop'
import { DEMO_MODE } from './api/client'
import { apiHealth } from './api'
import { avatarImageUrl, heroImageUrl } from './api/heroes'
import { parseQuery } from './api/formats'
import { fetchAuth, logoutAuth, type Auth } from './auth'
import { readRecentSearches, type RecentSearch } from './recents'
import { Icon } from './components/Icons'

/** Три героя справа — витрина, а не данные: они ничего не утверждают. */
const SHOWCASE = ['invoker', 'phantom_assassin', 'pudge']

function HomePage({ auth, onSearch }: { auth: Auth | null; onSearch: (q: string) => void }) {
  const [value, setValue] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [recents] = useState<RecentSearch[]>(readRecentSearches)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseQuery(value)
    if (!parsed) {
      setHint('Нужен ID матча или игрока. Можно вставить ссылку на stratz, dotabuff, OpenDota или Steam.')
      return
    }
    setHint(null)
    onSearch(parsed.kind === 'match' ? `/match/${parsed.id}` : `/player/${parsed.id}`)
  }

  return (
    <div className="wrap home">
      <div>
        <h1 className="home-t">Разбор матча по ID</h1>

        <p className="home-p">
          Винрейт ничего не объясняет. Здесь видно, кто вытянул катку, кто просел относительно
          своей линии, как качались и что покупали — и в какую минуту матч переломился.
        </p>

        <form className="home-form" onSubmit={submit}>
          <input
            className="home-in"
            value={value}
            onChange={(e) => { setValue(e.target.value); setHint(null) }}
            placeholder="ID матча или игрока, ссылка на stratz / dotabuff / Steam"
            aria-label="Найти матч или игрока"
            aria-invalid={Boolean(hint)}
            aria-describedby={hint ? 'home-hint' : undefined}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn" type="submit">Найти</button>
        </form>

        {hint && <p className="home-err" id="home-hint" role="alert">{hint}</p>}

        {recents.length > 0 && (
          <>
            <p className="home-lbl">Недавние поиски</p>
            <div className="home-chips">
              {recents.map((item) => (
                <button
                  key={`${item.kind}:${item.id}`}
                  type="button"
                  className="home-chip"
                  onClick={() => onSearch(item.kind === 'match' ? `/match/${item.id}` : `/player/${item.id}`)}
                >
                  {item.name}
                  <small>{item.kind === 'match' ? 'матч' : 'профиль'}</small>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div>
        <div className="home-art" aria-hidden="true">
          {SHOWCASE.map((hero) => (
            <figure key={hero}>
              <img src={heroImageUrl(hero)} alt="" loading="lazy" />
            </figure>
          ))}
        </div>

        <div className="home-info">
          <div className="home-row">
            <b>{auth?.loggedIn ? auth.name : 'Аккаунт Steam не подключён'}</b>
            <span>
              {auth?.loggedIn
                ? 'Вход открыт — свой профиль и друзья доступны.'
                : 'Вход нужен, чтобы открыть свой профиль и друзей из истории матчей.'}
            </span>
            {auth?.loggedIn && auth.steamAccountId ? (
              <span className="home-act">
                <button type="button" className="btn btn-q" onClick={() => onSearch(`/player/${auth.steamAccountId}`)}>
                  Открыть свой профиль
                </button>
              </span>
            ) : (
              <span className="home-act">
                <a className="btn btn-q" href="/api/auth/steam">
                  <Icon.Steam size={16} />
                  Войти через Steam
                </a>
              </span>
            )}
          </div>

          <div className="home-row">
            <b>Вклад вместо KDA</b>
            <span>Оценка от −100 до +100: статы против типичной линии для этой позиции и винрейта.</span>
          </div>

          <div className="home-row">
            <b>Ось времени</b>
            <span>Золото и опыт по минутам, тимфайты, башни и Рошан на одной минутной шкале.</span>
          </div>
        </div>
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
    return () => { alive = false }
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
      <div className="page-bg" aria-hidden="true" />
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
        <div className="warn">
          <strong>Свой API запущен, но ключ Steam Web API не задан.</strong> Бесплатный ключ — на{' '}
          <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">
            steamcommunity.com/dev/apikey
          </a>
          , в <code>.env</code> как <code>STEAM_WEB_API_KEY</code>, после чего <code>npm run dev</code> перезапускают.
          Данные идут напрямую из Valve, без сторонних парсеров. Без ключа интерфейс смотрят в демо: <code>VITE_DEMO=1</code>.
        </div>
      )}
      <main className="grow">
        <Routes>
          <Route path="/" element={<HomePage auth={auth} onSearch={search} />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/match/:id" element={<MatchPage />} />
        </Routes>
      </main>
      <footer className="ftr">
        <div className="ftr-in">
          <span>Dota Match Lab — разбор одного матча на своих данных</span>
          <span>
            Источник — <a href="https://steamcommunity.com/dev/api" target="_blank" rel="noreferrer">Steam Web API</a>,
            разобранные реплеи и <a href="https://www.stratz.com/api" target="_blank" rel="noreferrer">STRATZ</a> для
            полного драфта, линий и винрейтов героев; оценки считает локальная модель
          </span>
        </div>
      </footer>
    </div>
  )
}
