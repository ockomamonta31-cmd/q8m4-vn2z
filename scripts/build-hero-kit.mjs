// Кит-профиль героя — что его способности реально делают в текущем патче.
// Числа из игровых файлов Valve (через словари OpenDota), никаких оценок «на
// глаз»: длительность контроля берётся из атрибутов способности, урон — из
// значений первого уровня.
//
// Главная тонкость, на которой первая версия врала: «длительность» в файлах
// есть у всего на свете — у замедления, у визуалки, у канала Freezing Field, у
// стаков. Контролем это делает ТЕКСТ способности: stun / disarm / root / sleep /
// banish / cyclone / petrify / immobilize / «prohibiting movement» / «holding
// it in place». Поэтому сначала проверяем описание, и только потом берём
// длительность.
//
// Выход — server/data/constants/hero_kit.json:
//   kit[heroId] = { control, burst, heal, escapes, castables, abilities[] }
//     control — секунды хард-дизейбла (макс. уровень способности, до 6 с на
//               способность, сумма по герою)
//     burst   — урон способностей с первого уровня (линия начинается на 1-м)
//     heal    — лечение союзникам с первого уровня
//     escapes — сколько способностей меняют позицию (blink/leap/roll/tp)
//
// Запуск: node scripts/build-hero-kit.mjs [--check]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'server', 'data', 'constants', 'hero_kit.json')

const get = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

/** Хард-дизейбл: мешает бить, двигаться или кастовать. Формы слов разные. */
const HARD = /\b(stuns?|stunned|stunning|disarms?|disarming|disabl(?:e|es|ed|ing)|silenc(?:e|es|ed|ing)|roots?|rooted|rooting|sleeps?|putting? .{0,15}to sleep|banish(?:es|ed|ing)?|cyclone(?:s|ed)?|petrif(?:y|ies|ied)|minifoot(?:s|ed)?|impal(?:e|es|ed)|entangle(?:s|d|ment)?|immobilis|immobiliz|stasis|trapping|freez\w*[^.]{0,20}in place|prohibit(?:ing|s)? movement|unable to (?:move|act|use|cast)|(?:can'?t|cannot) (?:move|act|use|pass|attack|cast)|prevent(?:s|ing|ed)? [^.]{0,45}from casting|forc(?:e|es|ed)[^.]{0,25}to attack|taunts?|holds? (?:it|him|her|the target|an enemy|them)|holding (?:it|him|her|the target|an enemy)|holds? .{0,15}in place|travels? .{0,20}and stuns)\b/i
/** Дизейбл считается дизейблом, если он направлен на чужого юнита. */
const ENEMY = /\benem\w*|\bfoes?\b|\bvictims?\b|hostile/i
/** «unit/target/hero» сами по себе не говорят, чужой ли юнит: тогда нужен текст без союзника. */
const VICTIM = /\b(?:targets?|targeted|units?|creeps?|heroes?|players?)\b/i
const ALLY = /\ball(?:y|ies)\b|friendly|teammate|invulnerab/i
/** Атрибут контроля: слово-дизейбл в ключе или заголовке, с duration или без. */
const CONTROL_WORD = /stun|sleep|disarm|silenc|root|toss|banish|minifoot|impale|bash|freeze|cyclone|hex|daze|fear|taunt|entangle|leash|hold|grasp|disable|kinetic/i
/** Для урона и лечения эти слова — служебные, а не поля со значением. */
const NOT_A_NUMBER = /percent|tooltip|multiplier|threshold|interval|delay|radius|speed|width|range|cap|stack_limit|charges_required|mana/i
const ANY_DURATION = /duration|_time$|^time$/i
const DAMAGE_KEY = /(?:^|_)(?:damage|dmg)(?:$|_)/i
const HEAL_KEY = /(?:^|_)(?:heal|restored_health|health_regen_restored)(?:$|_)/i
const MOVE = /\b(blinks?|teleports?|leaps?|dashes?|rolls? toward|jumps toward|charges? toward|propels)\b/i
const MAX_CONTROL_PER_ABILITY = 6

const num = (v) => {
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const levels = (values) => {
  const list = (Array.isArray(values) ? values : [values]).map(num)
  if (!list.length) return { first: 0, max: 0 }
  return { first: list[0], max: list[list.length - 1] }
}

/**
 * Длительность контроля способности. Контролем способность объявляет её
 * описание (стан/дизейбл/рут/силент/холд/таунт), а число берётся по приоритету:
 *   2 — атрибут сам себя называет дизейблом: stun_duration, hold_duration,
 *       arrow_max_stun, lift_duration;
 *   1 — обычная duration у способности, ТЕКСТ которой объявляет дизейбл
 *       (Frostbite — «unable to move», Fiend's Grip — «disabling it»).
 * Без текста под duration живёт слом, дебафф или визуалка: так Tinker получал
 * «2 секунды стана» из DEBUFF DURATION. Канал сам по себе контролем не считается —
 * Freezing Field идёт 10 секунд, но он замедляет, а не держит.
 */
const NOT_A_DURATION = /slow|vision|reveal|stack|buff|debuff|percent|tooltip|aura|grow|windup|cast|cooldown|tick|interval|delay|threshold|charge|limit|amount|multiplier|barrier|supercharge|burn|mana|hits|counter|protection|increment|gather|radius|speed|width|range|flight|soar|ride|swim|recall|hero|creep|minion|illusion/i

/**
 * Атрибуты, которые САМИ себя называют контролем: `stun_duration`,
 * `hold_duration`, `arrow_max_stun`, `stun_min`.
 * CURATED — то, что правилом не ловится: число лежит в атрибуте с безликим
 * заголовком («LATCH DURATION», «DEBUFF DURATION»), а дизейбл объявлен только
 * текстом способности. Список короткий и проверяемый.
 */
const NAMED_CONTROL_VALUE = /(?:^|_)(?:stun|hold|sleep|disarm|root|banish|toss|impale|minifoot|entangle|grasp|cyclone|hex|fear|taunt|daze|bash)(?:_(?:min|max))?$/i
const CURATED = {
  grimstroke_ink_creature: 'latch_duration',
  tinker_warp_grenade: 'debuff_duration',
  spirit_breaker_bull_rush: 'hero_duration',
}
function controlAttribTier(key, head, hard) {
  const s = `${key} ${head}`
  if (NAMED_CONTROL_VALUE.test(key)) return 2
  if (CONTROL_WORD.test(s) && ANY_DURATION.test(s)) return 2
  // Обычная duration берётся только у способности, которая текстом объявила
  // дизейбл: иначе под duration прячутся полёт, езда, баффы и сломы.
  if (!hard || !ANY_DURATION.test(s)) return 0
  if (NOT_A_DURATION.test(s) || /^(?:max|bonus)_/.test(key)) return 0
  return 1
}

/**
 * Что контролем НЕ является, хотя в тексте есть слово «disable/stun»:
 *  — снятие дизейблов с союзника (Legion Press the Attack, Oracle False Promise);
 *  — «эти лучи НЕ оглушают» (Luna Eclipse);
 *  — отключение пассивок (Viper Strike) — это не лишает движения и не станит;
 *  — направлено на союзника (Oracle Edict держит союзного героя).
 */
const NOT_CONTROL = /\bdo(?:es)? not\s+(?:stun|root|disarm|disable)|removes? (?:most )?(?:debuffs?|disables?|negative|status)|\bdisabling (?:their |all )?passives?|duration is paused|as long as [^.]{0,30}(?:silenc|stun|disabl|root)|(?:target|allied|friendly) (?:unit|hero|ally)s?\b[^.]{0,40}(?:disarm|stun|root|disable)|(?:disarm|stun|root|disable)[^.]{0,40}\b(?:all(?:y|ies)|friendly|teammate)/i

/**
 * Дизейбл ищем по ПРЕДЛОЖЕНИЯМ: в предложении должно быть слово-дизейбл про
 * чужого юнита и не должно быть союзника/самого героя. Иначе Clockwerk с
 * Jetpack («не может атаковать» — про себя, 6 секунд), Centaur с Mount
 * («союзник в телеге») и Silencer с Curse («длительность паузится, пока цель
 * заглушена») записывались в контроль линии.
 */
function hardSentenceOf(desc) {
  return desc.split(/(?<=\.)\s+/).find((s) => !NOT_CONTROL.test(s) && HARD.test(s) && (ENEMY.test(s) || (VICTIM.test(s) && !ALLY.test(s)))) ?? null
}

/**
 * Для каждой способности храним контроль и урон ПО УРОВНЯМ, а не максимум:
 * на линии у героя уровень 4–6 и прокачка 1–2 очков в умение, поэтому
 * «стан 6 секунд на максимуме» к линии отношения не имеет (это замечание
 * про Бейна было ровно про это). Уровни на 10-й минуте измеряются по нашим
 * матчам в build-hero-profile.mjs.
 */
function controlOf(ability, abilityName, hard) {
  let tier = 0
  const groups = new Map()
  for (const a of ability?.attrib ?? []) {
    const key = String(a.key ?? '')
    const head = String(a.header ?? '')
    const t = CURATED[abilityName] === key ? 2 : controlAttribTier(key, head, hard)
    if (!t) continue
    const list = (Array.isArray(a.value) ? a.value : [a.value]).map(num)
    if (!(Math.max(...list) > 0 && Math.max(...list) <= 10)) continue
    if (t > tier) { tier = t; groups.clear() }
    if (t !== tier) continue
    const isPair = /_(?:min|max)$/i.test(key)
    const core = key.replace(/_(?:min|max)$/i, '')
    const group = groups.get(core) ?? { paired: [], single: [] }
    ;(isPair ? group.paired : group.single).push(list)
    groups.set(core, group)
  }
  const lists = []
  for (const group of groups.values()) {
    // «stun_min» + «stun_max» — это разброс одного стана, честнее среднее.
    if (group.paired.length === 2) lists.push(group.paired[0].map((v, i) => (v + (group.paired[1][i] ?? v)) / 2))
    else lists.push(...group.paired, ...group.single)
  }
  const out = []
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) out[i] = Math.max(out[i] ?? 0, Math.min(MAX_CONTROL_PER_ABILITY, list[i] || 0))
  }
  return { levels: out.map((v) => Math.round(v * 100) / 100), tier }
}

function perLevel(ability, kind) {
  const out = []
  for (const a of ability?.attrib ?? []) {
    const key = String(a.key ?? '')
    const head = String(a.header ?? '')
    const s = `${key} ${head}`
    if (NOT_A_NUMBER.test(s)) continue
    const wanted = kind === 'burst' ? DAMAGE_KEY.test(key) || /damage/i.test(head) : HEAL_KEY.test(key) || /heal/i.test(head)
    if (!wanted) continue
    const list = (Array.isArray(a.value) ? a.value : [a.value]).map(num)
    // Одиночное число больше 500 — это формула, а не урон первого уровня
    // (Soul Assumption отдаёт 3092 «максимум при 5 стаках»).
    if (list.length === 1 && list[0] > 500) continue
    for (let i = 0; i < list.length; i++) out[i] = (out[i] ?? 0) + (list[i] || 0)
  }
  return out.map((v) => Math.round(v * 100) / 100)
}

function summarize(ability, abilityName) {
  const desc = String(ability?.desc ?? '').replace(/\s+/g, ' ')
  const attribs = ability?.attrib ?? []
  let burst = 0
  let heal = 0
  for (const a of attribs) {
    const key = String(a.key ?? '')
    const head = String(a.header ?? '')
    const s = `${key} ${head}`
    if (NOT_A_NUMBER.test(s)) continue
    const { first } = levels(a.value)
    if (HEAL_KEY.test(key) || /heal/i.test(head)) heal += first
    else if (DAMAGE_KEY.test(key) || /damage/i.test(head)) burst += first <= 700 ? first : 0
  }
  const sentence = hardSentenceOf(desc) ?? ''
  const ctl = sentence ? controlOf(ability, abilityName, true) : { levels: [], tier: 0 }
  return {
    control: ctl.levels.length ? Math.max(...ctl.levels) : 0,
    controlLevels: ctl.levels,
    tier: ctl.tier,
    sentence,
    burstLevels: perLevel(ability, 'burst'),
    burst,
    heal,
    moves: MOVE.test(desc) ? 1 : 0,
  }
}

const [heroesList, heroAbilities, abilities, abilityLookup] = await Promise.all([
  get('https://api.opendota.com/api/heroes'),
  get('https://api.opendota.com/api/constants/hero_abilities'),
  get('https://raw.githubusercontent.com/odota/dotaconstants/master/build/abilities.json'),
  Promise.resolve(JSON.parse(readFileSync(join(ROOT, 'server', 'data', 'constants', 'ability_lookup.json'), 'utf8'))),
])

/** id способности из Steam → имя в файлах Valve: по нему сверяем прокачку из матчей. */
const idOfAbility = new Map(Object.entries(abilityLookup).map(([id, a]) => [a.key || a.name, Number(id)]))

const idByName = new Map(heroesList.map((h) => [h.name, h.id]))
const kit = {}
const missed = []
const inferred = []

for (const [npcName, entry] of Object.entries(heroAbilities)) {
  const id = idByName.get(npcName)
  if (!id) continue
  const parts = (entry?.abilities ?? [])
    .filter((k) => k && abilities[k])
    .map((k) => ({ name: k, id: idOfAbility.get(k) ?? null, ...summarize(abilities[k], k) }))
  const short = npcName.replace('npc_dota_hero_', '')
  for (const p of parts) {
    if (p.sentence && !p.controlLevels.length) missed.push(`${short} · ${p.name}`)
    if (p.tier === 1 && p.controlLevels.length) inferred.push(`${short} · ${p.name} ${p.controlLevels.join('/')} c ← «${p.sentence.slice(0, 90)}»`)
  }
  kit[id] = {
    control: Math.round(parts.reduce((a, p) => a + p.control, 0) * 10) / 10,
    burst: Math.round(parts.reduce((a, p) => a + p.burst, 0)),
    heal: Math.round(parts.reduce((a, p) => a + p.heal, 0)),
    escapes: parts.reduce((a, p) => a + p.moves, 0),
    castables: (entry?.abilities ?? []).filter((k) => abilities[k]?.behavior).length,
    abilities: parts.filter((p) => p.control || p.burstLevels.length || p.controlLevels.length).map((p) => ({
      name: p.name,
      id: p.id,
      title: (p.id && abilityLookup[p.id]?.name) || p.name,
      control: Math.round(p.control * 10) / 10,
      controlLevels: p.controlLevels,
      burstLevels: p.burstLevels,
    })),
  }
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({
  v: 2,
  generated: new Date().toISOString().slice(0, 10),
  source: 'Игровые файлы Valve через словари OpenDota: heroes, constants/hero_abilities, dotaconstants/abilities.json',
  note: 'control — секунды хард-дизейбла (определяется по тексту способности), burst и heal — значения первого уровня, escapes — сколько способностей меняют позицию',
  kit,
}))

const name = new Map(heroesList.map((h) => [h.id, h.name.replace('npc_dota_hero_', '')]))
const byName = (n) => kit[heroesList.find((h) => h.name === `npc_dota_hero_${n}`)?.id]

if (process.argv.includes('--check')) {
  // Ожидаем то, что видно руками по описаниям текущего патча.
  const expected = {
    crystal_maiden: ['Frostbite рут; Nova — слом; Freezing Field — канал'],
    lina: ['Light Strike Array — стан'],
    pudge: ['Hook стан + Dismember холд'],
    mirana: ['Arrow стан до 5 с'],
    axe: ['Berserker Call — таунт'],
    winter_wyvern: ["Winter's Curse — заморозка, а не Cold Embrace на союзнике"],
    bane: ['Nightmare сон + Fiend Grip холд, оба по уровням'],
    faceless_void: ['Chronosphere — стасис'],
    rattletrap: ['Power Cogs — холд; Jetpack НЕ контроль'],
    centaur: ['Hoof Stomp; Mount (союзник в телеге) НЕ контроль'],
    hoodwink: ['Bushwhack стан (в атрибуте называется debuff_duration)'],
    legion_commander: ['Duel — холд'],
    disruptor: ['Kinetic Field — стен'],
    earthshaker: ['Fissure стан, Echo Slam стан'],
    antimage: ['хард-дизейбла нет'],
    juggernaut: ['хард-дизейбла нет'],
    sven: ['Storm Bolt стан + God’s Strength нет'],
  }
  for (const [hero, note] of Object.entries(expected)) {
    const k = byName(hero)
    const list = (k?.abilities ?? []).filter((a) => a.controlLevels.length).map((a) => `${a.name}: ${a.controlLevels.join('/')} c по уровням`).join(' | ')
    console.log(`${hero.padEnd(18)} контроль макс ${String(k?.control).padStart(4)} c
    ${list || '—'}
    — ${note}`)
  }
}

const rows = Object.entries(kit).map(([id, k]) => [name.get(+id), k.control]).sort((a, b) => b[1] - a[1])
console.log(`героев: ${Object.keys(kit).length}`)
console.log('топ контроля:', rows.slice(0, 10).map((r) => `${r[0]} ${r[1]}`).join(', '))
console.log('нулевой:', rows.filter((r) => !r[1]).length, 'из', rows.length)

if (process.argv.includes('--audit')) {
  // Текст объявляет дизейбл, а числа в атрибутах не нашли — кандидат в CURATED.
  console.log(`\nДизейбл в тексте, но без числа (${missed.length}):`)
  for (const m of missed) console.log('  ', m)
  // Число взято из обычной duration только потому, что текст обещает дизейбл —
  // самый спорный класс, его и проверяем глазами.
  console.log(`\nКонтроль по одному только тексту (${inferred.length}):`)
  for (const i of inferred) console.log('  ', i)
}
