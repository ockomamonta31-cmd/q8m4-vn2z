import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Прокручивает страницу наверх при переходе между игроком/матчем. */
export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}
