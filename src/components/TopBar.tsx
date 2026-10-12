import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/** Верхняя панель: логотип + поиск по steamId или ссылке steamcommunity.com/profiles/... */
export default function TopBar({ onSearch }: { onSearch: (id: string) => void }) {
  const [value, setValue] = useState('')
  const navigate = useNavigate()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const match = value.match(/\d{5,}/g)
    if (!match) {
      navigate('/')
      return
    }
    onSearch(match[match.length - 1])
    setValue('')
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
            placeholder="Steam ID (32-bit) или 17-значный SteamID64"
            aria-label="Поиск игрока"
          />
          <button type="submit">Найти</button>
        </form>
      </div>
    </header>
  )
}
