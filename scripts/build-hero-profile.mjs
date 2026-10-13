// Профиль героев из СОБСТВЕННОЙ базы матчей (server/data/matches/*.json).
// Ни одного стороннего винрейта: все числа — средние по матчам, которые мы
// сами вытащили из Steam Web API и положили к себе.
//
// Роль берём не из чужого разбора, а из порядка фарма внутри команды: 1-й по
// нетворсу — керри, 2-й — мид, 3-й — оффлейн, 4-й и 5-й — саппорты. Это ровно
// то, что Valve отдаёт по каждому игроку (net_worth, gpm, xpm, lh, урон,
// лечение), без внешних интерпретаций.
//
// Выход — server/data/constants/hero_profile.json:
//   hero[heroId][role]  — средние за матч и винрейт героя на этой роли
//   baseline[role]      — среднее по всем героям на этой роли (знаменатель)
//   pair[a,b]           — сколько раз герои играли в одной команде и сколько
//                         из этих матчей выиграны (для синергии)
//   meta                — размер корпуса и правила отсечения
//
// Запуск: node scripts/build-hero-profile.mjs

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MATCHES = join(ROOT, 'server', 'data', 'matches')
const OUT = join(ROOT, 'server', 'data', 'constants', 'hero_profile.json')

const MIN_MATCH = 12 * 60 // матчи короче 12 минут ничего не говорят о драфте
const MIN_PAIR = 12       // пар с меньшей выборкой в синергии не показываем

const METRICS = [
  'goldPerMinute', 'experiencePerMinute', 'numLastHits', 'numDenies',
  'kills', 'deaths', 'assists', 'networth', 'level',
  'heroDamage', 'towerDamage', 'heroHealing', 'scaledHeroDamage',
]

const files = readdirSync(MATCHES).filter((f) => f.endsWith('.json'))
const acc = new Map()      // hero → role → суммы
const base = new Map()     // role → суммы по всем героям
const pairs = new Map()    // "a:b" (a<b) → { games, wins }
const heroTotals = new Map()
let used = 0
let skipped = 0
let durationSum = 0

const bucket = () => ({ games: 0, wins: 0, ...Object.fromEntries(METRICS.map((m) => [m, 0])) })

function add(target, player, won) {
  target.games += 1
  target.wins += won ? 1 : 0
  for (const m of METRICS) target[m] += Number(player[m]) || 0
}

for (const f of files) {
  let match
  try {
    match = JSON.parse(readFileSync(join(MATCHES, f), 'utf8'))
  } catch { skipped++; continue }
  const players = match.players ?? []
  if (players.length !== 10) { skipped++; continue }
  if ((match.durationSeconds ?? 0) < MIN_MATCH) { skipped++; continue }
  if (players.some((p) => !p.heroId)) { skipped++; continue }
  used += 1
  durationSum += match.durationSeconds
  const won = match.didRadiantWin

  for (const radiant of [true, false]) {
    const side = players
      .filter((p) => p.isRadiant === radiant)
      .sort((a, b) => (b.networth - a.networth) || (b.goldPerMinute - a.goldPerMinute))
    side.forEach((p, i) => {
      const role = i + 1
      const byRole = acc.get(p.heroId) ?? acc.set(p.heroId, new Map()).get(p.heroId)
      add(byRole.get(role) ?? byRole.set(role, bucket()).get(role), p, radiant === won)
      const b = base.get(role) ?? base.set(role, bucket()).get(role)
      add(b, p, radiant === won)
      const t = heroTotals.get(p.heroId) ?? heroTotals.set(p.heroId, bucket()).get(p.heroId)
      add(t, p, radiant === won)
    })
    for (let i = 0; i < side.length; i++) {
      for (let j = i + 1; j < side.length; j++) {
        const a = Math.min(side[i].heroId, side[j].heroId)
        const b = Math.max(side[i].heroId, side[j].heroId)
        const key = `${a}:${b}`
        const p = pairs.get(key) ?? pairs.set(key, { games: 0, wins: 0 }).get(key)
        p.games += 1
        p.wins += radiant === won ? 1 : 0
      }
    }
  }
}

/** Доля побед с ниж границей Уилсона — чтобы 2/2 не выглядело как 100%. */
function wilson(wins, games, z = 1.96) {
  if (!games) return 0.5
  const p = wins / games
  const d = 1 + (z * z) / games
  const c = p + (z * z) / (2 * games)
  const h = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * games)) / games)
  return Math.max(0, Math.min(1, (c - h) / d))
}

const round = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n

const avg = (b) => {
  const out = { games: b.games, wins: b.wins, winRate: round(b.games ? b.wins / b.games : 0, 3), floor: round(b.games ? wilson(b.wins, b.games) : 0, 3) }
  for (const m of METRICS) out[m] = round(b.games ? b[m] / b.games : 0, 1)
  return out
}

const hero = {}
for (const [id, byRole] of acc) {
  const roles = {}
  for (const [role, b] of byRole) if (b.games >= 3) roles[role] = avg(b)
  if (Object.keys(roles).length) hero[id] = { all: avg(heroTotals.get(id)), roles }
}

const baseline = {}
for (const [role, b] of base) baseline[role] = avg(b)

const keptPairs = {}
for (const [key, p] of pairs) if (p.games >= MIN_PAIR) keptPairs[key] = { games: p.games, wins: p.wins, winRate: round(p.wins / p.games, 3), floor: round(wilson(p.wins, p.games), 3) }

const out = {
  v: 1,
  generated: new Date().toISOString().slice(0, 10),
  source: 'Собственная база матчей (Steam Web API, нормализация server/index.mjs). Роли — порядок фарма внутри команды.',
  metrics: METRICS,
  meta: {
    matches: used,
    skipped,
    players: used * 10,
    heroes: Object.keys(hero).length,
    minMatchSeconds: MIN_MATCH,
    minPairGames: MIN_PAIR,
    /** средняя длительность: кумулятивные статы пересчитываются на неё */
    avgDurationSeconds: Math.round(durationSum / Math.max(1, used)),
    roleOf: '1 керри, 2 мид, 3 оффлейн, 4 и 5 саппорты — по нетворсу в команде',
  },
  hero,
  baseline,
  pair: keptPairs,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(out))
console.log(`матчей взято ${used} (пропущено ${skipped}), героев ${out.meta.heroes}, пар с n≥${MIN_PAIR}: ${Object.keys(keptPairs).length}`)
console.log(`профилей роль→герой: ${Object.values(hero).reduce((n, h) => n + Object.keys(h.roles).length, 0)}`)
console.log('baseline роли 1:', JSON.stringify(baseline[1]))
console.log('герой 1:', JSON.stringify(hero[1]?.roles?.[1] ?? null))
console.log(`${OUT} — ${(JSON.stringify(out).length / 1024).toFixed(0)} КБ`)
