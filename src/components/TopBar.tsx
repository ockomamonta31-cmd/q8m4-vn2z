// Хедер: логотип, навигация, единый поиск матча/профиля, тема и аккаунт.

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchProfile } from '../api'
import { avatarImageUrl } from '../api/heroes'
import { parseQuery } from '../api/formats'
import { addRecentSearch, readRecentSearches, readTheme, writeTheme, type RecentSearch } from '../recents'
import type { Auth } from '../auth'
import { Icon } from './Icons'

function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
      <path className="m-r" d="M12.6 2 1.6 14l11 12z" />
      <path className="m-d" d="M15.4 2l11 12-11 12z" />
    </svg>
  )
}

export default function TopBar({
  auth,
  onSearch,
  onLogout,
}: {
  auth: Auth | null
  onSearch: (path: string) => void
  onLogout: () => void
}) {
  const [value, setValue] = useState('')
  const [recents, setRecents] = useState<RecentSearch[]>(readRecentSearches)
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(readTheme)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    writeTheme(theme)
  }, [theme])

  useEffect(() => setRecents(readRecentSearches()), [location.pathname])

  // Профиль попадает в журнал сразу, матч — только после того как подтвердится,
  // что он существует (иначе в истории будут случайные цифры).
  useEffect(() => {
    const profile = location.pathname.match(/^\/player\/(\d+)$/)
    if (!profile) return
    const id = Number(profile[1])
    setRecents(addRecentSearch(id, `#${id}`, 'player'))
    fetchProfile(id)
      .then((result) => setRecents(addRecentSearch(id, result.name || `#${id}`, 'player')))
      .catch(() => {})
  }, [location.pathname])

  useEffect(() => {
    const match = location.pathname.match(/^\/match\/(\d+)$/)
    if (match) setRecents(addRecentSearch(Number(match[1]), `Матч ${match[1]}`, 'match'))
  }, [location.pathname])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseQuery(value)
    if (!parsed) return
    onSearch(parsed.kind === 'match' ? `/match/${parsed.id}` : `/player/${parsed.id}`)
    setValue('')
    setOpen(false)
  }

  const go = (item: RecentSearch) => {
    onSearch(item.kind === 'match' ? `/match/${item.id}` : `/player/${item.id}`)
    setValue('')
    setOpen(false)
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/') }}>
          <Logo />
          <span className="brand-word">dota match<b>lab</b></span>
        </a>

        <nav className="nav">
          <button type="button" className={`nav-link${location.pathname === '/' ? ' active' : ''}`} onClick={() => navigate('/')}>
            Обзор
          </button>
          {auth?.loggedIn && auth.steamAccountId ? (
            <button
              type="button"
              className={`nav-link${location.pathname === `/player/${auth.steamAccountId}` ? ' active' : ''}`}
              onClick={() => onSearch(`/player/${auth.steamAccountId}`)}
            >
              Мой профиль
            </button>
          ) : null}
        </nav>

        <form className="search" onSubmit={submit} role="search">
          <Icon.Search size={16} className="search-glass" />
          <input
            className="search-field"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            placeholder="ID матча или игрока"
            aria-label="Поиск матча или игрока"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="search-hint">Enter</span>
          {open && recents.length > 0 && (
            <div className="recents" role="listbox" aria-label="Недавние поиски">
              <div className="recents-title">Недавние поиски</div>
              {recents.map((item) => (
                <button
                  key={`${item.kind}:${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="recent-row"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(item)}
                >
                  <span>{item.name}</span>
                  <small>{item.kind === 'match' ? 'матч' : 'профиль'}</small>
                </button>
              ))}
            </div>
          )}
        </form>

        <div className="topbar-auth">
          <button
            type="button"
            className="icon-btn"
            aria-label={`Включить ${theme === 'dark' ? 'светлую' : 'тёмную'} тему`}
            title={`Включить ${theme === 'dark' ? 'светлую' : 'тёмную'} тему`}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Icon.Sun size={17} /> : <Icon.Moon size={17} />}
          </button>
          {auth?.loggedIn ? (
            <>
              <button className="auth-account" onClick={() => auth.steamAccountId && onSearch(`/player/${auth.steamAccountId}`)} aria-label="Открыть свой профиль">
                <img src={avatarImageUrl(auth.avatar)} alt="" width={22} height={22} />
                <span>{auth.name}</span>
              </button>
              <button type="button" className="auth-button" onClick={onLogout}>
                <span>Выйти</span>
                <Icon.Logout size={15} />
              </button>
            </>
          ) : (
            <a className="auth-button" href="/api/auth/steam">
              <span>Войти через Steam</span>
              <Icon.External size={15} />
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
