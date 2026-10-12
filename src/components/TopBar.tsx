import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchProfile } from '../api'
import { avatarImageUrl } from '../api/heroes'

type Recent = { id: number; name: string }
type Auth = { loggedIn: boolean; steamAccountId?: number; name?: string; avatar?: string | null }
const RECENTS_KEY = 'dota.recentProfiles.v1'

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
  const navigate = useNavigate()
  const location = useLocation()

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
          <span className="brand-mark">DOTA</span>
          <span className="brand-sub">analytics</span>
        </a>
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
          <button type="submit">Найти</button>
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
              <button type="button" className="auth-button" onClick={logout}>Выйти</button>
            </>
          ) : <a className="auth-button" href="/api/auth/steam">Войти через Steam</a>}
        </div>
      </div>
    </header>
  )
}
