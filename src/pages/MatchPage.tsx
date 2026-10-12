// Страница матча: обе команды, IMP всех игроков, шмотки, урон/башни/нетворт.
// Данные — из кэша (матчи неизменяемы), повторные открытия мгновенные.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchMatch, getItemMap, itemImageUrl } from '../api'
import { ApiError, type HeroInfo, type ItemInfo, type MatchDetails, type MatchPlayer } from '../api/types'
import { getHeroMap, heroImageUrl } from '../api/heroes'
import { fantasyPoints, globalModelInfo, predictImpGlobal, scoreClass } from '../api/performance'
import { IMPACT_MODEL_READY, impactClass, impactModelInfo, personalImpact } from '../api/impact'
import { fmtDuration, gameModeName, lobbyName, steamProfileUrl } from '../api/formats'

type AbilityInfo = { name: string; img: string | null; key: string }
function useAbilityLookup() {
  const [data, setData] = useState<{ book: Record<string, AbilityInfo>; heroSkills: Record<string, number[]> }>({ book: {}, heroSkills: {} })
  useEffect(() => { Promise.all([import('../../server/data/constants/ability_lookup.json'), import('../../server/data/constants/hero_skill_order.json')]).then(([book, skills]) => setData({ book: book.default as Record<string, AbilityInfo>, heroSkills: skills.default as Record<string, number[]> })) }, [])
  return data
}

function fmtNum(n: number): string {
  return n.toLocaleString('ru-RU')
}

function ImpBadge({
  imp,
  our,
  m,
  durationSec,
}: {
  imp: number | null
  /** наша честная оценка (−100…+100) — основная колонка */
  our: number | null
  m: MatchPlayer
  durationSec: number
}) {
  if (our !== null) {
    const info = impactModelInfo()
    return (
      <span
        className={`score-badge ${impactClass(our)}`}
        title={`Наша оценка: вклад в шанс победы относительно типичного игрока своего ранга и позиции. Учтены урон и качество килов (в т.ч. «стил» килы), смерти и что ты за них получил, саппорт-работа (варды, деворды, стаки, руны, курьеры, смоки/дасты), передвижение по карте и активность.${info ? `\nМодель: ${info.matches.toLocaleString('ru-RU')} реальных матчей, обучена ${new Date(info.trainedAt).toLocaleDateString('ru-RU')}` : ''}`}
      >
        {our > 0 ? `+${our}` : our}
      </span>
    )
  }
  if (imp !== null) {
    return (
      <span className={`score-badge ${scoreClass(imp)}`} title="IMP: −100…+100, вклад в победу">
        {imp > 0 ? `+${imp}` : imp}
      </span>
    )
  }
  const est = predictImpGlobal(m, durationSec)
  if (est !== null) {
    const info = globalModelInfo()
    return (
      <span
        className={`score-badge score-est ${scoreClass(est)}`}
        title={`Модель (обучена на ${info?.samples.toLocaleString('ru-RU') ?? '?'} матчах, MAE ±${info?.mae ?? '?'}): IMP для этого игрока не посчитан`}
      >
        {est > 0 ? `+${est}` : est}
      </span>
    )
  }
  return (
    <span className="muted" title={`IMP не рассчитан. Valve-фэнтези: ${fantasyPoints(m).toFixed(1)} баллов`}>
      —
    </span>
  )
}

function ItemSlot({ id, itemMap, cls }: { id: number | null; itemMap: Map<number, ItemInfo>; cls?: string }) {
  if (!id) return <span className={`item-slot empty ${cls ?? ''}`} />
  const info = itemMap.get(id)
  return (
    <span className={`item-slot ${cls ?? ''}`} title={info ? info.name : `Предмет #${id}`}>
      {info?.shortName ? (
        <img src={itemImageUrl(info.shortName)} alt={info.name} loading="lazy" />
      ) : (
        <span className="item-placeholder">?</span>
      )}
    </span>
  )
}

/**
 * Match ability IDs map to localized image/name constants; each level is a skill-pick tile.
 */
function BuildTimeline({ upgrades, heroId }: { upgrades: { ability: number; time: number; level: number }[]; heroId: number }) {
  const { book, heroSkills } = useAbilityLookup()
  if (!upgrades.length) return <div className="build-title">Прокачка недоступна для этого матча.</div>
  const taken = [...upgrades].sort((a, b) => a.level - b.level || a.time - b.time).map((u) => {
    const info = book[String(u.ability)]
    return { ...u, info, talent: info?.key.startsWith('special_bonus') || info?.key === 'attribute_bonus' }
  })
  const pickedSkills = [...new Set(taken.filter((u) => !u.talent).map((u) => u.ability))]
  const skillOrder = heroSkills[String(heroId)] ?? pickedSkills
  const skills = skillOrder.filter((id) => pickedSkills.includes(id))
  const slot = (ability: number, talent: boolean) => talent ? 'T' : ['Q', 'W', 'E', 'D', 'F', 'R'][Math.max(0, skillOrder.indexOf(ability))] ?? '•'
  return (
    <section className="build-section">
      <div className="build-heading"><div><strong>Раскачка</strong><span>{upgrades.length} очков · навыки и таланты</span></div><small>УРОВЕНЬ ГЕРОЯ</small></div>
      <div className="skill-legend">
        {skills.map((id, i) => {
          const info = book[String(id)]
          return <span key={id} title={info?.name ?? `Способность ${id}`}><b>{['Q', 'W', 'E', 'D', 'F', 'R'][skillOrder.indexOf(id)] ?? '•'}</b>{info?.img && <img src={`https://cdn.steamstatic.com${info.img}`} alt="" />}{info?.name ?? `Способность ${id}`}</span>
        })}
        {taken.some((u) => u.talent) && <span><b>T</b>Талант</span>}
      </div>
      <div className="skill-build-grid">
        {taken.map((u, i) => <span className={`skill-build-cell${u.talent ? ' is-talent' : ''}`} key={`${u.level}-${u.ability}-${i}`} title={`Уровень ${u.level} · ${u.info?.name ?? `Способность ${u.ability}`} · ${fmtDuration(u.time)}`}>
          <small>{u.level}</small>{u.info?.img ? <img src={`https://cdn.steamstatic.com${u.info.img}`} alt={u.info?.name ?? ''} loading="lazy" /> : <i>{slot(u.ability, u.talent)}</i>}<b>{slot(u.ability, u.talent)}</b>
        </span>)}
      </div>
      <div className="skill-build-note">Наведи на значок — увидишь способность, уровень и время.</div>
    </section>
  )
}

function PurchaseTimeline({ events, itemMap }: { events: MatchPlayer['purchaseEvents']; itemMap: Map<number, ItemInfo> }) {
  if (events == null) return <div className="build-title">Таймлайн покупок недоступен для этого матча.</div>
  if (!events.length) return <div className="build-title">Покупки не найдены.</div>
  return (
    <div className="purchase-wrap">
      <div className="build-title">Покупки · {events.length} событий</div>
      <div className="purchase-timeline">
        {[...events].sort((a, b) => a.time - b.time).map((e, i) => {
          const item = itemMap.get(e.itemId)
          const time = `${e.time < 0 ? '−' : ''}${Math.floor(Math.abs(e.time) / 60)}:${String(Math.abs(e.time) % 60).padStart(2, '0')}`
          return (
            <span className="purchase-event" key={`${e.time}-${e.itemId}-${i}`} title={`${item?.name ?? `Предмет #${e.itemId}`} · ${time}`}>
              {item?.shortName ? <img src={itemImageUrl(item.shortName)} alt={item.name} loading="lazy" /> : <span className="item-placeholder">?</span>}
              <small>{time}</small>
            </span>
          )
        })}
      </div>
    </div>
  )
}

function DraftStrip({ picks, heroMap }: { picks: MatchDetails['picksBans']; heroMap: Map<number, HeroInfo> }) {
  if (!picks.length) return null
  const bans = picks.filter((p) => !p.isPick)
  const picksList = picks.filter((p) => p.isPick)
  const cell = (b: MatchDetails['picksBans'][number]) => {
    const hero = heroMap.get(b.heroId)
    return (
      <span
        key={`${b.order}-${b.heroId}`}
        className={`draft-slot ${b.isPick ? '' : 'ban'} ${b.isRadiant ? 'radiant' : 'dire'}`}
        title={`${hero?.name ?? `герой ${b.heroId}`} · ${b.isPick ? 'выбор' : 'бан'} · ${b.isRadiant ? 'Radiant' : 'Dire'}`}
      >
        {hero && <img src={heroImageUrl(hero.shortName)} alt={hero.name} loading="lazy" />}
      </span>
    )
  }
  return (
    <div className="panel">
      <h2 className="section-title">Драфт</h2>
      <div className="draft">
        <span className="draft-tag">Баны</span>
        <span className="draft-group">{bans.map(cell)}</span>
        <span className="draft-tag">Выбор</span>
        <span className="draft-group">{picksList.map(cell)}</span>
      </div>
    </div>
  )
}

function PlayerRow({
  p,
  heroMap,
  itemMap,
  isWinner,
  durationSec,
  ourImp,
}: {
  p: MatchPlayer
  heroMap: Map<number, HeroInfo>
  itemMap: Map<number, ItemInfo>
  isWinner: boolean
  durationSec: number
  ourImp: number | null
}) {
  const hero = heroMap.get(p.heroId)
  const [open, setOpen] = useState(false)
  const hasBuild = p.abilityUpgrades.length > 0 || p.purchaseEvents !== undefined
  const { book: abilityBook } = useAbilityLookup()
  const buildPreview = p.abilityUpgrades.slice(0, 8)
  return (
    <>
      <tr
        className={`${isWinner ? 'result-win' : 'result-loss'}${hasBuild ? ' row-clickable' : ''}`}
        onClick={hasBuild ? () => setOpen((v) => !v) : undefined}
        onKeyDown={
          hasBuild
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpen((v) => !v)
                }
              }
            : undefined
        }
        tabIndex={hasBuild ? 0 : undefined}
        aria-expanded={hasBuild ? open : undefined}
        title={hasBuild ? 'Показать раскачку и покупки' : undefined}
      >
        <td>
          <div className="hero-cell">
            {hero && <img className="hero-icon" src={heroImageUrl(hero.shortName)} alt={hero.name} loading="lazy" />}
            <div className="match-player">
              <span className="player-line">
                {p.steamAccountId ? (
                  <>
                    <Link className="player-link" to={`/player/${p.steamAccountId}`} onClick={(e) => e.stopPropagation()}>
                      {p.name ?? `#${p.steamAccountId}`}
                    </Link>
                    <a className="ext-link" href={steamProfileUrl(p.steamAccountId)} target="_blank" rel="noreferrer" title="Открыть профиль в Steam" onClick={(e) => e.stopPropagation()}>
                      ↗
                    </a>
                  </>
                ) : (
                  <span className="muted" title="Имя получено из доступных публичных данных матча">
                    Приватный игрок
                  </span>
                )}
              </span>
              <span className="hero-sub muted">{hero?.name ?? `hero #${p.heroId}`}</span>
              {buildPreview.length > 0 && <span className="row-build-preview" aria-label="Первые уровни раскачки">{buildPreview.map((u, i) => {
                const info = abilityBook[String(u.ability)]
                return <span key={`${u.ability}-${i}`} title={`Ур. ${u.level} · ${info?.name ?? `Ability ${u.ability}`} · ${fmtDuration(u.time)}`}>{info?.img ? <img src={`https://cdn.steamstatic.com${info.img}`} alt="" loading="lazy" /> : <i>+</i>}</span>
              })}</span>}
            </div>
          </div>
        </td>
        <td className="num">
          <ImpBadge imp={p.imp} our={ourImp} m={p} durationSec={durationSec} />
        </td>
        <td className="num">
          <span className="green">{p.kills}</span>
          <span className="muted"> / </span>
          <span className="red">{p.deaths}</span>
          <span className="muted"> / {p.assists}</span>
        </td>
        <td className="num col-sm">{p.level}</td>
        <td className="num col-md">{fmtNum(p.networth)}</td>
        <td className="num col-md">{p.goldPerMinute}</td>
        <td className="num col-md">{p.experiencePerMinute}</td>
        <td className="num col-sm">
          {p.numLastHits}
          <span className="muted"> / {p.numDenies}</span>
        </td>
        <td className="num col-md" title={`Сырой урон по героям. С поправкой на время матча: ${fmtNum(p.scaledHeroDamage)}`}>
          {fmtNum(p.heroDamage)}
        </td>
        <td className="num col-md" title={`С поправкой на время: ${fmtNum(p.scaledTowerDamage)}`}>{fmtNum(p.towerDamage)}</td>
        <td className="items-cell">
          <div className="items-row">
            {p.items.map((it, i) => (
              <ItemSlot key={i} id={it} itemMap={itemMap} />
            ))}
          </div>
          <div className="items-row items-backpack">
            {p.backpack.map((it, i) => (
              <ItemSlot key={i} id={it} itemMap={itemMap} />
            ))}
            <ItemSlot id={p.neutralItem} itemMap={itemMap} cls="neutral" />
            <span className={`item-slot ${p.aghanimsScepter ? 'scepter' : 'empty'}`} title={p.aghanimsScepter ? 'Aghanim’s Scepter' : 'без скипетра'}>
              {p.aghanimsScepter ? <img src={itemImageUrl('ultimate_scepter')} alt="Скипетр" loading="lazy" /> : null}
            </span>
            <span className={`item-slot ${p.aghanimsShard ? 'shard' : 'empty'}`} title={p.aghanimsShard ? "Aghanim's Shard" : 'без шарда'}>
              {p.aghanimsShard ? <img src={itemImageUrl('aghanims_shard')} alt="Шард" loading="lazy" /> : null}
            </span>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="build-row">
          <td colSpan={11}>
            <BuildTimeline upgrades={p.abilityUpgrades} heroId={p.heroId} />
            <PurchaseTimeline events={p.purchaseEvents} itemMap={itemMap} />
          </td>
        </tr>
      )}
    </>
  )
}

function TeamPanel({
  title,
  players,
  won,
  heroMap,
  itemMap,
  durationSec,
}: {
  title: 'Radiant' | 'Dire'
  players: MatchPlayer[]
  won: boolean
  heroMap: Map<number, HeroInfo>
  itemMap: Map<number, ItemInfo>
  durationSec: number
}) {
  // Одна и та же функция с одной и той же seasonRank=null даёт то же число,
  // что и в списке матчей: seasonRank там тоже null (Steam его не отдаёт).
  const our = (p: MatchPlayer) => (IMPACT_MODEL_READY ? personalImpact(p, durationSec, null) : null)
  const scores = players.map(our)
  const totalOur = IMPACT_MODEL_READY ? scores.reduce<number>((s, v) => s + (v ?? 0), 0) : null
  const totalImp = players.reduce((s, p) => s + (p.imp ?? 0), 0)
  return (
    <div className={`panel team-panel ${title === 'Radiant' ? 'team-radiant' : 'team-dire'}`}>
      <div className="team-header">
        <h2 className="section-title">{title === 'Radiant' ? 'Radiant' : 'Dire'}</h2>
        <span className={`team-result ${won ? 'win' : 'loss'}`}>{won ? 'Победа' : 'Поражение'}</span>
        {totalOur !== null ? (
          <span className="muted team-imp" title="Суммарный импакт команды по нашей модели: у проигравшей обычно отрицательный — сыграли ниже базлайна своего ранга">
            суммарный импакт {totalOur > 0 ? `+${totalOur}` : totalOur}
            {totalImp !== 0 ? ` · IMP ${totalImp > 0 ? `+${totalImp}` : totalImp}` : ''}
          </span>
        ) : (
          <span className="muted team-imp">
            суммарный IMP {totalImp > 0 ? `+${totalImp}` : totalImp}
          </span>
        )}
      </div>
      <div className="table-wrap">
        <table className="table match-table">
          <thead>
            <tr>
              <th>Игрок</th>
              <th className="num" title="Наша честная оценка (−100…+100): вклад в шанс победы команды относительно типичного игрока своего ранга и позиции. Учтены урон/качество килов, смерти, саппорт-работа, движение.">Импакт ★</th>
              <th className="num">K / D / A</th>
              <th className="num col-sm">Ур.</th>
              <th className="num col-md">Нетворт</th>
              <th className="num col-md">GPM</th>
              <th className="num col-md">XPM</th>
              <th className="num col-sm">LH / DN</th>
              <th className="num col-md">Урон</th>
              <th className="num col-md">Башни</th>
              <th>Предметы</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <PlayerRow
                key={`${p.steamAccountId}:${p.heroId}`}
                p={p}
                heroMap={heroMap}
                itemMap={itemMap}
                isWinner={won}
                durationSec={durationSec}
                ourImp={scores[i]}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function MatchPage() {
  const { id } = useParams()
  const matchId = Number(id)
  const [match, setMatch] = useState<MatchDetails | null>(null)
  const [heroMap, setHeroMap] = useState<Map<number, HeroInfo>>(new Map())
  const [itemMap, setItemMap] = useState<Map<number, ItemInfo>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    setMatch(null)
    Promise.all([getHeroMap(), getItemMap()]).then(([h, i]) => {
      if (!alive) return
      setHeroMap(h)
      setItemMap(i)
    })
    fetchMatch(matchId)
      .then((m) => alive && setMatch(m))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Не удалось загрузить матч'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [matchId])

  const { radiant, dire } = useMemo(() => {
    if (!match) return { radiant: [] as MatchPlayer[], dire: [] as MatchPlayer[] }
    return {
      radiant: match.players.filter((p) => p.isRadiant),
      dire: match.players.filter((p) => !p.isRadiant),
    }
  }, [match])

  if (loading) return <div className="spinner" />

  if (error) {
    return (
      <div className="error-panel">
        <h3>Не удалось загрузить матч</h3>
        <div>{error}</div>
        <p className="muted">Матч мог быть скрыт или удалён. Проверь ID и попробуй ещё раз.</p>
      </div>
    )
  }

  if (!match) return null

  const radiantWon = Boolean(match.didRadiantWin)

  return (
    <div>
      <div className={`match-hero panel ${radiantWon ? 'radiant' : 'dire'}`}>
        <div className="match-hero-main">
          <div className="match-id-line">
            <span className={`match-outcome ${radiantWon ? 'win' : 'loss'}`}>
              {radiantWon ? 'Radiant победил' : 'Dire победил'}
            </span>
            <span className="muted">матч #{match.id}</span>
          </div>
          <div className="match-summary">
            {match.radiantScore !== null && match.direScore !== null && (
              <div className="ms-item">
                <span className="ms-value">
                  <span className={radiantWon ? 'green' : 'red'}>{match.radiantScore}</span>
                  <span className="muted"> : </span>
                  <span className={radiantWon ? 'red' : 'green'}>{match.direScore}</span>
                </span>
                <span className="ms-key">убийств</span>
              </div>
            )}
            <div className="ms-item">
              <span className="ms-value">{fmtDuration(match.durationSeconds)}</span>
              <span className="ms-key">длительность</span>
            </div>
            {match.firstBloodSeconds !== null && match.firstBloodSeconds >= 0 && (
              <div className="ms-item">
                <span className="ms-value">{fmtDuration(match.firstBloodSeconds)}</span>
                <span className="ms-key">первая кровь</span>
              </div>
            )}
          </div>
          <div className="match-meta muted">
            {gameModeName(match.gameMode)}, {lobbyName(match.lobbyType)},{' '}
            {new Date(match.startDateTime * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}
            {match.numHumanPlayers !== null ? `, ${match.numHumanPlayers} игроков` : ''}
          </div>
        </div>
      </div>

      <DraftStrip picks={match.picksBans} heroMap={heroMap} />

      <TeamPanel title="Radiant" players={radiant} won={radiantWon} heroMap={heroMap} itemMap={itemMap} durationSec={match.durationSeconds} />
      <TeamPanel title="Dire" players={dire} won={!radiantWon} heroMap={heroMap} itemMap={itemMap} durationSec={match.durationSeconds} />
    </div>
  )
}
