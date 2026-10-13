// Общий хук оценки драфта: профиль героев собирается из нашей базы матчей,
// дальше считают evaluateDraft(). Нужен и блоку линий, и общей оценке.

import { useEffect, useState } from 'react'
import type { MatchDetails, MatchPlayer } from '../../api/types'
import { getProfile } from '../../api/heroProfile'
import { evaluateDraft, type DraftRating } from '../../api/draftStrength'

export function useDraftRating(players: MatchPlayer[], match: MatchDetails | null, heroName: (id: number) => string): { rating: DraftRating | null; failed: boolean; ready: boolean } {
  const [state, setState] = useState<{ rating: DraftRating | null; failed: boolean; ready: boolean }>({ rating: null, failed: false, ready: false })

  useEffect(() => {
    let alive = true
    getProfile()
      .then((profile) => {
        if (!alive) return
        if (!profile) { setState({ rating: null, failed: true, ready: true }); return }
        const info = match ? { durationSeconds: match.durationSeconds, didRadiantWin: match.didRadiantWin } : undefined
        setState({ rating: evaluateDraft(profile, players, info, heroName), failed: false, ready: true })
      })
      .catch(() => alive && setState({ rating: null, failed: true, ready: true }))
    return () => {
      alive = false
    }
  }, [players, match, heroName])

  return state
}
