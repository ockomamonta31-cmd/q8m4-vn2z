// Оценка драфта: состав по тегам Valve и разрывы по замеренным числам матча.
// Никакого «рейтинга драфта» здесь нет намеренно — см. комментарий в src/api/draft.ts.

import { useEffect, useState } from 'react'
import type { HeroInfo, MatchPlayer } from '../../api/types'
import { heroImageUrl } from '../../api/heroes'
import { ATTR_RU, ATTACK_RU, TAG_ORDER, TAG_RU, getHeroMeta, type HeroMeta } from '../../api/heroMeta'
import { buildMatchups, draftNotes, edgeVerdict, teamProfile, type TeamProfile } from '../../api/draft'

function Faces({ players, heroMap }: { players: MatchPlayer[]; heroMap: Map<number, HeroInfo> }) {
  return (
    <span className="dr-review-faces">
      {players.map((p) => {
        const h = heroMap.get(p.heroId)
        return h ? (
          <span className="port xs" key={`${p.steamAccountId}:${p.heroId}`} title={h.name}>
            <img src={heroImageUrl(h.shortName)} alt={h.name} loading="lazy" />
          </span>
        ) : null
      })}
    </span>
  )
}

function Side({ team, meta }: { team: TeamProfile; meta: Map<number, HeroMeta> }) {
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

export default function DraftReview({ players, heroMap }: { players: MatchPlayer[]; heroMap: Map<number, HeroInfo> }) {
  const [meta, setMeta] = useState<Map<number, HeroMeta> | null>(null)
  useEffect(() => { let alive = true; getHeroMeta().then((m) => alive && setMeta(m)); return () => { alive = false } }, [])

  if (!meta || meta.size === 0) return null

  const radiant = teamProfile(players, true, meta)
  const dire = teamProfile(players, false, meta)
  const { matchups, basis } = buildMatchups(players)
  const worst = Math.max(1, ...matchups.map((m) => Math.abs(m.edge)))

  return (
    <section className="dr-review">
      <header className="chart-h">
        <div>
          <div className="chart-t">Оценка драфта</div>
          <div className="chart-s">Состав — по тегам Valve, сила — по четырём замерам матча: GPM, опыт, добивания, нетворс</div>
        </div>
      </header>

      <div className="dr-cols">
        <Side team={radiant} meta={meta} />
        <Side team={dire} meta={meta} />
      </div>

      <div className="dr-block">
        <h4 className="dr-h">{basis === 'replay' ? 'Линии по разобранному реплею' : 'Сравнение по месту в порядке фарма'}</h4>
        {basis === 'rank' && (
          <p className="pnote">
            Реплей этого матча не разобран, а без него линий в данных нет — какие герои стояли на какой
            линии, Steam не сообщает. Ниже пары «первый по нетворсу против первого по нетворсу» и далее.
          </p>
        )}

        <ul className="dr-mu">
          {matchups.map((m) => {
            const v = edgeVerdict(m.edge)
            return (
              <li key={m.label}>
                <span className="dr-mu-l">{m.label}</span>
                <Faces players={m.radiant} heroMap={heroMap} />
                <span className="dr-mu-bar">
                  <i className="mid" aria-hidden="true" />
                  {m.edge >= 0
                    ? <i className="r" style={{ width: `${(Math.abs(m.edge) / worst) * 50}%`, left: '50%' }} />
                    : <i className="d" style={{ width: `${(Math.abs(m.edge) / worst) * 50}%`, right: '50%' }} />}
                </span>
                <Faces players={m.dire} heroMap={heroMap} />
                <span className="dr-mu-n">
                  <b className={v.tone}>{m.edge > 0 ? '+' : ''}{m.edge.toFixed(0)}</b>
                  <span className="dim t12">{v.text}</span>
                </span>
                <span className="dr-mu-dim dim t12">
                  {m.gpm > 0 ? '+' : ''}{m.gpm.toFixed(0)} GPM · {m.xpm > 0 ? '+' : ''}{m.xpm.toFixed(0)} XPM ·{' '}
                  {m.lh > 0 ? '+' : ''}{m.lh.toFixed(0)} LH · {m.networth > 0 ? '+' : ''}{m.networth.toFixed(0)} NW
                </span>
              </li>
            )
          })}
        </ul>
        <p className="pnote">
          Край — средняя из четырёх относительных разниц с равными весами, в процентах от большего.
          За «равно» принято |край| &lt; 12.
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
        Числы «сильнее / слабее» описывают, как прошли линии в этом матче, и не предсказывают исход.
        Свой рейтинг драфта по нашим играм мы не показываем: на 465 разборах All Draft медианы исхода
        плоские по каждому тегу — например, убийств в команде с двумя инициаторами столько же, сколько
        с одним, а GPM команды с тремя керри не выше, чем с двумя.
      </p>
    </section>
  )
}
