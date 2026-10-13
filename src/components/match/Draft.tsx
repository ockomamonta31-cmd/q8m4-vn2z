// Драфт. Порядок показывает ровно то, что есть в данных: сначала автобаны
// (в этом режиме они одновременные), затем фазы выбора по `order`.

import type { ReactNode } from 'react'
import type { HeroInfo, MatchDetails } from '../../api/types'
import { heroImageUrl } from '../../api/heroes'
import RoleIcon from '../RoleIcon'
import { draftView, type DraftItem, type DraftPhase } from '../../pages/draft-model'

function Item({ hero, radiant, ban }: { hero: HeroInfo | undefined; radiant: boolean | null; ban: boolean }) {
  const name = hero?.name ?? 'герой'
  return (
    <li className={`drf-i${radiant === null ? ' n' : radiant ? ' r' : ' d'}${ban ? ' ban' : ''}`}>
      <span className="drf-c">
        {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
      </span>
      <span className="drf-n">{name}</span>
    </li>
  )
}

function Side({ label, radiant, items, ban, heroMap }: {
  label: string; radiant: boolean; items: DraftItem[]; ban: boolean; heroMap: Map<number, HeroInfo>
}) {
  return (
    <div className="drf-side">
      <span className={`drf-team ${radiant ? 'r' : 'd'}`}>{label}</span>
      <ul className="drf-cells">
        {items.length
          ? items.map((a) => <Item key={`${a.heroId}`} hero={heroMap.get(a.heroId)} radiant={radiant} ban={ban} />)
          : <li className="dim t14 drf-empty">нет</li>}
      </ul>
    </div>
  )
}

function Block({ title, count, children }: {
  title: string; count: string; children: ReactNode
}) {
  return (
    <section className="drf-g">
      <header className="drf-gh">
        <h3 className="drf-gt">{title}</h3>
        <span className="dim t14">{count}</span>
      </header>
      {children}
    </section>
  )
}

export default function Draft({ match, heroMap }: {
  match: MatchDetails
  heroMap: Map<number, HeroInfo>
}) {
  const draft = draftView(match)
  if (!draft) return null
  const banned = (items: DraftItem[], radiant: boolean) => items.filter((b) => b.radiant === radiant)

  return (
    <section className="chart">
      <div className="chart-h">
        <div>
          <div className="chart-t">Драфт</div>
          <div className="chart-s">
            {draft.bans.length} банов · {draft.picksTotal} выборов · {match.gameMode}
          </div>
        </div>
      </div>

      {draft.bans.length > 0 && (
        <Block title="Автобаны" count={`${draft.bans.length}`}>
          {draft.bansTeamKnown ? (
            <div className="drf-cols">
              <Side label="Radiant" radiant items={banned(draft.bans, true)} ban heroMap={heroMap} />
              <Side label="Dire" radiant={false} items={banned(draft.bans, false)} ban heroMap={heroMap} />
            </div>
          ) : (
            <ul className="drf-cells drf-allban">
              {draft.bans.map((b) => <Item key={b.heroId} hero={heroMap.get(b.heroId)} radiant={null} ban />)}
            </ul>
          )}
        </Block>
      )}

      <div className="drf-phases">
        {draft.phases.map((g: DraftPhase, i) => (
          <Block key={i} title={draft.simultaneous ? 'Выбор' : `Выбор · фаза ${i + 1}`} count={`${g.radiant.length} + ${g.dire.length}`}>
            {draft.simultaneous && (
              <p className="pnote drf-note">Команды выбирали параллельно: порядок идёт сначала по одной стороне, потом по другой.</p>
            )}
            <div className="drf-cols">
              <Side label="Radiant" radiant items={g.radiant} ban={false} heroMap={heroMap} />
              <Side label="Dire" radiant={false} items={g.dire} ban={false} heroMap={heroMap} />
            </div>
          </Block>
        ))}
      </div>

      {draft.source === 'steam' && (
        <p className="pnote">
          Разбора этого матча у STRATZ нет, а Steam присылает драфт обрезанным: банов здесь
          столько, сколько он успел отдать{draft.picksUnordered ? `, а ${draft.picksUnordered} выбор(а) восстановлены по составу — их порядка в ответе нет` : ''}.
        </p>
      )}

      <section className="drf-g">
        <header className="drf-gh">
          <h3 className="drf-gt">Состав</h3>
          <span className="dim t14">{match.players.filter((p) => p.positionSource).length} из 10 позиций</span>
        </header>
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
    </section>
  )
}
