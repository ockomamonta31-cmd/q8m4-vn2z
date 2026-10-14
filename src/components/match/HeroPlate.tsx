// Hero матча на всю ширину экрана, радиус 0.
//
// Арт героя победившей команды с максимальным вкладом прижат к правому краю,
// слева направо и снизу вверх он уходит в --bg: текст читается без подложки,
// «панели в панели» нет. Победитель сказано один раз — полосой 6px по нижнему
// краю и линией 4×96 под заголовком; само слово в заголовке не красится.

import { Link } from 'react-router-dom'
import type { HeroInfo, MatchDetails } from '../../api/types'
import type { MatchBoard } from '../../pages/match-model'
import { fmtK } from '../../pages/match-model'
import type { MatchTimeline } from '../../api/timeline'
import { fmtDuration, gameModeName, lobbyName } from '../../api/formats'
import { heroRenderUrl } from '../../api/heroes'
import { signed } from '../../api/score'
import { CopyButton, Counter } from '../primitives'
import { Icon } from '../Icons'
import Versus from './Versus'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mh-m">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/** Целых строений у каждой стороны — из битовых статусов Valve. */
function structures(value: number | null, bits: number) {
  if (value == null) return null
  let n = 0
  for (let i = 0; i < bits; i++) if ((value >> i) & 1) n++
  return n
}

export default function HeroPlate({ match, board, timeline, heroMap }: {
  match: MatchDetails
  board: MatchBoard
  timeline: MatchTimeline | null
  heroMap: Map<number, HeroInfo>
}) {
  const radiantWon = Boolean(match.didRadiantWin)
  const winner = radiantWon ? board.radiant : board.dire
  const lead = winner.mvp
  const leadHero = lead ? heroMap.get(lead.player.heroId) : undefined

  const scoreWinner = radiantWon ? match.radiantScore : match.direScore
  const scoreLoser = radiantWon ? match.direScore : match.radiantScore
  const netDiff = board.radiant.networth - board.dire.networth

  const roshans = timeline?.roshans.length
    ? `${timeline.roshans.filter((x) => x.radiant).length} : ${timeline.roshans.length - timeline.roshans.filter((x) => x.radiant).length}`
    : 'нет реплея'

  const towers = [structures(match.towerStatusRadiant, 11), structures(match.towerStatusDire, 11)]
  const rax = [structures(match.barracksStatusRadiant, 6), structures(match.barracksStatusDire, 6)]

  const links = [
    { href: `https://www.stratz.com/matches/${match.id}`, label: 'STRATZ' },
    { href: 'https://www.dotabuff.com/matches/' + match.id, label: 'Dotabuff' },
    { href: `https://www.opendota.com/matches/${match.id}`, label: 'OpenDota' },
  ]

  return (
    <header className={`mh${radiantWon ? ' r' : ' d'}`}>
      {leadHero && <img className="mh-art" src={heroRenderUrl(leadHero.shortName)} alt="" aria-hidden="true" />}
      <div className="mh-scrim" aria-hidden="true" />
      <span className="mh-strip" aria-hidden="true" />

      <div className="mh-in">
        <div className="mh-top">
          <nav className="mh-crumbs" aria-label="Хлебные крошки">
            <Link to="/" onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); window.history.back() } }}>
              Назад
            </Link>
            <span className="dotsep" aria-hidden="true" />
            <b>Матч {match.id}</b>
            <span className="dotsep" aria-hidden="true" />
            <span>{gameModeName(match.gameMode)}</span>
            <span className="dotsep" aria-hidden="true" />
            <span>{lobbyName(match.lobbyType)}</span>
            <span className="dotsep" aria-hidden="true" />
            <span>{new Date(match.startDateTime * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
            <span className="dotsep" aria-hidden="true" />
            <span>{match.numHumanPlayers ?? match.players.length} игроков</span>
          </nav>

          <div className="mh-acts">
            <CopyButton text={String(match.id)} label={`Скопировать ID матча ${match.id}`} primary />
            {links.map((link) => (
              <a key={link.label} className="ext" href={link.href} target="_blank" rel="noreferrer">
                {link.label}
                <Icon.External size={14} />
              </a>
            ))}
          </div>
        </div>

        <div className="mh-body">
          <h1 className="mh-h1">Победа {radiantWon ? 'Radiant' : 'Dire'}</h1>
          <span className="mh-rule" aria-hidden="true" />

          <div className="mh-figs">
            <span className="mh-score">
              <b><Counter value={scoreWinner ?? 0} duration={600} /></b>
              <i>:</i>
              <s><Counter value={scoreLoser ?? 0} duration={600} /></s>
              <em>убийств</em>
            </span>
            <span className="mh-dur">
              <Counter value={match.durationSeconds} duration={600} format={(n) => fmtDuration(Math.round(n))} />
            </span>
            <span className="mh-diff">
              {netDiff >= 0 ? '+' : '−'}{fmtK(Math.abs(netDiff))}
              <em>нетворса</em>
            </span>
          </div>

          <dl className="mh-metrics">
            <Metric label="первая кровь" value={match.firstBloodSeconds && match.firstBloodSeconds > 0 ? fmtDuration(match.firstBloodSeconds) : 'не было'} />
            <Metric label="Рошан" value={roshans} />
            <Metric label="башни целы" value={towers[0] === null ? '—' : `${towers[0]} : ${towers[1]}`} />
            <Metric label="казармы целы" value={rax[0] === null ? '—' : `${rax[0]} : ${rax[1]}`} />
          </dl>

          {leadHero && lead && (
            <p className="mh-note">Выше оценка игры — {leadHero.name}, {signed(lead.score.value)}</p>
          )}
        </div>

        <div className="mh-versus">
          <Versus match={match} board={board} heroMap={heroMap} />
        </div>
      </div>
    </header>
  )
}
