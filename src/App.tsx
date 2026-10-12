import { useEffect, useState } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import PlayerPage from './pages/PlayerPage'
import MatchPage from './pages/MatchPage'
import TopBar from './components/TopBar'
import ScrollToTop from './components/ScrollToTop'
import { DEMO_MODE } from './api/client'
import { apiHealth } from './api'

function HomePage() {
  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-copy">
          <h1>Смотри не только счёт.<br /><span>Разбирай сам матч.</span></h1>
          <p>Профиль игрока, ход игры и решения по ходу матча — в одном месте.</p>
          <button className="home-search-cta" type="button" onClick={() => document.querySelector<HTMLInputElement>('.search input')?.focus()}>
            Найти игрока
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5" /></svg>
          </button>
        </div>
        <div className="home-board" aria-label="Что можно изучить: счёт, героев и покупки">
          <div className="board-line board-top"><span>ИГРА</span><span>РАЗБОР</span></div>
          <div className="board-matchup"><div><i />Radiant</div><span>VS</span><div><i />Dire</div></div>
          <div className="board-details">
            <span>Счёт и драфт</span><span>Раскачка по уровням</span><span>Покупки по времени</span>
          </div>
          <svg className="board-route" viewBox="0 0 480 90" preserveAspectRatio="none" aria-hidden="true"><path d="M4 70 C95 70 92 18 180 18 S270 72 345 54 405 16 476 18" /><circle cx="4" cy="70" r="4" /><circle cx="180" cy="18" r="4" /><circle cx="345" cy="54" r="4" /><circle cx="476" cy="18" r="4" /></svg>
        </div>
      </section>
      <section className="home-index" aria-label="Разделы сайта">
        <div><span>01</span><strong>Профиль</strong><small>Результаты, герои и друзья</small></div>
        <div><span>02</span><strong>Матчи</strong><small>Счёт, драфт и вклад игроков</small></div>
        <div><span>03</span><strong>Сборка</strong><small>Покупки и раскачка по ходу игры</small></div>
      </section>
    </div>
  )
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
