import type { Peer } from '../api/types'
import { avatarImageUrl } from '../api/heroes'
import { Link } from 'react-router-dom'
import { fmtWinrate, winrate } from '../api/formats'

export default function PeersList({ peers }: { peers: Peer[] }) {
  if (peers.length === 0) {
    return <div className="notice">Среди друзей Steam нет игроков из загруженных матчей.</div>
  }
  return (
    <div className="peers-grid">
      {peers.map((p) => {
        const losses = p.withMatchCount - p.withWinCount
        const wr = winrate(p.withWinCount, p.withMatchCount)
        return (
          <Link key={p.steamAccountId} className="peer-card" to={`/player/${p.steamAccountId}`}>
            <img className="peer-avatar" src={avatarImageUrl(p.avatar)} alt="" loading="lazy" />
            <div style={{ minWidth: 0 }}>
              <div className="peer-name">{p.name}</div>
              <div className="peer-record">
                <span>вместе <b>{p.withMatchCount}</b> · {fmtWinrate(p.withWinCount, p.withMatchCount)}</span>
                {p.againstMatchCount > 0 && (
                  <span>против <b>{p.againstMatchCount}</b> · {fmtWinrate(p.againstWinCount, p.againstMatchCount)}</span>
                )}
              </div>
              <div className="peer-split" role="img" aria-label={`Винрейт с этим игроком ${wr.toFixed(1)}%, ${p.withWinCount} побед и ${losses} поражений`}>
                <i style={{ width: `${wr}%` }} />
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
