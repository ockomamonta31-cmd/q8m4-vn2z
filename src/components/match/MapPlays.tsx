import { useState } from 'react'
import type { MapPlay, MapPlays, MapStructure } from '../../api/types'
import { fmtDuration } from '../../api/formats'
import { signed } from '../../api/score'
import { heroImageUrl } from '../../api/heroes'
import heroes from '../../../server/data/constants/heroes.json'
import map from '../../../server/data/constants/map_741.json'

const kindName = { fight: 'Размен', rotation: 'Выход в бой', objective: 'Давление на объект', pressure: 'Продвижение линии' }
export const mapPoint = (x: number, y: number) => [512 * (x * 128 - map.projection.xmin) / (map.projection.xmax - map.projection.xmin), 512 * (map.projection.ymax - y * 128) / (map.projection.ymax - map.projection.ymin)]
const towerName = (key = '') => {
  const lane = key.endsWith('_top') ? 'верх' : key.endsWith('_bot') ? 'низ' : 'центр'
  const tier = key.match(/tower(\d)/)?.[1]
  return tier ? `T${tier}, ${tier === '4' ? 'у трона' : lane}` : /rax/.test(key) ? `казармы, ${lane}` : 'трон'
}
function factsOf(e: MapPlay) {
  const f = e.facts
  if (e.kind === 'pressure') return `${f.creeps} вражеских крипов на чужой половине. Захват пространства не доказан.`
  if (e.kind === 'objective') return `${(f.damage ?? 0).toLocaleString('ru-RU')} урона по ${towerName(f.target)}. ${f.destroyed ? 'Объект уничтожен в течение 30 с.' : 'Объект остался цел.'}`
  return `Участие в ${f.kills} убийствах подтверждено уроном или добиванием и позицией; своих смертей ${f.deaths}. Рядом перед эпизодом: ${f.allies} союзных героев, включая игрока, и ${f.enemies} вражеских.`
}
export function Route({ play, heroId, structures }: { play: MapPlay; heroId: number; structures?: MapStructure[] }) {
  const [expanded, setExpanded] = useState(false)
  const segments: string[] = []
  let line = ''
  play.route.forEach((p, i) => {
    const prev = play.route[i - 1]
    // Do not draw teleports/respawns as movement across the whole map.
    if (p[3] !== 0 || prev && (prev[3] !== 0 || Math.hypot(p[1] - prev[1], p[2] - prev[2]) * 128 > 1800)) {
      if (line) segments.push(line)
      line = ''
    }
    if (p[3] === 0) line += `${mapPoint(p[1], p[2]).join(',')} `
  })
  if (line) segments.push(line)
  const alive = play.route.filter(p => p[3] === 0)
  return <figure className={`dota-map${expanded ? ' expanded' : ''}`}>
    <div className="dota-map-heading"><span>{fmtDuration(play.route[0]?.[0] ?? play.t)}–{fmtDuration(play.route.at(-1)?.[0] ?? play.end)}</span><button type="button" className="btn btn-q" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Свернуть карту' : 'Увеличить карту'}</button></div>
    <svg viewBox="0 0 512 512" role="img" aria-label={`Карта Dota 2, маршрут и строения в ${fmtDuration(play.t)}. Истинные позиции из реплея без тумана войны.`}>
      <image href={map.image} width="512" height="512" />
      <rect width="512" height="512" fill="#06100a" opacity=".16" />
      {(structures?.length ? structures : map.structures).map((s: MapStructure, i) => {
        const [x,y] = mapPoint(s.x,s.y), tower = s.kind.endsWith('_Tower'), fort = s.kind.endsWith('_Fort'), fountain = s.kind.endsWith('_Fountain')
        const destroyed = s.destroyedAt != null && s.destroyedAt <= play.t
        const unknown = !structures?.length || !s.key || /tower4_/.test(s.key)
        const color = destroyed ? '#bdc5bf' : s.team === 2 ? '#79e6a0' : '#ff8b83'
        return <g key={i} transform={`translate(${x} ${y})`} opacity={destroyed ? .65 : 1}>
          <title>{`${s.team === 2 ? 'Radiant' : 'Dire'} · ${tower ? towerName(s.key) : fort ? 'трон' : fountain ? 'фонтан' : 'казармы'} · ${destroyed ? `уничтожен в ${fmtDuration(s.destroyedAt!)}` : unknown ? 'состояние не подтверждено' : 'не уничтожен к началу эпизода'}`}</title>
          {tower ? <><path d="M-7 8 V-6 L-3-10 H3 L7-6 V8Z" fill="#112219" stroke={color} strokeWidth="2" strokeDasharray={unknown ? '3 2' : undefined}/><text y="4" textAnchor="middle" fill={color} fontSize="11" fontWeight="700">{s.key?.match(/tower(\d)/)?.[1] ?? 'T'}</text></> : fort ? <path d="M0-10 L10 0 L0 10 L-10 0Z" fill="#112219" stroke={color} strokeWidth="3" strokeDasharray={unknown ? '3 2' : undefined} /> : <rect x="-4" y="-4" width="8" height="8" fill="#112219" stroke={color} strokeWidth="1.5" strokeDasharray={unknown ? '2 2' : undefined} />}
          {destroyed && <path d="M-7-7 L7 7 M7-7 L-7 7" stroke="#fff" strokeWidth="2.5" />}
        </g>
      })}
      {segments.map((points, i) => <g key={i}><polyline points={points} fill="none" stroke="#101909" strokeWidth="7" /><polyline points={points} fill="none" stroke="#ffde75" strokeWidth="3" /></g>)}
      {alive.length > 1 && [alive[0],alive.at(-1)!].map((p,i) => {const [x,y]=mapPoint(p[1],p[2]);return <g key={i}><circle cx={x} cy={y} r="8" fill="#102018" stroke="#ffde75" strokeWidth="2"/><text x={x} y={y+4} textAnchor="middle" fill="#ffde75" fontSize="11">{i ? 'Б' : 'А'}</text></g>})}
      {play.heroes.filter(h => h.alive).map(h => {
        const [x,y]=mapPoint(h.x,h.y), hero=heroes.find(p=>p.id===h.heroId), selected=h.heroId===heroId
        return <g key={h.slot} transform={`translate(${x} ${y})`}><title>{`${hero?.displayName ?? `Герой #${h.heroId}`} · ${h.slot < 128 ? 'Radiant' : 'Dire'} в ${fmtDuration(play.t)}`}</title>
          <rect x="-12" y="-9" width="24" height="18" fill="#112219" stroke={selected ? '#ffde75' : h.slot < 128 ? '#79e6a0' : '#ff8b83'} strokeWidth={selected ? 3 : 2}/>
          {hero && <image href={heroImageUrl(hero.shortName)} x="-11" y="-8" width="22" height="16" preserveAspectRatio="xMidYMid slice"/>}
        </g>
      })}
    </svg>
    <figcaption>Жёлтый маршрут: А → Б. Портреты — позиции в начале эпизода. Цифры — уровни башен; крест — уничтожена; пунктир — состояние неизвестно. Основа карты 7.41.</figcaption>
  </figure>
}

export default function MapPlaysPanel({ plays }: { plays: MapPlays }) {
  const [selected, setSelected] = useState(0)
  const [filter, setFilter] = useState<'all' | 'after15'>('all')
  const episodes = plays.episodes.filter(e => filter === 'all' || e.t >= 900)
  const play = episodes[Math.min(selected, Math.max(0, episodes.length - 1))]
  return <section className="bld map-plays">
    <div className="bld-h"><b>Действия на карте</b><span className="dim">Координаты каждые {plays.sampleSeconds} с · покрытие {Math.round(plays.coverage * 100)}%</span></div>
    <p className="dim t12">На 15-й минуте: преимущество команды {signed(plays.teamGoldAt15)} золота. Нетворс игрока {plays.networthAt15?.toLocaleString('ru-RU') ?? 'неизвестен'}. Итог победы или поражения не меняет баланс эпизодов.</p>
    <p className="t14">{plays.good} положительных разменов и объектов · {plays.bad} отрицательных · {plays.neutral} нейтральных эпизодов.</p>
    <p className="dim t12">Это баланс результатов эпизодов. Он не определяет, было ли решение оптимальным.</p>
    <details className="t12 dim"><summary>Как считается баланс</summary><p>Баланс {plays.score === null ? 'недоступен' : signed(plays.score)} = 100 × (положительные − отрицательные) / (положительные + отрицательные). Равный размен нейтрален; неподтверждённое давление не даёт баллов. Эпизоды имеют одинаковый вес; масштаб размена, видимость команд, кулдауны и доступные альтернативы не входят в этот индекс.</p></details>
    <div className="note-a">
      <button className="btn btn-q" aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setSelected(0) }}>Вся игра</button>
      <button className="btn btn-q" aria-pressed={filter === 'after15'} onClick={() => { setFilter('after15'); setSelected(0) }}>После 15-й минуты</button>
    </div>
    <label htmlFor={`map-play-${plays.heroId}`} style={{ display: 'block', margin: '12px 0 4px' }}>Эпизод</label>
      <select id={`map-play-${plays.heroId}`} style={{ display: 'block', width: '100%', padding: 8, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--line)' }} value={Math.min(selected, Math.max(0, episodes.length - 1))} onChange={e => setSelected(Number(e.target.value))}>
        {episodes.map((e, i) => <option key={i} value={i}>{fmtDuration(e.t)} · {kindName[e.kind]} · {e.verdict > 0 ? 'положительный' : e.verdict < 0 ? 'отрицательный' : 'нейтральный'}</option>)}
      </select>
    {play ? <div className="map-play-detail">
      <div>
      <p className="t14">{factsOf(play)}</p>
      <p className="dim t12">Преимущество команды перед эпизодом: {signed(play.teamGold)} золота. {play.moved !== null && `Смещение за предыдущие 30 с: ${play.moved.toLocaleString('ru-RU')} ед. карты (включает телепорты).`}</p>
      <p className="dim t12">Жёлтый — маршрут игрока и его позиция в начале события. Зелёные — Radiant, красные — Dire. Показаны истинные позиции из реплея; видимость команд, кулдауны и намерения пока не учитываются.</p>
      </div>
      <Route play={play} heroId={plays.heroId} structures={plays.structures} />
    </div> : <p className="dim">В этом промежутке нет подтверждённых эпизодов.</p>}
  </section>
}
