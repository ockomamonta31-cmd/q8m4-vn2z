import type { Profile } from '../api/types'
import { avatarImageUrl } from '../api/heroes'
import { steamProfileUrl, timeAgo, winrate } from '../api/formats'

export default function PlayerHeader({
  profile,
  lastMatchTime,
}: {
  profile: Profile
  lastMatchTime: number | null
}) {
  const { matchCount, winCount } = profile
  const losses = matchCount != null && winCount != null ? matchCount - winCount : null
  const wr = matchCount && winCount != null ? winrate(winCount, matchCount) : null

  return (
    <section className="player-header">
      <img className="ph-avatar" src={avatarImageUrl(profile.avatar)} alt={profile.name} />
      <div className="ph-main">
        <h1 className="ph-name">{profile.name}</h1>
        <div className="ph-sub">
          Steam ID <a href={steamProfileUrl(profile.steamAccountId)} target="_blank" rel="noreferrer">
            {profile.steamAccountId}
          </a>
          {lastMatchTime ? <> · последний матч {timeAgo(lastMatchTime)}</> : null}
        </div>
        <div className="ph-chips">
          {profile.rank != null && (
            <span className="chip chip-rank">
              Ранг <strong>{profile.rank}</strong>
              {profile.rankIsCore === true ? ' · core' : profile.rankIsCore === false ? ' · support' : ''}
            </span>
          )}
          {matchCount != null && (
            <span className="chip" title="Valve отдаёт только окно последних 500 публичных матчей, а не всю историю аккаунта">
              Матчей <strong>{matchCount.toLocaleString('ru-RU')}</strong>
            </span>
          )}
          {wr != null && (
            <span className="chip">
              Винрейт <strong>{wr.toFixed(1)}%</strong>
            </span>
          )}
        </div>
      </div>
      {winCount != null && losses != null && matchCount ? (
        <div className="ph-record">
          <div className="big">
            <span className="w">{winCount.toLocaleString('ru-RU')}</span>
            <span className="sep">—</span>
            <span className="l">{losses.toLocaleString('ru-RU')}</span>
          </div>
          <div className="winrate-bar" role="img" aria-label={`Винрейт ${winrate(winCount, matchCount).toFixed(1)}%`}>
            <div className="fill-win" style={{ width: `${winrate(winCount, matchCount)}%` }} />
          </div>
          <div className="wr-label">побед — поражений за всю историю</div>
        </div>
      ) : (
        <div className="ph-record">
          <div className="wr-label">
            Steam отдаёт только окно последних матчей и не считает победы за всю историю — вся
            статистика ниже построена на загруженных матчах.
          </div>
        </div>
      )}
    </section>
  )
}
