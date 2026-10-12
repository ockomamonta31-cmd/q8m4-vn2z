import type { Peer } from '../api/types'
import { avatarImageUrl } from '../api/heroes'
import { fmtWinrate, steamProfileUrl } from '../api/formats'

export default function PeersList({ peers }: { peers: Peer[] }) {
  if (peers.length === 0) {
    return <div className="inline-note">Игроки, с которыми пересекался, не найдены.</div>
  }
  return (
    <div className="peers-grid">
      {peers.map((p) => (
        <a
          key={p.steamAccountId}
          className="peer-card"
          href={steamProfileUrl(p.steamAccountId)}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          <img className="peer-avatar" src={avatarImageUrl(p.avatar)} alt={p.name} loading="lazy" />
          <div>
            <div className="peer-name">{p.name}</div>
            <div className="peer-records">
              вместе {p.withWinCount}–{p.withMatchCount - p.withWinCount} ({fmtWinrate(p.withWinCount, p.withMatchCount)}) ·
              против {p.againstWinCount}–{p.againstMatchCount - p.againstWinCount} (
              {fmtWinrate(p.againstWinCount, p.againstMatchCount)})
            </div>
          </div>
        </a>
      ))}
    </div>
  )
}
