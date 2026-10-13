// Общий хук оценки драфта: профиль героев собирается из нашей базы матчей,
// дальше считают evaluateDraft(). Нужен и блоку линий, и общей оценке.

import { useEffect, useState } from 'react'
import type { MatchPlayer } from '../../api/types'
import { getProfile } from '../../api/heroProfile'
import { evaluateDraft, type DraftRating } from '../../api/draftStrength'

export function useDraftRating(players: MatchPlayer[]): { rating: DraftRating | null; failed: boolean; ready: boolean } {
  const [state, setState] = useState<{ rating: DraftRating | null; failed: boolean; ready: boolean }>({ rating: null, failed: false, ready: false })

  useEffect(() => {
    let alive = true
    getProfile()
      .then((profile) => {
        if (!alive) return
        setState(profile ? { rating: evaluateDraft(profile, players), failed: false, ready: true } : { rating: null, failed: true, ready: true })
      })
      .catch(() => alive && setState({ rating: null, failed: true, ready: true }))
    return () => {
      alive = false
    }
  }, [players])

  return state
}
