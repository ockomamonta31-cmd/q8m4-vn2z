// Табло матча: кто победил, со сколькими убийствами, как выглядел перевес.
// Цвет шапки задаёт победитель — отсюда же идёт свечение на весь фон страницы.

import { Link } from 'react-router-dom'
import type { HeroInfo, MatchDetails } from '../../api/types'
import type { MatchBoard } from '../../pages/match-model'
import { fmtK, playerLabel } from '../../pages/match-model'
import type { MatchTimeline } from '../../api/timeline'
import { fmtDuration, gameModeName, lobbyName } from '../../api/formats'
import { heroImageUrl } from '../../api/heroes'
import { signed } from '../../api/score'
import { CopyButton, Counter } from '../primitives'
import { Icon } from '../Icons'

function Ribbon({ label, radiant, dire, format }: { label: string; radiant: number; dire: number; format: (n: number) => string }) {
  const total = radiant + dire
  const r = total > 0 ? (radiant / total) * 100 : 50
  return (
    <div className="ribbon-row">
      <span className="ribbon-name">{label}</span>
      <span className={`ribbon-val r ${r >= 50 ? 'lead' : ''}`}><Counter value={radiant} duration={800} format={(n) => format(Math.round(n))} /></span>
      <span className="ribbon-track" role="img" aria-label={`${label}: Radiant ${format(radiant)}, Dire ${format(dire)}`}>
        <i className="f-r" style={{ width: `${r}%` }} />
        <i className="f-d" style={{ width: `${100 - r}%` }} />
      </span>
      <span className={`ribbon-val d ${r < 50 ? 'lead' : ''}`}><Counter value={dire} duration={800} format={(n) => format(Math.round(n))} /></span>
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
      <span key={label} title={`${label}: целых башен/казарм — Radiant ${r} из ${max}, Dire ${d} из ${max}`}>
        <span className="r">{r}</span> : <span className="d">{d}</span> {label}
      </span>
    )
  return <div className="axis-structures">{pair('башни', towers[0], towers[1], 11)}{pair('казармы', rax[0], rax[1], 6)}</div>
}

function Board({ side, score, won, mvp, heroMap }: {
  side: 'r' | 'd'
  score: number | null
  won: boolean
  mvp: MatchBoard['radiant']['mvp']
  heroMap: Map<number, HeroInfo>
}) {
  const hero = mvp ? heroMap.get(mvp.player.heroId) : undefined
  return (
    <div className={`board board-${side}${won ? '' : ' lost'}`}>
      <span className="board-side">{side === 'r' ? 'Radiant' : 'Dire'}</span>
      <span className="board-score">{score == null ? '—' : <Counter value={score} duration={900} />}</span>
      <span className="board-state">
        {won && <Icon.Crown size={13} className="crown" />}
        {won ? 'Победитель' : 'Проигравшая сторона'}
      </span>
      {mvp && (
        <span className="board-mvp">
          {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" width={34} height={24} />}
          <span>лучший вклад — <b>{playerLabel(mvp.player, hero?.name)}</b> {signed(mvp.score.value)}</span>
        </span>
      )}
    </div>
  )
}

export default function HeroPlate({ match, board, timeline, heroMap }: {
  match: MatchDetails
  board: MatchBoard
  timeline: MatchTimeline | null
  heroMap: Map<number, HeroInfo>
}) {
  const radiantWon = Boolean(match.didRadiantWin)
  const killsPerMin = (match.radiantScore ?? 0) + (match.direScore ?? 0) > 0
    ? ((match.radiantScore ?? 0) + (match.direScore ?? 0)) / board.durationMinutes
    : null

  const links = [
    { href: `https://www.stratz.com/matches/${match.id}`, label: 'STRATZ' },
    { href: `https://www.dotabuff.com/matches/${match.id}`, label: 'Dotabuff' },
    { href: `https://www.opendota.com/matches/${match.id}`, label: 'OpenDota' },
  ]

  return (
    <header
      className="hero"
      style={{ '--hero-r': radiantWon ? '20%' : '7%', '--hero-d': radiantWon ? '7%' : '20%' } as React.CSSProperties}
    >
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
          <CopyButton text={String(match.id)} label={`#${match.id}`} />
          {links.map((link) => (
            <a key={link.label} className="ext-link" href={link.href} target="_blank" rel="noreferrer">
              {link.label}
              <Icon.External size={11} />
            </a>
          ))}
        </div>
      </div>

      <div className="hero-board">
        <Board side="r" score={match.radiantScore} won={radiantWon} mvp={board.radiant.mvp} heroMap={heroMap} />
        <div className="board-axis">
          <span className={`axis-outcome ${radiantWon ? 'r' : 'd'}`}>
            Победа {radiantWon ? 'Radiant' : 'Dire'}
          </span>
          <div className="axis-duration">{fmtDuration(match.durationSeconds)}</div>
          <div className="axis-meta">
            {match.firstBloodSeconds && match.firstBloodSeconds > 0
              ? `первая кровь на ${fmtDuration(match.firstBloodSeconds)}`
              : 'первой крови нет в данных'}
            {killsPerMin ? ` · ${killsPerMin.toFixed(1)} убийств в минуту` : ''}
            {timeline?.roshans.length ? ` · Рошан ${timeline.roshans.filter((r) => r.radiant).length}:${timeline.roshans.length - timeline.roshans.filter((r) => r.radiant).length}` : ''}
          </div>
          <Structures match={match} />
        </div>
        <Board side="d" score={match.direScore} won={!radiantWon} mvp={board.dire.mvp} heroMap={heroMap} />
      </div>

      <div className="hero-ribbon">
        <Ribbon label="Убийства" radiant={board.radiant.kills} dire={board.dire.kills} format={(n) => String(n)} />
        <Ribbon label="Нетворт" radiant={board.radiant.networth} dire={board.dire.networth} format={fmtK} />
        <Ribbon label="Урон героям" radiant={board.radiant.heroDamage} dire={board.dire.heroDamage} format={fmtK} />
        <Ribbon label="Опыт/мин" radiant={board.radiant.experience} dire={board.dire.experience} format={(n) => String(Math.round(n))} />
      </div>
    </header>
  )
}
