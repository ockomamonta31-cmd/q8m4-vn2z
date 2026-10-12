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
      <div className="ph-identity">
        <div className="ph-avatar-frame"><img className="ph-avatar" src={avatarImageUrl(profile.avatar)} alt={profile.name} /></div>
        <div className="ph-main">
          <div className="ph-kicker">Профиль игрока</div>
          <h1 className="ph-name">{profile.name}</h1>
          <div className="ph-sub">
            <a href={steamProfileUrl(profile.steamAccountId)} target="_blank" rel="noreferrer" aria-label={`Открыть Steam-профиль ${profile.steamAccountId}`}>
              {profile.steamAccountId}
            </a>
            {lastMatchTime ? <span>Последний матч {timeAgo(lastMatchTime)}</span> : null}
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
        {winCount != null && losses != null && matchCount ? (
          <>
            <div className="ph-record-head"><span>Общий результат</span><strong>{wr!.toFixed(1)}%</strong></div>
            <div className="big"><span className="w">{winCount.toLocaleString('ru-RU')}</span><span className="sep">—</span><span className="l">{losses.toLocaleString('ru-RU')}</span></div>
            <div className="winrate-bar" role="img" aria-label={`Винрейт ${winrate(winCount, matchCount).toFixed(1)}%`}><div className="fill-win" style={{ width: `${winrate(winCount, matchCount)}%` }} /></div>
            <div className="wr-label">побед <span>—</span> поражений</div>
          </>
        ) : (
          <>
            <div className="ph-record-head"><span>Данные профиля</span>{matchCount != null && <strong>{matchCount.toLocaleString('ru-RU')}</strong>}</div>
            <p className="wr-label">Победы за всю историю Steam не отдаёт. Статистика разбора строится по доступным матчам.</p>
          </>
        )}
      </div>
    </section>
  )
}
