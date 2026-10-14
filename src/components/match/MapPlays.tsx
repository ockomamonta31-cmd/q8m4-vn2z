import { useState } from 'react'
import type { MapPlay, MapPlays } from '../../api/types'
import { fmtDuration } from '../../api/formats'
import { signed } from '../../api/score'

const kindName = { fight: 'Размен', rotation: 'Выход в бой', objective: 'Давление на объект', pressure: 'Продвижение линии' }
const cell = (v: number) => Math.max(0, Math.min(256, (v - 64) * 2))
const towerName = (key = '') => {
  const lane = key.endsWith('_top') ? 'верх' : key.endsWith('_bot') ? 'низ' : 'центр'
  const tier = key.match(/tower(\d)/)?.[1]
  return tier ? `T${tier}, ${lane}` : /rax/.test(key) ? `казармы, ${lane}` : 'трон'
}
function factsOf(e: MapPlay) {
  const f = e.facts
  if (e.kind === 'pressure') return `${f.creeps} вражеских крипов на чужой половине. Захват пространства не доказан.`
  if (e.kind === 'objective') return `${(f.damage ?? 0).toLocaleString('ru-RU')} урона по ${towerName(f.target)}. ${f.destroyed ? 'Объект уничтожен в течение 30 с.' : 'Объект остался цел.'}`
  return `Участие в ${f.kills} убийствах подтверждено уроном или добиванием и позицией; своих смертей ${f.deaths}. Рядом перед эпизодом: ${f.allies} союзных героев, включая игрока, и ${f.enemies} вражеских.`
}
function Route({ play, heroId }: { play: MapPlay; heroId: number }) {
  const segments: string[] = []
  let line = ''
  play.route.forEach((p, i) => {
    const prev = play.route[i - 1]
    // Do not draw teleports/respawns as movement across the whole map.
    if (p[3] !== 0 || prev && (prev[3] !== 0 || Math.hypot(p[1] - prev[1], p[2] - prev[2]) * 128 > 1800)) {
      if (line) segments.push(line)
      line = ''
    }
    if (p[3] === 0) line += `${cell(p[1])},${256 - cell(p[2])} `
  })
  if (line) segments.push(line)
  return <svg viewBox="0 0 256 256" role="img" aria-label={`Маршрут за ${fmtDuration(play.route[0]?.[0] ?? play.t)}–${fmtDuration(play.route.at(-1)?.[0] ?? play.end)}. Схема координат, без рельефа и видимости.`} style={{ width: '100%', maxWidth: 280, background: 'var(--bg-deep)', border: '1px solid var(--line)' }}>
    <path d="M32 224 L32 32 L224 32 M32 224 L224 224 L224 32 M32 224 L224 32" fill="none" stroke="var(--line)" strokeWidth="4" />
    <text x="8" y="248" fill="var(--text-dim)" fontSize="11">Radiant</text><text x="216" y="16" fill="var(--text-dim)" fontSize="11">Dire</text>
    {segments.map((points, i) => <polyline key={i} points={points} fill="none" stroke="var(--gold)" strokeWidth="2.5" />)}
    {play.heroes.filter(h => h.alive).map(h => <circle key={h.slot} cx={cell(h.x)} cy={256 - cell(h.y)} r={h.heroId === heroId ? 6 : 4} fill={h.heroId === heroId ? 'var(--gold)' : h.slot < 128 ? 'var(--radiant)' : 'var(--dire)'}><title>Герой #{h.heroId}, {h.slot < 128 ? 'Radiant' : 'Dire'} в {fmtDuration(play.t)}</title></circle>)}
  </svg>
}

export default function MapPlaysPanel({ plays }: { plays: MapPlays }) {
  const [selected, setSelected] = useState(0)
  const [filter, setFilter] = useState<'all' | 'after15'>('all')
  const episodes = plays.episodes.filter(e => filter === 'all' || e.t >= 900)
  const play = episodes[Math.min(selected, Math.max(0, episodes.length - 1))]
  return <section className="bld">
    <div className="bld-h"><b>Действия на карте</b><span className="dim">Координаты каждые {plays.sampleSeconds} с · покрытие {Math.round(plays.coverage * 100)}%</span></div>
    <p className="dim t12">На 15-й минуте: преимущество команды {signed(plays.teamGoldAt15)} золота. Нетворс игрока {plays.networthAt15?.toLocaleString('ru-RU') ?? 'неизвестен'}. Итог победы или поражения не меняет баланс эпизодов.</p>
    <p className="t14">{plays.good} положительных разменов и объектов · {plays.bad} отрицательных · {plays.neutral} нейтральных эпизодов.</p>
    <p className="dim t12">Баланс {plays.score === null ? 'недоступен' : signed(plays.score)} = 100 × (положительные − отрицательные) / (положительные + отрицательные). Равный размен нейтрален; неподтверждённое давление не даёт баллов. Это описание результатов, а не оценка того, был ли выбор оптимальным.</p>
    <div className="note-a">
      <button className="btn btn-q" aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setSelected(0) }}>Вся игра</button>
      <button className="btn btn-q" aria-pressed={filter === 'after15'} onClick={() => { setFilter('after15'); setSelected(0) }}>После 15-й минуты</button>
    </div>
    <label style={{ display: 'block', margin: '12px 0' }}>Эпизод
      <select style={{ display: 'block', width: '100%', padding: 8, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--line)' }} value={Math.min(selected, Math.max(0, episodes.length - 1))} onChange={e => setSelected(Number(e.target.value))}>
        {episodes.map((e, i) => <option key={i} value={i}>{fmtDuration(e.t)} · {kindName[e.kind]} · {e.verdict > 0 ? 'положительный' : e.verdict < 0 ? 'отрицательный' : 'нейтральный'}</option>)}
      </select>
    </label>
    {play ? <>
      <p className="t14">{factsOf(play)}</p>
      <p className="dim t12">Преимущество команды перед эпизодом: {signed(play.teamGold)} золота. {play.moved !== null && `Смещение за предыдущие 30 с: ${play.moved.toLocaleString('ru-RU')} ед. карты (включает телепорты).`}</p>
      <Route play={play} heroId={plays.heroId} />
      <p className="dim t12">Жёлтый — маршрут игрока и его позиция в начале события. Зелёные — Radiant, красные — Dire. Показаны истинные позиции из реплея; видимость команд, кулдауны и намерения пока не учитываются.</p>
    </> : <p className="dim">В этом промежутке нет подтверждённых эпизодов.</p>}
  </section>
}
