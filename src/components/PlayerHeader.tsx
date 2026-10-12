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
      <div className="ph-top">
        <div className={`ph-frame${profile.rankIsCore === true ? ' rank-1' : ''}`}>
          <img className="ph-avatar" src={avatarImageUrl(profile.avatar)} alt={profile.name} />
        </div>
        <div className="ph-id">
          <div className="ph-kicker">Профиль игрока</div>
          <h1 className="ph-name">{profile.name}</h1>
          <div className="ph-meta">
            <a href={steamProfileUrl(profile.steamAccountId)} target="_blank" rel="noreferrer">
              Steam ID {profile.steamAccountId}
            </a>
            {lastMatchTime ? <span>последний матч {timeAgo(lastMatchTime)}</span> : null}
          </div>
          <div className="ph-chips">
            {profile.rank != null && (
              <span className="chip chip-rank">Ранг <strong>{profile.rank}</strong>{profile.rankIsCore === true ? ' · core' : profile.rankIsCore === false ? ' · support' : ''}</span>
            )}
            {matchCount != null && (
              <span className="chip" title="Valve отдаёт окно последних 500 публичных матчей, не всю историю аккаунта">
                Матчей <strong>{matchCount.toLocaleString('ru-RU')}</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="ph-record">
        {winCount != null && losses != null && matchCount && wr != null ? (
          <>
            <div className="record-head"><span>Общий результат</span><strong>{wr!.toFixed(1)}%</strong></div>
            <div className="record-nums">
              <span className="w">{winCount.toLocaleString('ru-RU')}</span>
              <span className="sep">—</span>
              <span className="l">{losses.toLocaleString('ru-RU')}</span>
            </div>
            <div className="split-bar" role="img" aria-label={`Винрейт ${wr!.toFixed(1)}%`}>
              <i className="f-win" style={{ width: `${wr}%` }} />
              <i className="f-loss" style={{ width: `${100 - wr}%` }} />
            </div>
            <div className="record-foot"><span>победы</span><span>поражения</span></div>
          </>
        ) : (
          <>
            <div className="record-head"><span>Данные профиля</span>{matchCount != null && <strong>{matchCount.toLocaleString('ru-RU')}</strong>}</div>
            <p className="cell-sub">Steam не отдаёт победы за всю историю. Сводку считает по доступным матчам.</p>
          </>
        )}
      </div>
    </section>
  )
}
