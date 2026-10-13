import type { Profile } from '../api/types'
import { avatarImageUrl } from '../api/heroes'
import { fmtWinrate, steamProfileUrl, timeAgo, winrate } from '../api/formats'

/** Идентичность профиля. Главный показатель экрана — не здесь: окно Valve
 *  отдаёт победы не для каждого аккаунта, поэтому винрейт по загруженным
 *  матчам живёт в сводке ниже и подписан своим окном. */
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
    <section className="player-id">
      <div className={`pi-frame${profile.rankIsCore === true ? ' rank-1' : ''}`}>
        <img className="pi-avatar" src={avatarImageUrl(profile.avatar)} alt={profile.name} />
      </div>

      <div className="pi-main">
        <h1 className="pi-name">{profile.name}</h1>

        <div className="pi-facts">
          <a href={steamProfileUrl(profile.steamAccountId)} target="_blank" rel="noreferrer">
            Steam ID {profile.steamAccountId}
          </a>
          {lastMatchTime ? <span>последний матч {timeAgo(lastMatchTime)}</span> : null}
        </div>

        <div className="pi-chips">
          {profile.rank != null && (
            <span className="chip">
              Ранг <strong>{profile.rank}</strong>
              {profile.rankIsCore === true && <em className="chip-role">основная позиция</em>}
              {profile.rankIsCore === false && <em className="chip-role">позиция поддержки</em>}
            </span>
          )}
          {matchCount != null && (
            <span className="chip" title="Valve отдаёт окно последних 500 публичных матчей, не всю историю аккаунта">
              Матчей <strong>{matchCount.toLocaleString('ru-RU')}</strong>
            </span>
          )}
        </div>
      </div>

      {winCount != null && losses != null && matchCount && wr != null ? (
        <div className="pi-window">
          <span className="pw-label">Результат по аккаунту</span>
          <div className="pw-nums">
            <span className="r">{winCount.toLocaleString('ru-RU')}</span>
            <i>—</i>
            <span className="d">{losses.toLocaleString('ru-RU')}</span>
          </div>
          <div className="split-bar sm" role="img" aria-label={`Побед ${fmtWinrate(winCount, matchCount)}`}>
            <i className="f-win" style={{ width: `${wr}%` }} />
            <i className="f-loss" style={{ width: `${100 - wr}%` }} />
          </div>
          <span className="pw-note">{fmtWinrate(winCount, matchCount)} побед за {matchCount.toLocaleString('ru-RU')} матчей</span>
        </div>
      ) : (
        <p className="pi-quiet">
          Steam не отдаёт победы за всю историю аккаунта — винрейт считаем по доступным матчам.
        </p>
      )}
    </section>
  )
}
