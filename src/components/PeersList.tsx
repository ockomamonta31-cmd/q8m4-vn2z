import type { Peer } from '../api/types'
import { avatarImageUrl } from '../api/heroes'
import { Link } from 'react-router-dom'
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
    <div className="peer-list">
      {peers.map((p) => {
        const losses = p.withMatchCount - p.withWinCount
        const wr = winrate(p.withWinCount, p.withMatchCount)
        return (
          <Link key={p.steamAccountId} className="peer-row" to={`/player/${p.steamAccountId}`}>
            <img className="peer-avatar" src={avatarImageUrl(p.avatar)} alt="" loading="lazy" />
            <div className="peer-main">
              <div className="peer-name" title={p.name}>{p.name}</div>
              <div className="peer-stats">
                <span>вместе <b>{p.withMatchCount}</b></span>
                {p.againstMatchCount > 0 && <span>против <b>{p.againstMatchCount}</b></span>}
                {p.againstMatchCount > 0 && <span>против них <b>{fmtWinrate(p.againstWinCount, p.againstMatchCount)}</b></span>}
              </div>
            </div>
            <div className="peer-side">
              <b>{fmtWinrate(p.withWinCount, p.withMatchCount)}</b>
              <span
                className="peer-split"
                role="img"
                aria-label={`С этим игроком: ${p.withWinCount} побед и ${losses} поражений, винрейт ${wr.toFixed(1)}%`}
              >
                <i style={{ width: `${wr}%` }} />
              </span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
