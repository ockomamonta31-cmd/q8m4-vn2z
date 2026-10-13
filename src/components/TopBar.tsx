// Хедер: щит с буквой L, навигация, единый поиск матча/профиля по центру, аккаунт справа.

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchProfile } from '../api'
import { avatarImageUrl } from '../api/heroes'
import { parseQuery } from '../api/formats'
import { addRecentSearch, readRecentSearches, type RecentSearch } from '../recents'
import type { Auth } from '../auth'
import { Icon } from './Icons'

function Brand() {
  return (
    <svg viewBox="0 0 24 28" aria-hidden="true" focusable="false">
      <path
        d="M12 1.5 22 5.4v9.1c0 5.6-4 9.6-10 12.1C6 24.1 2 20.1 2 14.5V5.4z"
        fill="none"
        stroke="var(--line)"
        strokeWidth="1.5"
      />
      <path
        d="M8.4 7.6v9.6h6.6"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="2.2"
        strokeLinecap="square"
      />
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
  const navigate = useNavigate()
  const location = useLocation()

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

  const myPath = auth?.loggedIn && auth.steamAccountId ? `/player/${auth.steamAccountId}` : null

  return (
    <header className="hdr">
      <div className="hdr-in">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/') }}>
          <Brand />
          <span className="brand-t">Dota Match Lab</span>
        </a>

        <nav className="nav">
          <button type="button" className={`nav-i${location.pathname === '/' ? ' on' : ''}`} onClick={() => navigate('/')}>
            Обзор
          </button>
          {myPath && (
            <button type="button" className={`nav-i${location.pathname === myPath ? ' on' : ''}`} onClick={() => onSearch(myPath)}>
              Мой профиль
            </button>
          )}
        </nav>

        <form className="find" onSubmit={submit} role="search">
          <input
            className="find-in"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            placeholder="ID матча или игрока"
            aria-label="Поиск матча или игрока"
            autoComplete="off"
            spellCheck={false}
          />
          <Icon.Search className="find-g" size={18} />
          {open && recents.length > 0 && (
            <div className="find-list" role="listbox" aria-label="Недавние поиски">
              <div className="find-h">Недавние поиски</div>
              {recents.map((item) => (
                <button
                  key={`${item.kind}:${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="find-r"
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

        <div className="acct">
          {auth?.loggedIn ? (
            <>
              <button className="acct-me" onClick={() => myPath && onSearch(myPath)} aria-label="Открыть свой профиль">
                <img src={avatarImageUrl(auth.avatar)} alt="" width={28} height={28} />
                <span>{auth.name}</span>
              </button>
              <button type="button" className="acct-out" onClick={onLogout}>
                <span>Выйти</span>
                <Icon.Logout size={16} />
              </button>
            </>
          ) : (
            <a className="btn btn-q" href="/api/auth/steam">
              <Icon.Steam size={16} />
              Войти через Steam
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
