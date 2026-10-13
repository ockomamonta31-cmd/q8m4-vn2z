// Табло матча — единственное смелое место на странице.
//
// Исходный арт героя на CDN Valve — 256×144. Раздувать его до размеров
// половины экрана нельзя: мыло вместо арта. Поэтому герой живёт здесь как
// затемнённое поле-подложка под скрима, а смелость держит типографика
// результата: итог матча — самый крупный текст на странице, и он окрашен
// лагерем ЦЕЛИКОМ, а не одним выделенным словом. Счёт и длительность ему
// подчинены и стоят ниже собственными подписями, а не строкой через точку.

import { Link } from 'react-router-dom'
import type { HeroInfo, MatchDetails, MatchPlayer } from '../../api/types'
import type { MatchBoard } from '../../pages/match-model'
import { fmtK, playerLabel } from '../../pages/match-model'
import type { MatchTimeline } from '../../api/timeline'
import { fmtDuration, gameModeName, lobbyName } from '../../api/formats'
import { heroImageUrl } from '../../api/heroes'
import { signed } from '../../api/score'
import { CopyButton } from '../primitives'
import { Icon } from '../Icons'
import PositionIcon from '../PositionIcon'

function Ribbon({ label, radiant, dire, format }: { label: string; radiant: number; dire: number; format: (n: number) => string }) {
  const total = radiant + dire
  const r = total > 0 ? (radiant / total) * 100 : 50
  return (
    <div className="ribbon-row">
      <span className="ribbon-name">{label}</span>
      <span className={`ribbon-val r${r >= 50 ? ' lead' : ''}`}>{format(radiant)}</span>
      <span className="ribbon-track" role="img" aria-label={`${label}: Radiant ${format(radiant)}, Dire ${format(dire)}`}>
        <i className="f-r" style={{ width: `${r}%` }} />
        <i className="f-d" style={{ width: `${100 - r}%` }} />
      </span>
      <span className={`ribbon-val d${r < 50 ? ' lead' : ''}`}>{format(dire)}</span>
    </div>
  )
}

/** Итог по строениям: сколько у каждой стороны осталось целым. */
function Structures({ match }: { match: MatchDetails }) {
  const count = (value: number | null, bits: number) => {
    if (value == null) return null
    let n = 0
    for (let i = 0; i < bits; i++) if ((value >> i) & 1) n++
    return n
  }
  const towers = [count(match.towerStatusRadiant, 11), count(match.towerStatusDire, 11)]
  const rax = [count(match.barracksStatusRadiant, 6), count(match.barracksStatusDire, 6)]
  if (towers[0] === null && rax[0] === null) return null
  const pair = (label: string, r: number | null, d: number | null, max: number) =>
    r === null || d === null ? null : (
      <span key={label} className="struct-cell" title={`${label}: целых — у Radiant ${r} из ${max}, у Dire ${d} из ${max}`}>
        <span className="struct-label">{label}</span>
        <span className="struct-fig"><b className="r">{r}</b> из {max}<i className="vs">против</i><b className="d">{d}</b></span>
      </span>
    )
  return <div className="axis-structures">{pair('башни', towers[0], towers[1], 11)}{pair('казармы', rax[0], rax[1], 6)}</div>
}

/**
 * Состав лагеря читается за секунду: пять портретов строго по позициям 1→5,
 * каждый со своим глифом. Порядок фиксирован именно здесь, а не в модели,
 * потому что slotOfPlayer() считает слот по индексу массива.
 */
function Five({ players, radiant, heroMap }: { players: MatchPlayer[]; radiant: boolean; heroMap: Map<number, HeroInfo> }) {
  const ordered = [...players]
    .filter((p) => p.isRadiant === radiant)
    .sort((a, b) => {
      const pa = a.positionSource && a.position >= 1 && a.position <= 5 ? a.position : 6
      const pb = b.positionSource && b.position >= 1 && b.position <= 5 ? b.position : 6
      return pa - pb || b.networth - a.networth
    })
    .slice(0, 5)

  return (
    <ol className="five">
      {ordered.map((p) => {
        const hero = heroMap.get(p.heroId)
        return (
          <li key={`${p.steamAccountId}:${p.heroId}`} className="five-slot">
            <img src={heroImageUrl(hero?.shortName ?? '')} alt="" loading="lazy" width={44} height={25} />
            <PositionIcon position={p.position} source={p.positionSource} size={15} />
          </li>
        )
      })}
    </ol>
  )
}

export default function HeroPlate({ match, board, timeline, heroMap }: {
  match: MatchDetails
  board: MatchBoard
  timeline: MatchTimeline | null
  heroMap: Map<number, HeroInfo>
}) {
  const radiantWon = Boolean(match.didRadiantWin)
  const winning = radiantWon ? board.radiant : board.dire
  const lead = winning.mvp
  const leadHero = lead ? heroMap.get(lead.player.heroId) : undefined

  const links = [
    { href: `https://www.stratz.com/matches/${match.id}`, label: 'STRATZ' },
    { href: 'https://www.dotabuff.com/matches/' + match.id, label: 'Dotabuff' },
    { href: 'https://www.opendota.com/matches/' + match.id, label: 'OpenDota' },
  ]

  return (
    <header className={`hero${radiantWon ? ' hero-r' : ' hero-d'}`}>
      <div className="hero-bar">
        <nav className="crumbs" aria-label="Хлебные крошки">
          <Link to="/" onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); window.history.back() } }}>
            <Icon.ArrowLeft size={14} />
            Назад
          </Link>
          <span className="sep">/</span>
          <b>Матч {match.id}</b>
        </nav>

        <div className="hero-tags">
          <span className="tag tag-strong">{gameModeName(match.gameMode)}</span>
          <span className="tag">{lobbyName(match.lobbyType)}</span>
          <span className="tag">
            {new Date(match.startDateTime * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}
          </span>
          {match.numHumanPlayers != null && <span className="tag">{match.numHumanPlayers} игроков</span>}
          {match.actualRank > 0 && <span className="tag">средний ранг {match.actualRank}</span>}
        </div>

        <div className="hero-actions">
          <CopyButton text={String(match.id)} label={`Скопировать ID матча ${match.id}`} />
          {links.map((link) => (
            <a key={link.label} className="ext-link" href={link.href} target="_blank" rel="noreferrer">
              {link.label}
              <Icon.External size={11} />
            </a>
          ))}
        </div>
      </div>

      <div className="hero-plate">
        <div className="hero-art">
          {leadHero && (
            <img
              className="hero-art-bg"
              src={heroImageUrl(leadHero.shortName)}
              alt=""
              aria-hidden="true"
            />
          )}
          <div className="hero-art-scrim" />
          <p className="hero-art-note">
            <span className="hero-art-name">{leadHero ? playerLabel(lead!.player, leadHero.name) : null}</span>
            {lead && <span className="hero-art-impact">лучший вклад {signed(lead.score.value)}</span>}
          </p>
        </div>

        <div className="hero-result">
          <h1 className="result-outcome">
            {radiantWon ? 'Radiant' : 'Dire'} {match.durationSeconds < 600 ? 'разгромил' : 'победил'}
          </h1>

          <div className="result-score">
            <b className="r">{match.radiantScore ?? '—'}</b>
            <span className="colon">:</span>
            <b className="d">{match.direScore ?? '—'}</b>
            <span className="result-score-note">убийств</span>
          </div>

          <dl className="result-facts">
            <div className="fact">
              <dt>Длительность</dt>
              <dd className="num">{fmtDuration(match.durationSeconds)}</dd>
            </div>
            <div className="fact">
              <dt>Первая кровь</dt>
              <dd className="num">{match.firstBloodSeconds && match.firstBloodSeconds > 0 ? `на ${fmtDuration(match.firstBloodSeconds)}` : 'не было'}</dd>
            </div>
            <div className="fact">
              <dt>Рошан</dt>
              <dd className="num">
                {timeline?.roshans.length
                  ? `${timeline.roshans.filter((x) => x.radiant).length} : ${timeline.roshans.length - timeline.roshans.filter((x) => x.radiant).length}`
                  : 'нет данных реплея'}
              </dd>
            </div>
          </dl>

          <Structures match={match} />

          <div className="hero-fives">
            <div className="five-group five-r">
              <span className="five-name">Radiant</span>
              <Five players={match.players} radiant heroMap={heroMap} />
            </div>
            <div className="five-group five-d">
              <span className="five-name">Dire</span>
              <Five players={match.players} radiant={false} heroMap={heroMap} />
            </div>
          </div>
        </div>
      </div>

      <div className="hero-ribbon">
        <Ribbon label="Убийства" radiant={board.radiant.kills} dire={board.dire.kills} format={(n) => String(n)} />
        <Ribbon label="Нетворт" radiant={board.radiant.networth} dire={board.dire.networth} format={fmtK} />
        <Ribbon label="Урон героям" radiant={board.radiant.heroDamage} dire={board.dire.heroDamage} format={fmtK} />
        <Ribbon label="Опыт в минуту" radiant={board.radiant.experience} dire={board.dire.experience} format={(n) => String(Math.round(n))} />
      </div>
    </header>
  )
}
