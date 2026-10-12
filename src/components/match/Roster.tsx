// Ростер команды: сортируемая таблица, лучший показатель в колонке, MVP,
// строка раскрывается в раскачку / покупки / разбор импакта.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { HeroInfo, ItemInfo, MatchPlayer } from '../../api/types'
import { itemImageUrl } from '../../api'
import { heroImageUrl } from '../../api/heroes'
import { steamProfileUrl } from '../../api/formats'
import { signed, type ImpactScore } from '../../api/score'
import type { MatchBoard, StatKey, TeamSide } from '../../pages/match-model'
import { ScoreBadge } from '../Impact'
import PositionIcon from '../PositionIcon'
import { Icon } from '../Icons'
import { BuildTimeline, ImpactPanel, ItemSlot, PurchaseTimeline } from './Build'

const number = (n: number) => n.toLocaleString('ru-RU')

/** MatchPlayer + подготовленный импакт, чтобы сортировка не пересчитывала модель. */
type Row = MatchPlayer & { __impact: number; __score: ImpactScore | null }

type Column = {
  key: string
  label: string
  title?: string
  sort: (p: Row) => number | string
  stat?: StatKey
}

const COLUMNS: Column[] = [
  { key: 'impact', label: 'Импакт', title: 'Насколько статы выше или ниже типичных для этой позиции и уровня: от −100 до +100', sort: (p) => p.__impact },
  { key: 'kda', label: 'K / D / A', sort: (p) => (p.deaths === 0 ? p.kills + p.assists : (p.kills + p.assists) / p.deaths) },
  { key: 'networth', label: 'Нетворт', stat: 'networth', sort: (p) => p.networth },
  { key: 'gpm', label: 'GPM', stat: 'goldPerMinute', sort: (p) => p.goldPerMinute },
  { key: 'xpm', label: 'XPM', stat: 'experiencePerMinute', sort: (p) => p.experiencePerMinute },
  { key: 'lh', label: 'LH / DN', stat: 'numLastHits', sort: (p) => p.numLastHits },
  { key: 'hd', label: 'Урон', title: 'Сырой урон по героям', stat: 'heroDamage', sort: (p) => p.heroDamage },
  { key: 'td', label: 'Башни', title: 'Урон по башням', stat: 'towerDamage', sort: (p) => p.towerDamage },
  { key: 'heal', label: 'Лечение', stat: 'heroHealing', sort: (p) => p.heroHealing },
]

function KdaCell({ p }: { p: MatchPlayer }) {
  return (
    <span className="kda-cell">
      <span className="k">{p.kills}</span>
      <span className="sep">/</span>
      <span className="d">{p.deaths}</span>
      <span className="sep">/</span>
      <span>{p.assists}</span>
    </span>
  )
}

function PlayerRow({ p, heroMap, itemMap, won, board, isMvp, durationSec }: {
  p: Row
  heroMap: Map<number, HeroInfo>
  itemMap: Map<number, ItemInfo>
  won: boolean
  board: MatchBoard
  isMvp: boolean
  durationSec: number
}) {
  const hero = heroMap.get(p.heroId)
  const [open, setOpen] = useState(false)
  const [impactOpen, setImpactOpen] = useState(false)
  const hasBuild = p.abilityUpgrades.length > 0 || p.purchaseEvents !== undefined
  const best = board.best

  return (
    <>
      <tr
        className={`mrow expandable${open ? ' open' : ''}${isMvp ? ' mvp' : ''}${won ? '' : ' lost'}`}
        onClick={hasBuild ? () => setOpen((v) => !v) : undefined}
        onKeyDown={hasBuild ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v) }
        } : undefined}
        tabIndex={hasBuild ? 0 : undefined}
        aria-expanded={hasBuild ? open : undefined}
        title={hasBuild ? 'Показать раскачку и покупки' : undefined}
      >
        <td data-label="Игрок">
          <div className="hero-cell">
            <span className="hero-portrait lg">
              {hero && <img src={heroImageUrl(hero.shortName)} alt={hero.name} loading="lazy" width={56} height={39} />}
              <PositionIcon position={p.position} source={p.positionSource} />
            </span>
            <div className="who">
              <span className="who-line">
                {p.steamAccountId ? (
                  <>
                    <Link className="who-name" to={`/player/${p.steamAccountId}`} onClick={(e) => e.stopPropagation()}>
                      {p.name ?? `#${p.steamAccountId}`}
                    </Link>
                    <a className="ext" href={steamProfileUrl(p.steamAccountId)} target="_blank" rel="noreferrer" aria-label="Открыть профиль в Steam" onClick={(e) => e.stopPropagation()}>
                      <Icon.External size={11} />
                    </a>
                  </>
                ) : (
                  <span className="muted" title="Имя взято из доступных публичных данных матча">Приватный игрок</span>
                )}
                {isMvp && <span className="mvp-tag">MVP</span>}
              </span>
              <span className="who-hero">
                {hero?.name ?? `герой #${p.heroId}`} · {p.level} ур.
                {p.leaverStatus ? ' · покинул игру' : ''}
              </span>
            </div>
          </div>
        </td>

        <td className="num stat" data-label="Импакт">
          <span className="impact-cell">
            <ScoreBadge score={p.__score} />
            {p.__score?.source === 'model' && (
              <button
                type="button"
                className="toggle-impact"
                aria-expanded={impactOpen}
                onClick={(e) => { e.stopPropagation(); setImpactOpen((v) => !v) }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {impactOpen ? 'скрыть' : 'разбор'}
              </button>
            )}
          </span>
        </td>

        <td className="num stat" data-label="KDA"><KdaCell p={p} /></td>
        <td className="num stat" data-label="Нетворт">{best.networth === p.networth && <span className="best">1</span>}{number(p.networth)}</td>
        <td className="num stat" data-label="GPM">{best.goldPerMinute === p.goldPerMinute && <span className="best">1</span>}{p.goldPerMinute}</td>
        <td className="num stat" data-label="XPM">{best.experiencePerMinute === p.experiencePerMinute && <span className="best">1</span>}{p.experiencePerMinute}</td>
        <td className="num stat" data-label="LH / DN">
          {best.numLastHits === p.numLastHits && <span className="best">1</span>}
          {p.numLastHits}<span className="muted"> / {p.numDenies}</span>
        </td>
        <td className="num stat" data-label="Урон" title={`С поправкой на время матча: ${number(p.scaledHeroDamage)}`}>
          {best.heroDamage === p.heroDamage && <span className="best">1</span>}
          {number(p.heroDamage)}
        </td>
        <td className="num stat" data-label="Башни" title={`С поправкой на время: ${number(p.scaledTowerDamage)}`}>
          {best.towerDamage === p.towerDamage && <span className="best">1</span>}
          {number(p.towerDamage)}
        </td>
        <td className="num stat" data-label="Лечение" title={`С поправкой на время: ${number(p.scaledHeroHealing)}`}>
          {best.heroHealing === p.heroHealing && p.heroHealing > 0 && <span className="best">1</span>}
          {number(p.heroHealing)}
        </td>

        <td className="items-cell" data-label="Предметы">
          <div className="items-row">
            {p.items.map((it, i) => <ItemSlot key={i} id={it} itemMap={itemMap} />)}
          </div>
          <div className="items-row items-backpack">
            {p.backpack.map((it, i) => <ItemSlot key={i} id={it} itemMap={itemMap} />)}
            <ItemSlot id={p.neutralItem} itemMap={itemMap} cls="neutral" />
            <span className={`item-slot${p.aghanimsScepter ? ' scepter' : ' empty'}`} title={p.aghanimsScepter ? "Aghanim's Scepter" : 'без скипетра'}>
              {p.aghanimsScepter ? <img src={itemImageUrl('ultimate_scepter')} alt="Скипетр Аганима" loading="lazy" width={29} height={23} /> : null}
            </span>
            <span className={`item-slot${p.aghanimsShard ? ' shard' : ' empty'}`} title={p.aghanimsShard ? "Aghanim's Shard" : 'без шарда'}>
              {p.aghanimsShard ? <img src={itemImageUrl('aghanims_shard')} alt="Осколок Аганима" loading="lazy" width={29} height={23} /> : null}
            </span>
          </div>
        </td>
      </tr>

      {(open || impactOpen) && (
        <tr className="detail-row">
          <td colSpan={COLUMNS.length + 2}>
            <div className="detail-grid">
              {impactOpen && p.__score && <ImpactPanel player={p} durationSec={durationSec} score={p.__score} />}
              {open ? (
                <>
                  <BuildTimeline upgrades={p.abilityUpgrades} heroId={p.heroId} />
                  <PurchaseTimeline events={p.purchaseEvents} itemMap={itemMap} />
                </>
              ) : null}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function TeamPanel({ side, board, heroMap, itemMap, durationSec, defaultSort }: {
  side: TeamSide
  board: MatchBoard
  heroMap: Map<number, HeroInfo>
  itemMap: Map<number, ItemInfo>
  durationSec: number
  defaultSort: { key: string; dir: 'asc' | 'desc' }
}) {
  const [sort, setSort] = useState(defaultSort)
  const won = side.players.every((p) => p.isVictory) && side.players.length > 0
  const rows = useMemo(() => {
    const mapped: Row[] = side.players.map((p, i) => ({ ...p, __impact: side.scores[i]?.value ?? 0, __score: side.scores[i] ?? null }))
    const column = COLUMNS.find((c) => c.key === sort.key)
    if (!column) return mapped
    const dir = sort.dir === 'desc' ? -1 : 1
    return mapped.sort((a, b) => {
      const av = column.sort(a)
      const bv = column.sort(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv), 'ru') * dir
    })
  }, [side, sort])

  const mvpId = board.mvp ? `${board.mvp.player.steamAccountId}:${board.mvp.player.heroId}` : null

  return (
    <section className={`team team-${side.radiant ? 'r' : 'd'}`}>
      <header className="team-head">
        <span className="team-flag" aria-hidden="true" />
        <h2 className="team-name">{side.label}</h2>
        <span className="team-result">{won ? 'Победа' : 'Поражение'}</span>
        <span className="team-tally">
          <b>{side.kills}</b> убийств · <b>{number(side.networth)}</b> нетворта · импакт{' '}
          <b className={side.impactTotal >= 0 ? 'green' : 'red'}>{signed(side.impactTotal)}</b>
        </span>
      </header>

      <div className="table-wrap">
        <table className="table roster">
          <thead>
            <tr>
              <th className="col-hero">Игрок</th>
              {COLUMNS.map((column) => {
                const active = sort.key === column.key
                return (
                  <th key={column.key} className="num" title={column.title} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => setSort({ key: column.key, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })}
                    >
                      {column.label}
                      <Icon.Chevron size={10} />
                    </button>
                  </th>
                )
              })}
              <th>Предметы</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <PlayerRow
                key={`${p.steamAccountId}:${p.heroId}`}
                p={p}
                heroMap={heroMap}
                itemMap={itemMap}
                won={won}
                board={board}
                isMvp={mvpId === `${p.steamAccountId}:${p.heroId}`}
                durationSec={durationSec}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function Rosters({ board, heroMap, itemMap, durationSec }: {
  board: MatchBoard
  heroMap: Map<number, HeroInfo>
  itemMap: Map<number, ItemInfo>
  durationSec: number
}) {
  return (
    <div className="rosters">
      <TeamPanel side={board.radiant} board={board} heroMap={heroMap} itemMap={itemMap} durationSec={durationSec} defaultSort={{ key: 'impact', dir: 'desc' }} />
      <TeamPanel side={board.dire} board={board} heroMap={heroMap} itemMap={itemMap} durationSec={durationSec} defaultSort={{ key: 'impact', dir: 'desc' }} />
    </div>
  )
}
