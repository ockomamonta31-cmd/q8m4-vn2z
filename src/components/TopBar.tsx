import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchProfile } from '../api'
import { avatarImageUrl } from '../api/heroes'

type Recent = { id: number; name: string }
type Auth = { loggedIn: boolean; steamAccountId?: number; name?: string; avatar?: string | null }
const RECENTS_KEY = 'dota.recentProfiles.v1'
const THEME_KEY = 'matchlab.theme.v1'

function loadTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch { return 'light' }
}

function loadRecents(): Recent[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as Recent[]
    return Array.isArray(value) ? value.slice(0, 5) : []
  } catch { return [] }
}

export default function TopBar({ onSearch }: { onSearch: (id: string) => void }) {
  const [value, setValue] = useState('')
  const [recents, setRecents] = useState<Recent[]>(loadRecents)
  const [showRecents, setShowRecents] = useState(false)
  const [auth, setAuth] = useState<Auth | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(loadTheme)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* theme still works for this visit */ }
  }, [theme])

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.ok ? r.json() as Promise<Auth> : null).then(setAuth).catch(() => setAuth({ loggedIn: false }))
  }, [location.pathname])

  useEffect(() => {
    const match = location.pathname.match(/^\/player\/(\d+)$/)
    if (!match) return
    const id = Number(match[1])
    const add = (name: string) => setRecents((old) => {
      const next = [{ id, name }, ...old.filter((item) => item.id !== id)].slice(0, 5)
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
      return next
    })
    add(`#${id}`)
    fetchProfile(id).then((profile) => add(profile.name || `#${id}`)).catch(() => {})
  }, [location.pathname])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const digits = value.match(/\d{5,}/g)?.at(-1)
    if (!digits) { navigate('/'); return }
    let id = digits
    if (digits.length >= 17) {
      try { id = (BigInt(digits) - 76561197960265728n).toString() } catch { return }
    }
    onSearch(id)
    setValue('')
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setAuth({ loggedIn: false })
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/') }}>
          <svg className="brand-mark" viewBox="0 0 34 34" aria-hidden="true">
            <path d="M17 2 32 17 17 32 2 17 17 2Z" />
            <path d="M17 8v18M8 17h18" />
          </svg>
          <span className="brand-wordmark"><strong>match</strong><b>lab</b></span>
        </a>
        <button className="home-link" type="button" onClick={() => navigate('/')}>Обзор</button>
        <button
          className="theme-toggle"
          type="button"
          aria-label={`Включить ${theme === 'dark' ? 'светлую' : 'тёмную'} тему`}
          aria-pressed={theme === 'dark'}
          title={`Включить ${theme === 'dark' ? 'светлую' : 'тёмную'} тему`}
          onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.5"/><path d="M10 1.5v2M10 16.5v2M1.5 10h2m13 0h2M4 4l1.4 1.4m9.2 9.2L16 16m0-12-1.4 1.4m-9.2 9.2L4 16"/></svg>
          ) : (
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.6 12.4A7 7 0 0 1 7.6 3.4 7 7 0 1 0 16.6 12.4Z"/></svg>
          )}
          <span>{theme === 'dark' ? 'Светлая' : 'Тёмная'}</span>
        </button>
        <form className="search" onSubmit={submit}>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setShowRecents(true)}
            onBlur={() => window.setTimeout(() => setShowRecents(false), 120)}
            placeholder="Steam ID или ссылка на профиль"
            aria-label="Поиск игрока"
            list="recent-player-searches"
          />
          <datalist id="recent-player-searches">
            {recents.map((item) => <option key={item.id} value={String(item.id)} label={item.name} />)}
          </datalist>
          <button type="submit" aria-label="Найти профиль">
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
            <span>Найти</span>
          </button>
          {showRecents && recents.length > 0 && (
            <div className="recent-searches" role="listbox" aria-label="Недавно просмотренные профили">
              <div className="recent-searches-title">Недавно просмотренные</div>
              {recents.map((item) => (
                <button key={item.id} type="button" role="option" onMouseDown={(e) => e.preventDefault()} onClick={() => { onSearch(String(item.id)); setValue(''); setShowRecents(false) }}>
                  <span>{item.name}</span><small>{item.id}</small>
                </button>
              ))}
            </div>
          )}
        </form>
        <div className="topbar-auth">
          {auth?.loggedIn ? (
            <>
              <button className="auth-account" onClick={() => auth.steamAccountId && navigate(`/player/${auth.steamAccountId}`)} title="Открыть мой профиль">
                <img src={avatarImageUrl(auth.avatar)} alt="" />
                <span>{auth.name}</span>
              </button>
              <button type="button" className="auth-button" onClick={logout}>
                <span>Выйти</span>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3H4v14h4m3-3 4-4-4-4m4 4H8" /></svg>
              </button>
            </>
          ) : <a className="auth-button" href="/api/auth/steam">
            <span>Войти через Steam</span>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3a7 7 0 1 0 7 7M10 3v7l5 3" /></svg>
          </a>}
        </div>
      </div>
    </header>
  )
}
