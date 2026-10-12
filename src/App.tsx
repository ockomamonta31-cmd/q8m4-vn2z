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

/** Декоративная кривая преимущества — единственный «живой» элемент главной. */
function CurveLine() {
  return (
    <svg className="plate-curve" viewBox="0 0 900 200" preserveAspectRatio="none" aria-hidden="true">
      <line className="c-zero" x1="0" y1="100" x2="900" y2="100" />
      <path className="c-gold" d="M0 100 C 90 128, 140 60, 210 78 S 320 150, 400 128 S 520 30, 610 58 S 720 132, 800 96 L 900 40" />
      <path className="c-xp" d="M0 108 C 100 140, 160 84, 240 96 S 350 158, 430 134 S 540 52, 630 74 S 740 128, 900 62" />
    </svg>
  )
}

function HomePage({ auth, onSearch }: { auth: Auth | null; onSearch: (q: string) => void }) {
  const [value, setValue] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [recents] = useState<RecentSearch[]>(readRecentSearches)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseQuery(value)
    if (!parsed) {
      setHint('Нужен ID матча или профиля — можно вставить ссылку на stratz, dotabuff, opendota или Steam.')
      return
    }
    setHint(null)
    onSearch(parsed.kind === 'match' ? `/match/${parsed.id}` : `/player/${parsed.id}`)
  }

  const examples = [
    { label: 'матч', value: '9040683473' },
    { label: 'профиль', value: '1858036696' },
    { label: 'steam64', value: '76561198146069424' },
  ]

  return (
    <div className="home">
      <section className="plate" aria-label="Поиск матча или профиля">
        <CurveLine />

        <div className="plate-body">
          <div className="plate-kicker">
            <span className="dot" />
            <span>Разбор матчей Dota 2 на данных Valve и разобранных реплеях</span>
          </div>

          <h1 className="plate-h1">Что случилось<br />в этом матче</h1>

          <p className="plate-lead">
            Винрейт ничего не объясняет. Здесь видно, кто вытянул катку, кто просел относительно своего
            уровня, как качались и что покупали по ходу игры — и в какую минуту матч переломился.
          </p>

          <form className="plate-form" onSubmit={submit}>
            <input
              className="plate-input"
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
            <button className="btn" type="submit">
              Найти
              <Icon.ArrowRight size={16} />
            </button>
          </form>
          {hint && <p className="plate-error" id="search-hint-text" role="alert">{hint}</p>}

          <div className="plate-suggest">
            <span>Например:</span>
            {examples.map((example) => (
              <button key={example.value} type="button" className="suggest-chip" onClick={() => setValue(example.value)}>
                {example.value}
                <span className="muted"> · {example.label}</span>
              </button>
            ))}
          </div>

          {auth?.loggedIn && auth.steamAccountId ? (
            <button type="button" className="quick-chip" onClick={() => onSearch(`/player/${auth.steamAccountId}`)}>
              <img src={avatarImageUrl(auth.avatar)} alt="" width={30} height={30} />
              Открыть свой профиль
            </button>
          ) : (
            <a className="quick-chip" href="/api/auth/steam">
              <Icon.Steam size={22} />
              Войти через Steam и открыть свой профиль
            </a>
          )}
        </div>

        <div className="plate-foot">
          <div className="foot-cell">
            <h3><i className="swatch" />Вклад вместо KDA</h3>
            <p>Оценка от −100 до +100: линия статов против типичной для этой позиции и уровня.</p>
          </div>
          <div className="foot-cell">
            <h3><i className="swatch" />Кривая преимущества</h3>
            <p>Золото и опыт по минутам, тимфайты, башни и Рошан на одной оси времени.</p>
          </div>
          <div className="foot-cell">
            <h3><i className="swatch" />Решения по времени</h3>
            <p>Прокачка и покупки привязаны к минутам матча, а не к итоговому списку предметов.</p>
          </div>
        </div>
      </section>

      {recents.length > 0 && (
        <section className="home-recent" aria-label="Недавние поиски">
          <div className="half-title">Вы искали</div>
          <div className="half-list">
            {recents.map((item) => (
              <button key={`${item.kind}:${item.id}`} type="button" className="recent-row" onClick={() => onSearch(item.kind === 'match' ? `/match/${item.id}` : `/player/${item.id}`)}>
                <span>{item.name}</span>
                <small>{item.kind === 'match' ? 'матч' : 'профиль'} · {item.id}</small>
              </button>
            ))}
          </div>
        </section>
      )}
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
        <div className="world-grid" />
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
          <span>Dota Match Lab · разбор матчей на своих данных</span>
          <span>
            Источник — <a href="https://steamcommunity.com/dev/api" target="_blank" rel="noreferrer">Steam Web API</a>{' '}
            и разобранные реплеи; оценки — локальная модель
          </span>
        </div>
      </footer>
    </div>
  )
}
