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

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MATCHES = join(ROOT, 'server', 'data', 'matches')
const DRAFTS = join(ROOT, 'server', 'data', 'drafts')
const OUT = join(ROOT, 'server', 'data', 'constants', 'hero_profile.json')

const MIN_MATCH = 12 * 60 // матчи короче 12 минут ничего не говорят о драфте
const MIN_PAIR = 12       // пар с меньшей выборкой в синергии не показываем

const METRICS = [
  'goldPerMinute', 'experiencePerMinute', 'numLastHits', 'numDenies',
  'kills', 'deaths', 'assists', 'networth', 'level',
  'heroDamage', 'towerDamage', 'heroHealing', 'scaledHeroDamage',
]

/**
 * Кит-профиль (секунды хард-дизейбла и урон способностей из файлов Valve) и
 * норма по роли: саппорт с 3 секундами стана — это много, керри с 3 — тоже
 * много, но сравнить их можно только относительно роли.
 *
 * Для ЛИНИИ берётся не максимум прокачки, а уровень способности на 10-й
 * минуте — измеренный по нашим матчам (ability_upgrades есть у каждого
 * игрока). Ульт Бейна в 6 секунд к 10-й минуте у половины героев просто нет,
 * и считать его в контроль линии — врать.
 */
let kit = {}
let laneBaseline = {}
const laneLevels = new Map()   // hero → abilityId → { levels: сумма, n: наблюдений }
try {
  kit = JSON.parse(readFileSync(join(ROOT, 'server', 'data', 'constants', 'hero_kit.json'), 'utf8')).kit ?? {}
} catch {
  console.log('hero_kit.json не найден — контроль способностей в профиль не войдёт (запусти npm run kit:build)')
}

const LANE_LEVEL_SECONDS = 600

function recordLaneLevels(heroId, upgrades) {
  // Пустой список — это отсутствие данных, а не «ничего не качал»: такие
  // строки нулями тянут средний уровень вниз.
  if (!upgrades?.length) return
  const byId = new Map()
  for (const u of upgrades) {
    if (!(Number(u.time) <= LANE_LEVEL_SECONDS)) continue
    byId.set(u.ability, (byId.get(u.ability) ?? 0) + 1)
  }
  const acc = laneLevels.get(heroId) ?? new Map()
  const seen = new Set()
  for (const [abilityId, level] of byId) {
    acc.set(abilityId, { levels: (acc.get(abilityId)?.levels ?? 0) + level, n: (acc.get(abilityId)?.n ?? 0) + 1 })
    seen.add(abilityId)
  }
  // умение, не взятое вообще, тоже наблюдение: иначе среднее уровень завысится
  for (const a of kit[heroId]?.abilities ?? []) {
    if (a.id && !seen.has(a.id)) acc.set(a.id, { levels: acc.get(a.id)?.levels ?? 0, n: (acc.get(a.id)?.n ?? 0) + 1 })
  }
  laneLevels.set(heroId, acc)
}

/**
 * Значение способности на дробном уровне. Дробный — потому что берём среднее
 * по матчам: 0,2 уровня = умение есть у каждого пятого к 10-й минуте, и это
 * честнее нуля (умение всё-таки появляется в линии) и честнее единицы.
 */
function atLevel(values, level) {
  if (!values?.length || level <= 0) return 0
  if (level < 1) return (Number(values[0]) || 0) * level
  const i = Math.min(values.length, Math.floor(level))
  const cur = Number(values[i - 1]) || 0
  const next = Number(values[Math.min(values.length - 1, i)]) ?? cur
  return cur + (level - i) * Math.max(0, next - cur)
}

function laneKitOf(heroId) {
  const acc = laneLevels.get(heroId)
  const abilities = kit[heroId]?.abilities ?? []
  if (!acc || !abilities.length) return null
  let control = 0
  let burst = 0
  const spells = []
  for (const a of abilities) {
    if (!a.id) continue
    const seen = acc.get(a.id)
    if (!seen || !seen.n) continue
    const level = seen.levels / seen.n
    const c = atLevel(a.controlLevels, level)
    control += c
    burst += atLevel(a.burstLevels, level)
    if (round(c, 1) >= 0.3) spells.push({ name: a.name, title: a.title ?? a.name, level: round(level, 1), control: round(c, 1) })
  }
  return {
    control: round(control, 1),
    burst: Math.round(burst),
    spells: spells.sort((x, y) => y.control - x.control),
  }
}


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
  let draft = null
  try {
    match = JSON.parse(readFileSync(join(MATCHES, f), 'utf8'))
    draft = existsSync(join(DRAFTS, f)) ? JSON.parse(readFileSync(join(DRAFTS, f), 'utf8')) : null
  } catch { skipped++; continue }
  const players = match.players ?? []
  if (players.length !== 10) { skipped++; continue }
  if ((match.durationSeconds ?? 0) < MIN_MATCH) { skipped++; continue }
  if (players.some((p) => !p.heroId)) { skipped++; continue }
  used += 1
  durationSum += match.durationSeconds
  const won = match.didRadiantWin

  const roleOfDraft = (p, radiant) => draft?.roles?.[`${radiant ? 'r' : 'd'}:${p.heroId}`]?.position ?? 0

  for (const radiant of [true, false]) {
    const members = players.filter((p) => p.isRadiant === radiant)
    // Роль берём из разбора матча (STRATZ lane/position), а не из порядка фарма:
    // нетворс в катке ставит саппорта выше мидера, и профиль героя начинает
    // описывать не его роль, а чужую. Если разбора нет у всех пятерых —
    // остаёмся на порядке фарма, он хотя бы согласован внутри команды.
    const real = members.every((p) => roleOfDraft(p, radiant) >= 1 && roleOfDraft(p, radiant) <= 5)
    const side = real
      ? [...members].sort((a, b) => roleOfDraft(a, radiant) - roleOfDraft(b, radiant))
      : [...members].sort((a, b) => (b.networth - a.networth) || (b.goldPerMinute - a.goldPerMinute))
    side.forEach((p, i) => {
      const role = real ? roleOfDraft(p, radiant) : i + 1
      const byRole = acc.get(p.heroId) ?? acc.set(p.heroId, new Map()).get(p.heroId)
      add(byRole.get(role) ?? byRole.set(role, bucket()).get(role), p, radiant === won)
      const b = base.get(role) ?? base.set(role, bucket()).get(role)
      add(b, p, radiant === won)
      const t = heroTotals.get(p.heroId) ?? heroTotals.set(p.heroId, bucket()).get(p.heroId)
      add(t, p, radiant === won)
      recordLaneLevels(p.heroId, p.abilityUpgrades)
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

/**
 * Контроль и урон спелов на 10-й минуте — по уровням умений, которые реально
 * качают к этому времени. Максимум умений не годится: ульт Бейна в 6 секунд к
 * линии отношения не имеет.
 */
const lane = {}
for (const heroId of Object.keys(kit)) {
  const l = laneKitOf(Number(heroId))
  if (l) lane[heroId] = l
}
{
  const sums = new Map()
  for (const [hero, byRole] of acc) {
    const l = lane[hero]
    if (!l) continue
    for (const [role, b] of byRole) {
      if (!b.games) continue
      const run = sums.get(role) ?? { control: { v: 0, n: 0 }, burst: { v: 0, n: 0 } }
      run.control.v += l.control * b.games
      run.control.n += b.games
      run.burst.v += l.burst * b.games
      run.burst.n += b.games
      sums.set(role, run)
    }
  }
  for (const [role, run] of sums) {
    const per = (x) => (x.n ? round(x.v / x.n, 2) : 0)
    laneBaseline[role] = { control: per(run.control), burst: per(run.burst) }
  }
}

const out = {
  v: 2,
  generated: new Date().toISOString().slice(0, 10),
  source: 'Собственная база матчей (Steam Web API, нормализация server/index.mjs). Роли — из разбора матча, где он есть.',
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
    roleOf: '1 керри, 2 мид, 3 оффлейн, 4 и 5 саппорты — настоящая роль из разбора матча, а где её нет — порядок фарма в команде',
  },
  hero,
  baseline,
  pair: keptPairs,
  lane,
  laneBaseline,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(out))
console.log(`матчей взято ${used} (пропущено ${skipped}), героев ${out.meta.heroes}, пар с n≥${MIN_PAIR}: ${Object.keys(keptPairs).length}`)
console.log(`профилей роль→герой: ${Object.values(hero).reduce((n, h) => n + Object.keys(h.roles).length, 0)}`)
console.log('baseline роли 1:', JSON.stringify(baseline[1]))
console.log('герой 1:', JSON.stringify(hero[1]?.roles?.[1] ?? null))
console.log('lane baseline по ролям:', JSON.stringify(laneBaseline))
for (const id of [1, 34, 27, 8]) {
  const l = lane[id]
  console.log('  герой', id, '· контроль на 10-й минуте', l?.control, '· урон спелов', l?.burst, '·', (l?.spells ?? []).map((s) => `${s.title} ${s.control}c (ур. ${s.level})`).join(', '))
}
console.log(`${OUT} — ${(JSON.stringify(out).length / 1024).toFixed(0)} КБ`)
