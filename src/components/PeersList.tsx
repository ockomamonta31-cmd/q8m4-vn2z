import { Link } from 'react-router-dom'
import type { Peer } from '../api/types'
import { avatarImageUrl } from '../api/heroes'
import { fmtWinrate, winrate } from '../api/formats'
import { EmptyState } from './States'

export default function PeersList({ peers }: { peers: Peer[] }) {
  if (peers.length === 0) {
    return (
      <EmptyState title="Общих друзей не нашлось">
        Список строится по загруженным матчам: если друзья в них не пересекались, показывать нечего.
        Догрузи историю на вкладке «Матчи» — список дополнится.
      </EmptyState>
    )
  }
  return (
    <div className="plist">
      {peers.map((p) => {
        const wr = winrate(p.withWinCount, p.withMatchCount)
        return (
          <Link key={p.steamAccountId} className="prow" to={`/player/${p.steamAccountId}`}>
            <img src={avatarImageUrl(p.avatar)} alt="" loading="lazy" width={40} height={40} />
            <span title={p.name}>{p.name}</span>
            <span className="dim t14">
              вместе {p.withMatchCount}
              {p.againstMatchCount > 0 ? ` · против ${p.againstMatchCount}` : ''}
            </span>
            <span className={wr >= 50 ? 'pos' : 'neg'}>{fmtWinrate(p.withWinCount, p.withMatchCount)}</span>
          </Link>
        )
      })}
    </div>
  )
}
