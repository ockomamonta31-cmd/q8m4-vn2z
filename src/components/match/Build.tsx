// Раскачка, покупки и разбор импакта — раскрываются под строкой игрока.

import { useEffect, useState } from 'react'
import type { ItemInfo, MatchPlayer } from '../../api/types'
import { itemImageUrl } from '../../api'
import { assessPlayer } from '../../api/assessment'
import { signed, type ImpactScore } from '../../api/score'
import { rankName, rankDescription } from '../../api/formats'

type AbilityInfo = { name: string; img: string | null; key: string }
type AbilityBook = { book: Record<string, AbilityInfo>; heroSkills: Record<string, number[]> }

let bookPromise: Promise<AbilityBook> | null = null

/** Справочник способностей грузится один раз на приложение, а не на каждую строку. */
function useAbilityLookup(): AbilityBook {
  const [data, setData] = useState<AbilityBook>({ book: {}, heroSkills: {} })
  useEffect(() => {
    let alive = true
    if (!bookPromise) {
      bookPromise = Promise.all([
        import('../../../server/data/constants/ability_lookup.json'),
        import('../../../server/data/constants/hero_skill_order.json'),
      ]).then(([book, skills]) => ({
        book: book.default as Record<string, AbilityInfo>,
        heroSkills: skills.default as Record<string, number[]>,
      }))
    }
    bookPromise.then((value) => alive && setData(value))
    return () => { alive = false }
  }, [])
  return data
}

const number = (n: number) => n.toLocaleString('ru-RU')

export function clock(seconds: number) {
  return `${seconds < 0 ? '−' : ''}${Math.floor(Math.abs(seconds) / 60)}:${String(Math.abs(seconds) % 60).padStart(2, '0')}`
}

export function ItemSlot({ id, itemMap, cls }: { id: number | null; itemMap: Map<number, ItemInfo>; cls?: string }) {
  if (!id) return <span className={`slot empty${cls ? ` ${cls}` : ''}`} />
  const info = itemMap.get(id)
  return (
    <span className={`slot${cls ? ` ${cls}` : ''}`} title={info ? info.name : `Предмет #${id}`}>
      {info?.shortName ? (
        <img src={itemImageUrl(info.shortName)} alt={info.name} loading="lazy" />
      ) : null}
    </span>
  )
}

/** ID способностей из матча → названия и картинки; каждый уровень — плитка выбора. */
export function BuildTimeline({ upgrades, heroId }: { upgrades: MatchPlayer['abilityUpgrades']; heroId: number }) {
  const { book, heroSkills } = useAbilityLookup()
  if (!upgrades.length) return null
  const taken = [...upgrades].sort((a, b) => a.level - b.level || a.time - b.time).map((u) => {
    const info = book[String(u.ability)]
    return { ...u, info, talent: info?.key.startsWith('special_bonus') || info?.key === 'attribute_bonus' }
  })
  const pickedSkills = [...new Set(taken.filter((u) => !u.talent).map((u) => u.ability))]
  const skillOrder = heroSkills[String(heroId)] ?? pickedSkills
  const skills = skillOrder.filter((id) => pickedSkills.includes(id))
  const key = (ability: number, talent: boolean) =>
    talent ? 'T' : ['Q', 'W', 'E', 'D', 'F', 'R'][Math.max(0, skillOrder.indexOf(ability))] ?? '•'

  return (
    <section className="bld">
      <div className="bld-h">
        <b>Раскачка</b>
        <span className="dim">{upgrades.length} очков</span>
      </div>
      <div className="bld-l">
        {skills.map((id) => {
          const info = book[String(id)]
          return (
            <span key={id} title={info?.name ?? `Способность ${id}`}>
              <b className="gld">{key(id, false)}</b>
              {info?.img && <img src={`https://cdn.steamstatic.com${info.img}`} alt="" loading="lazy" width={18} height={18} />}
              {info?.name ?? `Способность ${id}`}
            </span>
          )
        })}
        {taken.some((u) => u.talent) && <span><b className="gld">T</b>Талант</span>}
      </div>
      <div className="track">
        {taken.map((u, i) => (
          <span
            className={`cell${u.talent ? ' tal' : ''}`}
            key={`${u.level}-${u.ability}-${i}`}
            title={`${u.info?.name ?? `Способность ${u.ability}`} · уровень ${u.level} · ${clock(u.time)}`}
          >
            {u.info?.img ? <img src={`https://cdn.steamstatic.com${u.info.img}`} alt={u.info?.name ?? ''} loading="lazy" /> : null}
            <i>{u.level}</i>
          </span>
        ))}
      </div>
    </section>
  )
}

export function PurchaseTimeline({ events, itemMap }: { events: MatchPlayer['purchaseEvents']; itemMap: Map<number, ItemInfo> }) {
  const empty = (text: string) => (
    <section className="bld">
      <div className="bld-h"><b>Покупки</b></div>
      <p className="dim t14">{text}</p>
    </section>
  )
  if (events == null) return empty('Реплей этого матча ещё не разобран — таймлайн покупок появится после парсинга.')
  if (!events.length) return empty('Записанных покупок нет.')

  const sorted = [...events].sort((a, b) => a.time - b.time)
  return (
    <section className="bld">
      <div className="bld-h">
        <b>Покупки</b>
        <span className="dim">{events.length} событий · с {clock(sorted[0].time)} по {clock(sorted[sorted.length - 1].time)}</span>
      </div>
      <div className="track">
        {sorted.map((e, i) => {
          const item = itemMap.get(e.itemId)
          return (
            <span className="cell buy" key={`${e.time}-${e.itemId}-${i}`} title={`${item?.name ?? `Предмет #${e.itemId}`} · ${clock(e.time)}`}>
              {item?.shortName ? <img src={itemImageUrl(item.shortName)} alt={item.name} loading="lazy" /> : null}
              <i>{clock(e.time)}</i>
            </span>
          )
        })}
      </div>
    </section>
  )
}

export function ImpactPanel({ player, durationSec, score }: { player: MatchPlayer; durationSec: number; score: ImpactScore }) {
  const assessment = assessPlayer(player, durationSec, null)
  const minutes = durationSec / 60
  const phases = player.impactPhases ?? []
  const columns = ['K / D', 'LH', 'XP', 'Нетворс', 'Урон героям', 'Башням', 'Золото']

  return (
    <section className="bld">
      <div className="bld-h">
        <b>Почему {signed(score.value)}</b>
        <span className="dim" title={rankDescription(player.rankSource, player.rankScope, player.rankFetchedAt)}>норма для {minutes.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} мин · роль и герой учтены · {player.seasonRank > 0 ? `${rankName(player.seasonRank)}${player.rankScope === 'current' ? ' сейчас' : ''}` : 'ранг неизвестен — общая норма роли'}</span>
      </div>
      <p className="dim t12">{assessment?.note}</p>
      {assessment?.factors.map(f=><div className="det-r" key={f.label}><span>{f.label}<span className="dim t12"> · {f.detail}</span></span><b>{signed(f.contribution)}</b></div>)}
      <p className="dim t12">Не измерено: {assessment?.missing.join('; ')}.</p>


      {phases.length > 0 && (
        <div className="impd" style={{ marginTop: 'var(--sp-16)' }}>
          <div className="det-r"><b>Этап</b><span>{columns.join(' · ')}</span></div>
          {phases.map((phase) => (
            <div className="det-r" key={phase.label}>
              <b>{phase.label}</b>
              <span className="t14">
                {phase.kills}/{phase.deaths} · +{number(phase.lastHits)} LH · +{number(phase.experience)} XP · +{number(phase.networth)} · +{number(phase.heroDamage)} · +{number(phase.towerDamage)} · +{number(phase.gold)} золота
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
