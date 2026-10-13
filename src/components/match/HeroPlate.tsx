// Шапка матча: id, режим, дата, ссылки наружу, итог и сравнение команд.
// Полноэкранный hero с артом и «Противостоянием» собирается в M3.

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

function Pair({ label, radiant, dire, format }: { label: string; radiant: number; dire: number; format: (n: number) => string }) {
  const total = radiant + dire
  const r = total > 0 ? (radiant / total) * 100 : 50
  return (
    <div className="vs-row">
      <span className="vs-lbl">{label}</span>
      <span className={`v r${r >= 50 ? '' : ' sub'}`}>{format(radiant)}</span>
      <span className="vs-bar" role="img" aria-label={`${label}: Radiant ${format(radiant)}, Dire ${format(dire)}`}>
        <i className="a" style={{ width: `${r}%` }} />
        <i className="b" style={{ width: `${100 - r}%` }} />
      </span>
      <span className={`v d${r < 50 ? '' : ' sub'}`}>{format(dire)}</span>
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
      <div className="mfact" key={label} title={`${label}: целых — у Radiant ${r} из ${max}, у Dire ${d} из ${max}`}>
        <dt>{label}</dt>
        <dd><span className="pos">{r}</span> из {max} · <span className="neg">{d}</span></dd>
      </div>
    )
  return <>{pair('башни', towers[0], towers[1], 11)}{pair('казармы', rax[0], rax[1], 6)}</>
}

/** Состав лагеря: пять портретов строго по позициям 1→5. */
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
    <ol className="mfive-l">
      {ordered.map((p) => {
        const hero = heroMap.get(p.heroId)
        return (
          <li key={`${p.steamAccountId}:${p.heroId}`}>
            <span className={`port xs ${radiant ? 'r' : 'd'}`}>
              {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
            </span>
            <PositionIcon position={p.position} source={p.positionSource} size={24} />
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
    <header className="mhero">
      <div className="mhero-in">
        <div className="mhero-top">
          <span className="sp">
            <Link to="/" onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); window.history.back() } }}>
              Назад
            </Link>
          </span>
          <span className="dotsep" aria-hidden="true" />
          <span className="sp"><b>Матч {match.id}</b></span>
          <span className="dotsep" aria-hidden="true" />
          <span className="sp">{gameModeName(match.gameMode)}</span>
          <span className="dotsep" aria-hidden="true" />
          <span className="sp">{lobbyName(match.lobbyType)}</span>
          <span className="dotsep" aria-hidden="true" />
          <span className="sp">{new Date(match.startDateTime * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
          <span className="dotsep" aria-hidden="true" />
          <span className="sp">{match.numHumanPlayers ?? match.players.length} игроков</span>

          <div className="mhero-acts">
            <CopyButton text={String(match.id)} label={`Скопировать ID матча ${match.id}`} />
            {links.map((link) => (
              <a key={link.label} className="ext" href={link.href} target="_blank" rel="noreferrer">
                {link.label}
                <Icon.External size={14} />
              </a>
            ))}
          </div>
        </div>

        <div className="mhero-grid">
          <div>
            <div className="mhero-art">
              {leadHero && <img src={heroImageUrl(leadHero.shortName)} alt="" aria-hidden="true" />}
            </div>
            <p className="mhero-cap">
              <b>{leadHero ? playerLabel(lead!.player, leadHero.name) : null}</b>
              {lead && <span className="dim">лучший вклад {signed(lead.score.value)}</span>}
            </p>
          </div>

          <div>
            <h1 className="mhero-h1">{radiantWon ? 'Radiant' : 'Dire'} {match.durationSeconds < 600 ? 'разгромил' : 'победил'}</h1>

            <div className="mhero-score">
              <span className="r">{match.radiantScore ?? '—'}</span>
              <span className="dim">:</span>
              <span className="d">{match.direScore ?? '—'}</span>
              <span className="dim t14">убийств</span>
            </div>

            <dl className="mfacts">
              <div className="mfact">
                <dt>Длительность</dt>
                <dd className="n">{fmtDuration(match.durationSeconds)}</dd>
              </div>
              <div className="mfact">
                <dt>Первая кровь</dt>
                <dd className="n">{match.firstBloodSeconds && match.firstBloodSeconds > 0 ? `на ${fmtDuration(match.firstBloodSeconds)}` : 'не было'}</dd>
              </div>
              <div className="mfact">
                <dt>Рошан</dt>
                <dd className="n">
                  {timeline?.roshans.length
                    ? `${timeline.roshans.filter((x) => x.radiant).length} : ${timeline.roshans.length - timeline.roshans.filter((x) => x.radiant).length}`
                    : 'нет данных реплея'}
                </dd>
              </div>
              <Structures match={match} />
            </dl>

            <div className="mhero-fives">
              <div className="mfive">
                <span className="dim">Radiant</span>
                <Five players={match.players} radiant heroMap={heroMap} />
              </div>
              <div className="mfive">
                <span className="dim">Dire</span>
                <Five players={match.players} radiant={false} heroMap={heroMap} />
              </div>
            </div>
          </div>
        </div>

        <div className="vs">
          <Pair label="Убийства" radiant={board.radiant.kills} dire={board.dire.kills} format={(n) => String(n)} />
          <Pair label="Нетворс" radiant={board.radiant.networth} dire={board.dire.networth} format={fmtK} />
          <Pair label="Урон героям" radiant={board.radiant.heroDamage} dire={board.dire.heroDamage} format={fmtK} />
          <Pair label="Опыт в минуту" radiant={board.radiant.experience} dire={board.dire.experience} format={(n) => String(Math.round(n))} />
        </div>
      </div>
    </header>
  )
}
