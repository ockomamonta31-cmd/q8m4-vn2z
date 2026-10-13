// Драфт. Valve отдаёт picks_bans отсортированными по типу, а не по времени,
// поэтому здесь нет «очерёди хода»: сначала автобаны, потом фазы выбора.

import type { HeroInfo, MatchDetails } from '../../api/types'
import { heroImageUrl } from '../../api/heroes'
import RoleIcon from '../RoleIcon'
import { splitDraft, type DraftAction, type DraftGroup } from '../../pages/draft-model'

function Tile({ hero, radiant, ban }: { hero: HeroInfo | undefined; radiant: boolean; ban: boolean }) {
  const name = hero?.name ?? 'герой'
  return (
    <span className={`drf-c ${radiant ? 'r' : 'd'}${ban ? ' ban' : ''}`} title={`${name} · ${ban ? 'бан' : 'выбор'} · ${radiant ? 'Radiant' : 'Dire'}`}>
      {hero && <img src={heroImageUrl(hero.shortName)} alt={name} loading="lazy" />}
    </span>
  )
}

function Row({ label, actions, radiant, ban, heroMap }: { label: string; actions: DraftAction[]; radiant: boolean; ban: boolean; heroMap: Map<number, HeroInfo> }) {
  return (
    <div className="drf-side">
      <span className={`drf-team ${radiant ? 'r' : 'd'}`}>{label}</span>
      <div className="drf-cells">
        {actions.length
          ? actions.map((a) => <Tile key={`${a.order}-${a.heroId}`} hero={heroMap.get(a.heroId)} radiant={radiant} ban={ban} />)
          : <span className="dim t14">нет</span>}
      </div>
    </div>
  )
}

function Group({ title, note, group, ban, heroMap }: {
  title: string; note?: string; group: DraftGroup; ban: boolean; heroMap: Map<number, HeroInfo>
}) {
  return (
    <section className="drf-g">
      <header className="drf-gh">
        <h3 className="drf-gt">{title}</h3>
        <span className="dim t14">{note ?? `${group.radiant.length + group.dire.length} ${ban ? 'бана' : 'героя'}`}</span>
      </header>
      <div className="drf-cols">
        <Row label="Radiant" actions={group.radiant} radiant ban={ban} heroMap={heroMap} />
        <Row label="Dire" actions={group.dire} radiant={false} ban={ban} heroMap={heroMap} />
      </div>
    </section>
  )
}

export default function Draft({ picks, heroMap, match }: {
  picks: MatchDetails['picksBans']
  heroMap: Map<number, HeroInfo>
  match: MatchDetails
}) {
  if (!picks.length) return null
  const { autoBans, phases, hasBans } = splitDraft(picks)
  const extraPicks = phases.reduce((n, g) => n + g.radiant.length + g.dire.length, 0) - 10

  return (
    <section className="chart">
      <div className="chart-h">
        <div>
          <div className="chart-t">Драфт</div>
          <div className="chart-s">Автобаны идут до выборов, внутри фазы команда берёт не больше двух героев</div>
        </div>
      </div>

      {hasBans && (
        <>
          <Group title="Автобаны" group={autoBans} ban heroMap={heroMap}
            note={`${autoBans.radiant.length} + ${autoBans.dire.length}`} />
          <p className="pnote" style={{ marginTop: 'var(--sp-8)' }}>
            В этом режиме автобаны идут одновременно у обеих команд до первого выбора,
            а их порядок в ответе не сохранён. Показано ровно то, что отдал Steam Web API.
          </p>
        </>
      )}

      <div className="drf-phases">
        {phases.map((g, i) => (
          <Group key={i} title={`Выбор · фаза ${i + 1}`} group={g} ban={false} heroMap={heroMap}
            note={`${g.radiant.length} + ${g.dire.length}`} />
        ))}
      </div>

      {extraPicks > 0 && (
        <p className="pnote" style={{ marginTop: 'var(--sp-16)' }}>
          Выборов больше десяти на {extraPicks}: в одновременной фазе обе команды заявили одного героя,
          поэтому пришлось выбирать заново.
        </p>
      )}

      <div className="lu-board">
        {([true, false] as const).map((radiant) => {
          const players = match.players
            .filter((p) => p.isRadiant === radiant)
            .sort((a, b) => (a.positionSource ? a.position : 6) - (b.positionSource ? b.position : 6))
          return (
            <div className={`lu${radiant ? ' r' : ' d'}`} key={radiant ? 'r' : 'd'}>
              <span className="lu-h">{radiant ? 'Radiant' : 'Dire'}</span>
              {players.map((p) => {
                const h = heroMap.get(p.heroId)
                return (
                  <div className="lu-r" key={`${p.steamAccountId}:${p.heroId}`}>
                    <RoleIcon position={p.position} source={p.positionSource} lane={p.lane} size={40} />
                    <span className={`port ${radiant ? 'r' : 'd'}`}>
                      {h && <img src={heroImageUrl(h.shortName)} alt="" loading="lazy" />}
                    </span>
                    <span className="lu-n">
                      <b>{h?.name ?? `герой #${p.heroId}`}</b>
                      <span className="dim">{p.name ?? (p.steamAccountId ? `#${p.steamAccountId}` : 'приватный')}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </section>
  )
}
