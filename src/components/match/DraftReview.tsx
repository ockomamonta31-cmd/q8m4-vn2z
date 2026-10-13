// Оценка драфта: состав по тегам Valve и линии как конкретные пары героев.
// «Чей драфт лучше на бумаге» — отдельный блок, DraftPower.tsx.

import { useEffect, useState } from 'react'
import type { HeroInfo, MatchPlayer } from '../../api/types'
import { heroImageUrl } from '../../api/heroes'
import { ATTR_RU, ATTACK_RU, TAG_ORDER, TAG_RU, getHeroMeta, type HeroMeta } from '../../api/heroMeta'
import { buildMatchups, draftNotes, edgeVerdict, teamProfile, type Matchup, type TeamProfile } from '../../api/draft'
import RoleIcon from '../RoleIcon'

function Side({ team }: { team: TeamProfile }) {
  return (
    <div className={`dr-side ${team.radiant ? 'r' : 'd'}`}>
      <h4 className={`dr-team ${team.radiant ? 'r' : 'd'}`}>{team.radiant ? 'Radiant' : 'Dire'}</h4>

      <div className="dr-chips">
        {Object.entries(team.attr).filter(([, n]) => n > 0).map(([a, n]) => (
          <span className="chip" key={a}><b>{n}</b> {ATTR_RU[a] ?? a}</span>
        ))}
        <span className="chip">{team.ranged} <span className="dim">{ATTACK_RU.ranged}</span> · {team.melee} <span className="dim">{ATTACK_RU.melee}</span></span>
      </div>

      <ul className="dr-tags">
        {TAG_ORDER.map((t) => {
          const n = team.tags[t] ?? 0
          return (
            <li key={t} className={n ? '' : 'zero'}>
              <span className="dr-tag-n">{n}</span>
              <span className="dr-tag-l">{TAG_RU[t] ?? t}</span>
              <span className="dr-tag-t"><i style={{ width: `${(n / 5) * 100}%` }} /></span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Hero({ player, heroMap, side }: { player: MatchPlayer | null; heroMap: Map<number, HeroInfo>; side: 'r' | 'd' }) {
  if (!player) return <span className={`lm-hero ${side} empty`}>на этой линии никого</span>
  const h = heroMap.get(player.heroId)
  return (
    <span className={`lm-hero ${side}`}>
      <RoleIcon position={player.position} source={player.positionSource} lane={player.lane} size={24} />
      <span className={`port xs ${side}`}>{h && <img src={heroImageUrl(h.shortName)} alt="" loading="lazy" />}</span>
      <span className="lm-hero-txt">
        <b>{h?.name ?? `герой #${player.heroId}`}</b>
        <span className="dim t12">{player.goldPerMinute} GPM · {player.experiencePerMinute} XPM · {player.numLastHits} LH · {player.numDenies} DN</span>
      </span>
    </span>
  )
}

function fmt(n: number) {
  return `${n > 0 ? '+' : ''}${n.toFixed(0)}`
}

const tone = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'dim')

function Lane({ m, heroMap }: { m: Matchup; heroMap: Map<number, HeroInfo> }) {
  const v = edgeVerdict(m.edge)
  return (
    <section className="lm">
      <header className="lm-h">
        <h5 className="lm-t">{m.label}</h5>
        <span className="lm-v">
          <b className={v.tone}>{fmt(m.edge)}</b>
          <span className="dim t12">
            {!m.radiant.length || !m.dire.length
              ? 'линия только у одной стороны'
              : v.text === 'равно' ? 'Radiant и Dire равны' : `Radiant ${v.text}`}
          </span>
        </span>
      </header>

      <ul className="lm-pairs">
        {m.pairs.map((pair, i) => {
          const r = pair.radiant
          const d = pair.dire
          const gap = r && d
            ? { gpm: r.goldPerMinute - d.goldPerMinute, xpm: r.experiencePerMinute - d.experiencePerMinute, lh: r.numLastHits - d.numLastHits }
            : null
          return (
            <li className="lm-pair" key={`${i}-${r?.heroId ?? 'x'}-${d?.heroId ?? 'x'}`}>
              <Hero player={r} heroMap={heroMap} side="r" />
              <span className="lm-vs">против</span>
              <Hero player={d} heroMap={heroMap} side="d" />
              <span className="lm-d">
                {gap
                  ? <>
                    <b className={tone(gap.gpm)}>{fmt(gap.gpm)} GPM</b>
                    <span className="dim t12">{fmt(gap.xpm)} XPM · {fmt(gap.lh)} LH</span>
                  </>
                  : <span className="dim t12">прямого соперника на линии не было</span>}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="lm-foot">
        <span className={`lm-sum r`}><b>{m.totals.r.gpm}</b> GPM · <b>{m.totals.r.xpm}</b> XPM · <b>{m.totals.r.lh}</b> LH · <b>{m.totals.r.nw}</b> NW</span>
        <span className="dr-mu-bar">
          <i className="mid" aria-hidden="true" />
          {m.edge >= 0
            ? <i className="r" style={{ width: `${Math.min(50, Math.abs(m.edge) / 2)}%`, left: '50%' }} />
            : <i className="d" style={{ width: `${Math.min(50, Math.abs(m.edge) / 2)}%`, right: '50%' }} />}
        </span>
        <span className={`lm-sum d`}><b>{m.totals.d.gpm}</b> GPM · <b>{m.totals.d.xpm}</b> XPM · <b>{m.totals.d.lh}</b> LH · <b>{m.totals.d.nw}</b> NW</span>
      </div>
    </section>
  )
}

export default function DraftReview({ players, heroMap }: { players: MatchPlayer[]; heroMap: Map<number, HeroInfo> }) {
  const [meta, setMeta] = useState<Map<number, HeroMeta> | null>(null)
  useEffect(() => { let alive = true; getHeroMeta().then((m) => alive && setMeta(m)); return () => { alive = false } }, [])

  if (!meta || meta.size === 0) return null

  const radiant = teamProfile(players, true, meta)
  const dire = teamProfile(players, false, meta)
  const { matchups, basis } = buildMatchups(players)

  return (
    <section className="dr-review">
      <header className="chart-h">
        <div>
          <div className="chart-t">Оценка драфта</div>
          <div className="chart-s">Состав — по тегам Valve, линии — по тому, кто реально стоял против кого</div>
        </div>
      </header>

      <div className="dr-cols">
        <Side team={radiant} />
        <Side team={dire} />
      </div>

      <div className="dr-block">
        <h4 className="dr-h">
          {basis === 'replay' ? 'Линии по нашему разбору реплея'
            : basis === 'stratz' ? 'Линии по разобранному реплею'
            : 'Линий в данных нет'}
        </h4>
        {basis === 'rank' ? (
          <p className="pnote">
            Ни свой разбор, ни разбор STRATZ не дал линий этого матча — Steam о линиях молчит.
            Ниже честное сравнение по месту в порядке фарма: первый по нетворсу против первого
            по нетворсу и дальше. Это не коридоры карты.
          </p>
        ) : (
          <p className="pnote">
            Линия взята из разобранного реплея: видно, какие герои стояли на одном коридоре.
            Пара внутри линии — герои с одинаковым номером позиции, то есть керри против керри
            и саппорт против саппорта.
          </p>
        )}

        <div className="lm-list">
          {matchups.map((m) => <Lane key={m.key || m.label} m={m} heroMap={heroMap} />)}
        </div>

        <p className="pnote">
          Край линии — среднее из четырёх относительных разниц (GPM, опыт, добивания, нетворс)
          по сумме линии, в процентах от большего. За «равно» принято |край| &lt; 12.
        </p>
      </div>

      <div className="dr-block">
        <h4 className="dr-h">Что следует из состава</h4>
        <div className="dr-cols">
          {([radiant, dire] as const).map((t) => {
            const notes = draftNotes(t, t.radiant ? dire : radiant)
            return (
              <ul className={`dr-notes ${t.radiant ? 'r' : 'd'}`} key={t.radiant ? 'r' : 'd'}>
                {notes.length
                  ? notes.map((n) => <li key={n}>{n}</li>)
                  : <li className="dim">Состав без явных перекосов по тегам.</li>}
              </ul>
            )
          })}
        </div>
      </div>

      <p className="pnote dr-caveat">
        Числа «сильнее / слабее» описывают, как прошли линии в этом матче, и не предсказывают исход.
        А то, каким был драфт на бумаге, считается отдельным блоком — по измеренным винрейтам STRATZ,
        а не по нашей фантазии. Собственный рейтинг по тегам Valve мы не строим: на 465 разборах All
        Draft медианы исхода плоские по каждому тегу — например, убийств в команде с двумя инициаторами
        столько же, сколько с одним, а GPM команды с тремя керри не выше, чем с двумя.
      </p>
    </section>
  )
}
