// Составы команд. Восемь колонок, строка 64px, детали — в раскрытии.
// Порядок игроков внутри команды — по позициям 1→5, чтобы керри стоял
// против керри; без данных о позиции порядок остаётся слотовым.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { HeroInfo, ItemInfo, MatchPlayer } from '../../api/types'
import { itemImageUrl } from '../../api'
import { heroImageUrl } from '../../api/heroes'
import { steamProfileUrl, rankName, rankDescription } from '../../api/formats'
import { signed, type ImpactScore } from '../../api/score'
import type { MatchBoard, TeamSide } from '../../pages/match-model'
import { ImpactMeter } from '../Impact'
import RoleIcon from '../RoleIcon'
import { Icon } from '../Icons'
import { BuildTimeline, ImpactPanel, ItemSlot, PurchaseTimeline } from './Build'
import MapPlaysPanel from './MapPlays'

const number = (n: number) => n.toLocaleString('ru-RU')

type Row = MatchPlayer & { __impact: number; __score: ImpactScore | null; teamKills: number; teamDamage: number }

const posOf = (p: MatchPlayer) => (p.positionSource && p.position >= 1 && p.position <= 5 ? p.position : 6)

/** Лучший в категории по матчу — золотая точка справа от числа. */
function Best({ on }: { on: boolean }) {
  return on ? <i className="best" title="Лучший показатель в матче" aria-label="лучший в матче" /> : null
}

function TeamTable({ side, board, heroMap, itemMap, durationSec }: {
  side: TeamSide
  board: MatchBoard
  heroMap: Map<number, HeroInfo>
  itemMap: Map<number, ItemInfo>
  durationSec: number
}) {
  const won = side.players.every((p) => p.isVictory) && side.players.length > 0
  const rows: Row[] = side.players
    .map((p, i) => ({ ...p, teamKills: side.kills, teamDamage: side.heroDamage, __impact: side.scores[i]?.value ?? 0, __score: side.scores[i] ?? null }))
    .sort((a, b) => posOf(a) - posOf(b))
  const mvpId = board.mvp ? `${board.mvp.player.steamAccountId}:${board.mvp.player.heroId}` : null
  const maxDamage = Math.max(1, ...side.players.map((p) => p.heroDamage))

  return (
    <section className={`team ${side.radiant ? 'r' : 'd'}`}>
      <header className="team-h">
        <span className="flag" aria-hidden="true" />
        <h2 className="team-n">{side.label}</h2>
        <span className={`badge ${won ? 'badge-win' : 'badge-loss'}`}>{won ? 'Победа' : 'Поражение'}</span>
        <span className="team-sum">
          <span><b>{side.kills}</b> убийств</span>
          <span><b>{number(side.networth)}</b> нетворс</span>
          {side.players.every(p => p.mapPlays) ? <span>эпизоды <b className="pos">{side.players.reduce((s, p) => s + (p.mapPlays?.good ?? 0), 0)} +</b> / <b className="neg">{side.players.reduce((s, p) => s + (p.mapPlays?.bad ?? 0), 0)} −</b></span> : <span>стат. импакт <b className={side.impactTotal >= 0 ? 'pos' : 'neg'}>{signed(side.impactTotal)}</b></span>}
        </span>
      </header>

      <div className="thead">
        <span>Игрок</span>
        <span>{side.players.every(p => p.mapPlays) ? 'Баланс эпизодов' : 'Стат. импакт'}</span>
        <span>K / D / A</span>
        <span>Нетворс</span>
        <span>GPM / XPM</span>
        <span>LH / DN</span>
        <span>Урон</span>
        <span>Предметы</span>
        <span />
      </div>

      {rows.map((p) => (
        <PlayerRow
          key={`${p.steamAccountId}:${p.heroId}`}
          p={p}
          heroMap={heroMap}
          itemMap={itemMap}
          maxDamage={maxDamage}
          isMvp={mvpId === `${p.steamAccountId}:${p.heroId}`}
          durationSec={durationSec}
          best={board.best}
        />
      ))}
    </section>
  )
}

function PlayerRow({ p, heroMap, itemMap, maxDamage, isMvp, durationSec, best }: {
  p: Row
  heroMap: Map<number, HeroInfo>
  itemMap: Map<number, ItemInfo>
  maxDamage: number
  isMvp: boolean
  durationSec: number
  best: MatchBoard['best']
}) {
  const hero = heroMap.get(p.heroId)
  const [open, setOpen] = useState(false)
  const canOpen = p.abilityUpgrades.length > 0 || p.purchaseEvents !== undefined || p.__score?.source === 'model'

  return (
    <div className={`tgrp${open ? ' open' : ''}`}>
      <div
        className={`trow${isMvp ? ' mvp-row' : ''}`}
        onClick={canOpen ? () => setOpen((v) => !v) : undefined}
        onKeyDown={canOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v) } } : undefined}
        role={canOpen ? 'button' : undefined}
        tabIndex={canOpen ? 0 : undefined}
        aria-expanded={canOpen ? open : undefined}
      >
        <span className="c-who">
          <RoleIcon position={p.position} source={p.positionSource} lane={p.lane} size={40} />
          <span className={`port ${p.isRadiant ? 'r' : 'd'}`}>
            {hero && <img src={heroImageUrl(hero.shortName)} alt={hero.name} loading="lazy" />}
          </span>
          <span className="c-name">
            <span className="c-nm">
              {p.steamAccountId ? (
                <Link to={`/player/${p.steamAccountId}`} onClick={(e) => e.stopPropagation()}>
                  {p.name ?? `#${p.steamAccountId}`}
                </Link>
              ) : (
                <span className="dim" title="Имя взято из доступных публичных данных матча">Приватный игрок</span>
              )}
              {isMvp && <span className="mvp"><Icon.Crown size={14} /> MVP</span>}
            </span>
            <span className="dim">
              {hero?.name ?? `герой #${p.heroId}`}, {p.level} ур.
              <span title={rankDescription(p.rankSource, p.rankScope, p.rankFetchedAt)}> · {rankName(p.seasonRank)}{p.rankScope === 'current' ? ' сейчас' : ''}</span>
              {p.leaverStatus ? ' · покинул игру' : ''}
            </span>
          </span>
        </span>

        <span className="c-imp"><ImpactMeter score={p.__score} /></span>


        <span className="c-kda">
          <b>{p.kills} / <i>{p.deaths}</i> / {p.assists}</b>
          <span className="dim">KDA {p.deaths === 0 ? (p.kills + p.assists).toFixed(2) : ((p.kills + p.assists) / p.deaths).toFixed(2)}</span>
        </span>

        <span className="c-nw">{number(p.networth)}<Best on={best.networth === p.networth} /></span>

        <span className="c-gx">
          <span>{p.goldPerMinute} <span className="dim">GPM</span><Best on={best.goldPerMinute === p.goldPerMinute} /></span>
          <span>{p.experiencePerMinute} <span className="dim">XPM</span><Best on={best.experiencePerMinute === p.experiencePerMinute} /></span>
        </span>

        <span className="c-lh">{p.numLastHits} / {p.numDenies}<Best on={best.numLastHits === p.numLastHits} /></span>

        <span className="c-dm">
          <b>{number(p.heroDamage)}<Best on={best.heroDamage === p.heroDamage} /></b>
          <span className="bar"><i style={{ width: `${(p.heroDamage / maxDamage) * 100}%` }} /></span>
        </span>

        <span className="c-items">
          {p.items.map((it, i) => <ItemSlot key={i} id={it} itemMap={itemMap} />)}
          <ItemSlot id={p.neutralItem} itemMap={itemMap} cls="neu" />
        </span>

        {canOpen && (
          <button
            type="button"
            className="c-go"
            aria-label={open ? 'Скрыть детали' : 'Показать детали'}
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
          >
            <Icon.Chevron size={20} />
          </button>
        )}
      </div>

      {open && (
        <div className="det">
          {p.mapPlays && <MapPlaysPanel plays={p.mapPlays} />}
          <div>
            <div className="det-t">Прочие числа</div>
            <div className="det-r"><span>Урон башням</span><b>{number(p.towerDamage)}</b></div>
            <div className="det-r"><span>Лечение</span><b>{number(p.heroHealing)}</b></div>
            <div className="det-r"><span>Скипетр</span><b>{p.aghanimsScepter ? 'есть' : 'нет'}</b></div>
            <div className="det-r"><span>Осколок</span><b>{p.aghanimsShard ? 'есть' : 'нет'}</b></div>
            <div className="det-r"><span>Рюкзак</span><b>{p.backpack.filter(Boolean).length ? '' : 'пуст'}</b></div>
            {p.backpack.some(Boolean) && (
              <span className="c-items" style={{ marginTop: 'var(--sp-8)' }}>
                {p.backpack.map((it, i) => <ItemSlot key={i} id={it} itemMap={itemMap} />)}
              </span>
            )}
            <a
              className="ext"
              style={{ marginTop: 'var(--sp-12)' }}
              href={p.steamAccountId ? steamProfileUrl(p.steamAccountId) : undefined}
              target="_blank"
              rel="noreferrer"
            >
              Профиль в Steam
              <Icon.External size={14} />
            </a>
          </div>
          {!p.mapPlays && p.__score?.source === 'model' && <ImpactPanel player={p} durationSec={durationSec} score={p.__score} />}
          <BuildTimeline upgrades={p.abilityUpgrades} heroId={p.heroId} />
          <PurchaseTimeline events={p.purchaseEvents} itemMap={itemMap} />
        </div>
      )}
    </div>
  )
}

export default function Rosters({ board, heroMap, itemMap, durationSec }: {
  board: MatchBoard
  heroMap: Map<number, HeroInfo>
  itemMap: Map<number, ItemInfo>
  durationSec: number
}) {
  return (
    <div>
      <TeamTable side={board.radiant} board={board} heroMap={heroMap} itemMap={itemMap} durationSec={durationSec} />
      <TeamTable side={board.dire} board={board} heroMap={heroMap} itemMap={itemMap} durationSec={durationSec} />
    </div>
  )
}
