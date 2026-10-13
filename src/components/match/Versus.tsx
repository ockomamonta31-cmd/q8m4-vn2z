// «Противостояние» — две пятёрки лицом к лицу, как на референсе: крупный
// портрет с цветной полоской команды сверху, под ним импакт со знаком и
// мини-полоской, внизу объёмная иконка роли. Порядок строго 1→5, чтобы
// керри стоял против керри.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { HeroInfo, MatchDetails, MatchPlayer } from '../../api/types'
import type { MatchBoard, TeamSide } from '../../pages/match-model'
import { heroImageUrl } from '../../api/heroes'
import { signed, resolveImpact } from '../../api/score'
import RoleIcon from '../RoleIcon'

const posOf = (p: MatchPlayer) => (p.positionSource && p.position >= 1 && p.position <= 5 ? p.position : 6)

function five(side: TeamSide) {
  return [...side.players].sort((a, b) => posOf(a) - posOf(b) || b.networth - a.networth).slice(0, 5)
}

function Card({ p, hero, radiant, impact }: { p: MatchPlayer; hero: HeroInfo | undefined; radiant: boolean; impact: number }) {
  const positive = impact >= 0
  const width = Math.min(50, (Math.abs(impact) / 100) * 50)
  return (
    <li className={`vc${radiant ? ' r' : ' d'}`}>
      <span className={`vc-p ${p.isRadiant ? 'r' : 'd'}`}>
        {hero && <img src={heroImageUrl(hero.shortName)} alt={hero.name} loading="lazy" />}
      </span>
      <span className="vc-i">
        <b className={positive ? 'pos' : 'neg'}>{signed(impact)}</b>
        <span className="imp-t" aria-hidden="true"><i className={positive ? 'pos' : 'neg'} style={{ width: `${width}%` }} /></span>
      </span>
      <RoleIcon position={p.position} source={p.positionSource} lane={p.lane} size={48} />
      <span className="vc-n" title={hero?.name}>{hero?.name ?? `герой #${p.heroId}`}</span>
    </li>
  )
}

export default function Versus({ match, board, heroMap }: {
  match: MatchDetails
  board: MatchBoard
  heroMap: Map<number, HeroInfo>
}) {
  const [list, setList] = useState(false)
  const impactOf = (p: MatchPlayer) => resolveImpact(p, match.durationSeconds, null)?.value ?? 0
  const left = five(board.radiant)
  const right = five(board.dire)

  return (
    <section className={`vsc${list ? ' list' : ''}`} aria-label="Противостояние">
      <header className="vsc-h">
        <h2 className="vsc-t">Противостояние</h2>
        <div className="rail" role="group" aria-label="Вид противостояния" style={{ height: 32, gap: 'var(--sp-16)' }}>
          <button type="button" className={`rail-i${!list ? ' on' : ''}`} aria-selected={!list} onClick={() => setList(false)}>Плитки</button>
          <button type="button" className={`rail-i${list ? ' on' : ''}`} aria-selected={list} onClick={() => setList(true)}>Список</button>
        </div>
      </header>

      <div className="vsc-board">
        <ol className="vsc-col">
          {left.map((p) => <Card key={`${p.steamAccountId}:${p.heroId}`} p={p} hero={heroMap.get(p.heroId)} radiant impact={impactOf(p)} />)}
        </ol>
        <span className="vsc-vs" aria-hidden="true">против</span>
        <ol className="vsc-col">
          {right.map((p) => <Card key={`${p.steamAccountId}:${p.heroId}`} p={p} hero={heroMap.get(p.heroId)} radiant={false} impact={impactOf(p)} />)}
        </ol>
      </div>
    </section>
  )
}

export { posOf }
