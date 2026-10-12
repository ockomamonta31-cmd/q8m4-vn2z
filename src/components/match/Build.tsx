// Раскачка, покупки и разбор импакта — раскрываются под строкой игрока.

import { useEffect, useState } from 'react'
import type { ItemInfo, MatchPlayer } from '../../api/types'
import { itemImageUrl } from '../../api'
import { personalImpactBreakdown } from '../../api/impact'
import { signed, type ImpactScore } from '../../api/score'

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
  if (!id) return <span className={`item-slot empty${cls ? ` ${cls}` : ''}`} />
  const info = itemMap.get(id)
  return (
    <span className={`item-slot${cls ? ` ${cls}` : ''}`} title={info ? info.name : `Предмет #${id}`}>
      {info?.shortName ? (
        <img src={itemImageUrl(info.shortName)} alt={info.name} loading="lazy" width={29} height={23} />
      ) : (
        <span className="item-placeholder">?</span>
      )}
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
    <section className="build">
      <div className="build-head">
        <strong>Раскачка</strong>
        <span>{upgrades.length} очков · навыки и таланты</span>
      </div>
      <div className="build-body">
        <div className="skill-legend">
          {skills.map((id) => {
            const info = book[String(id)]
            return (
              <span key={id} title={info?.name ?? `Способность ${id}`}>
                <b>{key(id, false)}</b>
                {info?.img && <img src={`https://cdn.steamstatic.com${info.img}`} alt="" loading="lazy" width={18} height={18} />}
                {info?.name ?? `Способность ${id}`}
              </span>
            )
          })}
          {taken.some((u) => u.talent) && <span><b>T</b>Талант</span>}
        </div>
        <div className="skill-track">
          {taken.map((u, i) => (
            <span
              className={`skill-cell${u.talent ? ' talent' : ''}`}
              key={`${u.level}-${u.ability}-${i}`}
              title={`${u.info?.name ?? `Способность ${u.ability}`} · уровень ${u.level} · ${clock(u.time)}`}
            >
              {u.info?.img ? <img src={`https://cdn.steamstatic.com${u.info.img}`} alt={u.info?.name ?? ''} loading="lazy" width={26} height={26} /> : null}
              <i>{u.level}</i>
              <b>{key(u.ability, u.talent)}</b>
            </span>
          ))}
        </div>
        <div className="build-note">Плитка показывает способность, уровень и время выбора.</div>
      </div>
    </section>
  )
}
export function PurchaseTimeline({ events, itemMap }: { events: MatchPlayer['purchaseEvents']; itemMap: Map<number, ItemInfo> }) {
  const empty = (text: string) => (
    <section className="build">
      <div className="build-head"><strong>Покупки</strong></div>
      <div className="build-empty">{text}</div>
    </section>
  )
  if (events == null) return empty('Реплей этого матча ещё не разобран — таймлайн покупок появится после парсинга.')
  if (!events.length) return empty('Записанных покупок нет.')

  const sorted = [...events].sort((a, b) => a.time - b.time)
  return (
    <section className="build">
      <div className="build-head">
        <strong>Покупки</strong>
        <span>{events.length} событий · от {clock(sorted[0].time)} до {clock(sorted[sorted.length - 1].time)}</span>
      </div>
      <div className="build-body">
        <div className="buy-track">
          {sorted.map((e, i) => {
            const item = itemMap.get(e.itemId)
            return (
              <span className="buy" key={`${e.time}-${e.itemId}-${i}`} title={`${item?.name ?? `Предмет #${e.itemId}`} · ${clock(e.time)}`}>
                {item?.shortName ? <img src={itemImageUrl(item.shortName)} alt={item.name} loading="lazy" width={29} height={29} /> : <span className="item-placeholder">?</span>}
                <small className={e.time < 60 ? 'early' : undefined}>{clock(e.time)}</small>
              </span>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function ImpactPanel({ player, durationSec, score }: { player: MatchPlayer; durationSec: number; score: ImpactScore }) {
  const details = personalImpactBreakdown({ ...player, position: 0 }, durationSec, null)
  const groups = ['Бой', 'Фарм', 'Урон и объекты']
  const phases = player.impactPhases ?? []
  const columns = ['K / D', 'LH', 'XP', 'Нетворт', 'Урон героям', 'Башням', 'Золото']

  return (
    <section className="impact-panel" aria-label="Разбор оценки">
      <header className="impact-head">
        <h3>Почему {signed(score.value)}</h3>
        <p>Сумма факторов равна оценке · сравнение с базлайном того же уровня</p>
      </header>

      <div className="factor-groups">
        {groups.map((group) => {
          const factors = details?.factors.filter((factor) => factor.section === group) ?? []
          if (!factors.length) return null
          const groupScore = factors.reduce((sum, factor) => sum + factor.contribution, 0)
          return (
            <div className="factor-group" key={group}>
              <div className="factor-group-head">
                <b>{group}</b>
                <span className={groupScore >= 0 ? 'green' : 'red'}>{signed(groupScore)}</span>
              </div>
              {factors.map((factor) => (
                <div className="factor" key={factor.label}>
                  <span className="factor-name">
                    {factor.label}
                    <small>факт {number(factor.actual)} · обычно {number(factor.baseline)}</small>
                  </span>
                  <span className={`factor-score${factor.contribution >= 0 ? ' pos' : ' neg'}`}>{signed(factor.contribution)}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div className="phase-board">
        <div className="phase phase-head">
          <b>Этап</b>
          {columns.map((label, i) => <span key={label} className={i >= 4 ? 'phase-extra' : undefined}>{label}</span>)}
        </div>
        {phases.length ? phases.map((phase) => (
          <div className="phase" key={phase.label}>
            <b>{phase.label}</b>
            <span>{phase.kills}/{phase.deaths}</span>
            <span>+{number(phase.lastHits)}</span>
            <span>+{number(phase.experience)}</span>
            <span className="phase-extra">+{number(phase.networth)}</span>
            <span className="phase-extra">+{number(phase.heroDamage)}</span>
            <span className="phase-extra">+{number(phase.towerDamage)}</span>
            <span>+{number(phase.gold)}</span>
          </div>
        )) : (
          <div className="phase-empty">Событий реплея для разбивки по времени ещё нет — разбери матч по итоговым статам выше.</div>
        )}
      </div>

      <div className="impact-foot">
        Этапы — из реплея. Оценку считает по матчу целиком, чтобы сравнения между играми оставались сопоставимыми.
      </div>
    </section>
  )
}
