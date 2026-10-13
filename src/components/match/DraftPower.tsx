// «Кто сильнее на бумаге»: пять осей из измеренных винрейтов STRATZ и вклад
// каждого героя. Ни одного выдуманного веса: ось либо есть в данных, либо её
// нет — см. src/api/draftStrength.ts.

import { useEffect, useState } from 'react'
import type { HeroInfo, MatchPlayer } from '../../api/types'
import { heroImageUrl } from '../../api/heroes'
import { getDraftData, rateDraft, type DraftPower as Power, type HeroPower } from '../../api/draftStrength'

const VERDICT_GAP = 1.5

function pct(n: number | null, digits = 1) {
  if (n === null || !Number.isFinite(n)) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}`
}

const plural = (n: number, one = 'пара', few = 'пары', many = 'пар') => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function Bar({ value, scale }: { value: number; scale: number }) {
  const w = `${Math.min(50, (Math.abs(value) / scale) * 50)}%`
  return (
    <span className="dr-mu-bar">
      <i className="mid" aria-hidden="true" />
      {value >= 0
        ? <i className="r" style={{ width: w, left: '50%' }} />
        : <i className="d" style={{ width: w, right: '50%' }} />}
    </span>
  )
}

function HeroLine({ h, heroMap }: { h: HeroPower; heroMap: Map<number, HeroInfo> }) {
  const hero = heroMap.get(h.player.heroId)
  const p = h.player
  return (
    <li className={`dp-hrow ${p.isRadiant ? 'r' : 'd'}`}>
      <span className={`port xs ${p.isRadiant ? 'r' : 'd'}`}>
        {hero && <img src={heroImageUrl(hero.shortName)} alt="" loading="lazy" />}
      </span>
      <span className="dp-hname">
        <b>{hero?.name ?? `герой #${p.heroId}`}</b>
        <span className="dim t12">{p.position ? `${p.position}-я роль` : 'роль неизвестна'}</span>
      </span>
      <span className="dp-hnums">
        <span title="как эта линия стояла против своей">
          <b>{h.laning === null ? '—' : `${(h.laning * 100).toFixed(0)}%`}</b> линия
        </span>
        <span title="нетворс к 35-й минуте против среднего по роли">
          <b>{h.late === null ? '—' : h.late.toFixed(2)}×</b> лейт
        </span>
        <span title="прирост винрейта с соседями по команде">
          <b>{pct(h.synergy === null ? null : h.synergy * 100)}</b> син
        </span>
        <span title="винрейт против героев другой команды">
          <b>{pct(h.counter === null ? null : h.counter * 100)}</b> контр
        </span>
      </span>
    </li>
  )
}

export default function DraftPower({ players, heroMap }: { players: MatchPlayer[]; heroMap: Map<number, HeroInfo> }) {
  const [power, setPower] = useState<Power | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    getDraftData()
      .then((data) => {
        if (!alive) return
        if (!data) { setFailed(true); return }
        setPower(rateDraft(data, players))
      })
      .catch(() => alive && setFailed(true))
    return () => { alive = false }
  }, [players])

  if (failed) {
    return (
      <section className="dp">
        <header className="chart-h">
          <div>
            <div className="chart-t">Кто сильнее на бумаге</div>
            <div className="chart-s">Файл с измеренными винрейтами не загрузился — оценку не показываем</div>
          </div>
        </header>
      </section>
    )
  }

  if (!power || !power.axes.length) return null

  const scale = Math.max(VERDICT_GAP * 2, ...power.axes.map((a) => Math.abs(a.edge)))
  const verdict = Math.abs(power.total) < VERDICT_GAP
    ? 'Драфты равны'
    : `На бумаге драфт лучше у ${power.total > 0 ? 'Radiant' : 'Dire'}`

  return (
    <section className="dp">
      <header className="chart-h">
        <div>
          <div className="chart-t">Кто сильнее на бумаге</div>
          <div className="chart-s">
            {verdict}: {pct(power.total)} пункта · {power.axes.length} осей из измеренных винрейтов
          </div>
        </div>
      </header>

      <ul className="dp-axes">
        {power.axes.map((a) => (
          <li key={a.key} className="dp-axis">
            <span className="dp-l">
              <b>{a.label}</b>
              <span className="dim t12">{a.detail}</span>
              <span className="dim t12">
                {a.pairs} {plural(a.pairs)} · {a.sample.toLocaleString('ru-RU')} измерений · посчитано {Math.round(a.coverage * 100)}% пар
              </span>
            </span>
            <Bar value={a.edge} scale={scale} />
            <span className="dp-n"><b className={a.edge > 0 ? 'pos' : a.edge < 0 ? 'neg' : 'dim'}>{pct(a.edge)}</b></span>
          </li>
        ))}
        <li className="dp-axis total">
          <span className="dp-l">
            <b>Итого</b>
            <span className="dim t12">среднее по {power.axes.length} осям, вес — доля посчитанных пар</span>
          </span>
          <Bar value={power.total} scale={scale} />
          <span className="dp-n"><b className={power.total > 0 ? 'pos' : power.total < 0 ? 'neg' : 'dim'}>{pct(power.total)}</b></span>
        </li>
      </ul>

      <div className="dp-teams">
        {([true, false] as const).map((radiant) => (
          <div key={radiant ? 'r' : 'd'} className={`dp-side ${radiant ? 'r' : 'd'}`}>
            <h4 className={`dr-team ${radiant ? 'r' : 'd'}`}>{radiant ? 'Radiant' : 'Dire'}</h4>
            <ul className="dp-hlist">
              {power.heroes.filter((h) => h.player.isRadiant === radiant).map((h) => (
                <HeroLine key={`${h.player.heroId}:${h.player.steamAccountId}`} h={h} heroMap={heroMap} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="pnote">
        Каждая ось — это винрейт, который STRATZ насчитал по своим разборам реплеев
        (агрегат по всем рангам, снимок {power.generated}): линия против линии, пара в
        одной команде, пара друг против друга, рост нетворса. Числа выше — край
        Radiant в пунктах винрейта, «Итого» — среднее по осям, где нашлись пары.
        {power.missing.length ? ` Осей без данных: ${power.missing.join(', ')}.` : ''} Это разбор состава на бумаге,
        а не прогноз: он не знает, кто как сыграет.
      </p>
    </section>
  )
}
