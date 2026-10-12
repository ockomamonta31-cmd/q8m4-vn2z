import { useEffect, useState } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import PlayerPage from './pages/PlayerPage'
import MatchPage from './pages/MatchPage'
import TopBar from './components/TopBar'
import ScrollToTop from './components/ScrollToTop'
import { DEMO_MODE } from './api/client'
import { apiHealth } from './api'

function HomePage() {
  return <div className="setup-banner">Введите Steam ID в поиске выше, чтобы открыть профиль и матчи.</div>
}

export default function App() {
  const navigate = useNavigate()
  const [steamKey, setSteamKey] = useState<boolean | null>(null)

  useEffect(() => {
    if (DEMO_MODE) return
    let alive = true
    apiHealth().then((h) => alive && setSteamKey(h.steamKey))
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="app">
      <ScrollToTop />
      <TopBar onSearch={(id) => navigate(`/player/${id}`)} />
      {steamKey === false && (
        <div className="setup-banner">
          <strong>Свой API запущен, но не задан ключ Steam Web API.</strong> Бесплатный ключ создаётся на{' '}
          <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">
            steamcommunity.com/dev/apikey
          </a>{' '}
          (вход через Steam), затем вписывается в <code>.env</code> как{' '}
          <code>STEAM_WEB_API_KEY=...</code> с перезапуском <code>npm run dev</code>. Данные тянутся
          напрямую из Valve — без сторонних парсеров. Без ключа посмотреть интерфейс можно с{' '}
          <code>VITE_DEMO=1</code>.
        </div>
      )}
      <main className="layout">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/match/:id" element={<MatchPage />} />
        </Routes>
      </main>
      <footer className="footer">
        Dota 2 · анализ матчей
      </footer>
    </div>
  )
}
