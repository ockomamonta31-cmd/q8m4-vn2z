import active from '../../server/data/constants/active_items.json'
import kitData from '../../server/data/constants/hero_kit.json'
import { heroName } from './training'
import type { MatchPlayer, PlayerEvidence } from './types'

// Активные предметы: их применение встречается в разобранных реплеях. У
// пассивного предмета нельзя спрашивать "применения в драках", поэтому он в
// проверку не попадает.
const ACTIVE = new Set(active.items as string[])
export const isActiveItem = (key: string) => ACTIVE.has(key)

// Расходники и предметы-переключатели: их отсутствие в записях драк ничего не
// говорит о сборке, поэтому в проверку применения они не попадают.
const NOT_A_CHOICE = new Set([
  'tpscroll', 'ward_observer', 'ward_sentry', 'ward_dispenser', 'dust', 'smoke_of_deceit', 'clarity', 'tango', 'tango_single',
  'flask', 'faerie_fire', 'enchanted_mango', 'famango', 'great_famango', 'greater_famango', 'cheese', 'branches', 'bottle',
  'magic_stick', 'magic_wand', 'blood_grenade', 'quelling_blade', 'infused_raindrop', 'bfury', 'hand_of_midas', 'phase_boots',
  'power_treads', 'arcane_boots', 'boots_of_bearing', 'armlet', 'radiance', 'mask_of_madness', 'moon_shard', 'soul_ring',
  'urn_of_shadows', 'foragers_health', 'foragers_mana', 'foragers_stats', 'seeds_of_serenity', 'royale_with_cheese',
  'jidi_pollen_bag', 'madstone_bundle', 'stonefeather_satchel', 'polliwog_charm', 'idol_of_screeauk', 'tidehunter_fish',
  'flayers_bota', 'kobold_cup', 'pogo_stick', 'ultimate_scepter', 'aghanims_shard', 'essence_distiller', 'mana_draught',
])

export interface PurchaseLine { t: number; key: string }

/** Покупки после гонга: стартовый закуп о темпе и об ответе на пик не говорит. */
export const purchasesOf = (evidence: PlayerEvidence | null | undefined): PurchaseLine[] =>
  (evidence?.purchases ?? []).filter(x => x.t > 0).map(x => ({ t: x.t, key: x.key }))

/** Купленные предметы из набора ответов, в порядке покупки. */
export const answerPurchases = (evidence: PlayerEvidence | null | undefined, answers: string[]) =>
  purchasesOf(evidence).filter(x => answers.includes(x.key)).sort((a, b) => a.t - b.t)

/**
 * Предметы, которые куплены, но применения в записях драк нет. Один предмет
 * называется один раз — по первой покупке.
 */
export function unusedActiveItems(evidence: PlayerEvidence | null | undefined, minTime = 600) {
  const used = new Set((evidence?.fights ?? []).flatMap(f => Object.keys(f.items ?? {})))
  const first = new Map<string, number>()
  for (const purchase of purchasesOf(evidence)) {
    if (purchase.t < minTime || !isActiveItem(purchase.key) || NOT_A_CHOICE.has(purchase.key) || used.has(purchase.key)) continue
    if (!first.has(purchase.key)) first.set(purchase.key, purchase.t)
  }
  return [...first].map(([key, t]) => ({ key, t })).sort((a, b) => a.t - b.t)
}

interface KitAbility { name: string; title: string; control: number; burstLevels: number[] }
interface KitHero { control: number; burst: number; escapes: number; abilities: KitAbility[] }

const KIT = kitData.kit as unknown as Record<string, KitHero>
const ABILITY = new Map<string, { heroId: number; ability: KitAbility }>()
for (const [heroId, hero] of Object.entries(KIT)) {
  for (const ability of hero.abilities ?? []) ABILITY.set(ability.name, { heroId: Number(heroId), ability })
}

// burstLevels — значения игровых файлов, поэтому берётся первый уровень: он
// описывает героя в начале игры и не завышает угрозу поздними уровнями.
const burstOf = (ability: KitAbility) => Math.max(0, Math.round(ability.burstLevels?.[0] ?? 0))

export interface SpellThreat { key: string; title: string; heroId: number; control: number; burst: number }

/** Способность врага по её ключу из игровых файлов Valve. */
export function spellThreat(key: string): SpellThreat | null {
  const found = ABILITY.get(key)
  if (!found) return null
  return { key, title: found.ability.title, heroId: found.heroId, control: found.ability.control, burst: burstOf(found.ability) }
}

export type ThreatId = 'control' | 'burst' | 'physical' | 'mobility'

export interface Threat {
  id: ThreatId
  label: string
  /** Предметы, которыми на этот класс угрозы отвечает кор, и его поддержка. */
  answers: string[]
  supportAnswers: string[]
  /** Герои врага, несущие угрозу. */
  heroes: number[]
  /** Их способности, которые эту угрозу и создают. */
  spells: SpellThreat[]
  /** Смерти игрока от этих способностей: сколько раз и когда впервые. */
  kills: { spell: SpellThreat; count: number; first: number }[]
  /** Времена смертей, в которых участвовали способности угрозы. */
  times: number[]
  /** Смерти, где перед смертью по игроку прошло много обычных атак. */
  attackDeaths: number[]
}

// Пороги нужны только чтобы не писать про угрозу, которой в пике нет. Они не
// утверждают, что предмет был обязателен.
const CONTROL_HERO = 3
const CONTROL_SPELL = 1.5
const BURST_HERO = 350
const BURST_SPELL = 200
const ESCAPES_HERO = 3
const ATTACK_DEATH = 4

const CLASSES: {
  id: ThreatId; label: string; answers: string[]; supportAnswers: string[]
}[] = [
  {
    id: 'control', label: 'жёсткий контроль',
    answers: ['black_king_bar', 'sphere', 'lotus_orb', 'aeon_disk', 'guardian_greaves', 'manta'],
    supportAnswers: ['glimmer_cape', 'force_staff', 'cyclone', 'ghost', 'aeon_disk', 'guardian_greaves', 'wind_waker'],
  },
  {
    id: 'burst', label: 'магический урон',
    answers: ['black_king_bar', 'pipe', 'glimmer_cape', 'cloak', 'hood_of_defiance', 'eternal_shroud', 'aeon_disk', 'mage_slayer', 'guardian_greaves'],
    supportAnswers: ['glimmer_cape', 'pipe', 'cloak', 'hood_of_defiance', 'infused_raindrop', 'aeon_disk', 'holy_locket', 'mekansm'],
  },
  {
    id: 'physical', label: 'физический урон',
    answers: ['ghost', 'blade_mail', 'heavens_halberd', 'crimson_guard', 'solar_crest', 'hurricane_pike', 'satanic'],
    supportAnswers: ['ghost', 'glimmer_cape', 'solar_crest', 'blade_mail', 'force_staff', 'wind_waker'],
  },
  {
    id: 'mobility', label: 'мобильность',
    answers: ['sheepstick', 'orchid', 'bloodthorn', 'rod_of_atos', 'nullifier', 'dust', 'abyssal_blade'],
    supportAnswers: ['rod_of_atos', 'orchid', 'dust', 'cyclone', 'nullifier'],
  },
]

export const heroList = (heroIds: number[], limit = 3) => {
  const names = heroIds.map(heroName)
  return names.length > limit ? `${names.slice(0, limit).join(', ')} и ещё ${names.length - limit}` : names.join(', ')
}

/** Набор ответов под роль: у поддержки он дешевле, чем у кора. */
export const answersFor = (threat: Threat, position: number) => position >= 4 ? threat.supportAnswers : threat.answers

/** Времена смертей, в окнах которых встречались способности угрозы. */
function killWindowTimes(windows: NonNullable<PlayerEvidence['deathWindows']>, spells: SpellThreat[]) {
  const known = new Set(spells.map(spell => spell.key))
  return windows.filter(window => (window.enemySpells ?? []).some(key => known.has(key))).map(window => window.t)
}

/** Сколько раз способности угрозы встречались в окнах перед смертями. */
function killRecords(windows: NonNullable<PlayerEvidence['deathWindows']>, spells: SpellThreat[]) {
  const known = new Set(spells.map(spell => spell.key))
  const counts = new Map<string, { count: number; first: number }>()
  for (const window of windows) {
    for (const key of window.enemySpells ?? []) {
      if (!known.has(key)) continue
      const entry = counts.get(key) ?? { count: 0, first: window.t }
      entry.count += 1
      entry.first = Math.min(entry.first, window.t)
      counts.set(key, entry)
    }
  }
  return [...counts]
    .map(([key, value]) => ({ spell: spells.find(spell => spell.key === key)!, count: value.count, first: value.first }))
    .sort((a, b) => b.count - a.count || a.first - b.first)
}

/**
 * Угрозы состава врага, а не популярные предметы: контроль, магия, физика и
 * уход из-под контроля берутся из игровых файлов и из смертей самого игрока.
 */
export function enemyThreats(opponents: MatchPlayer[], evidence?: PlayerEvidence | null): Threat[] {
  const windows = evidence?.deathWindows ?? []
  const kitOf = new Map<number, KitHero>()
  for (const opponent of opponents) {
    const kit = KIT[String(opponent.heroId)]
    if (kit) kitOf.set(opponent.heroId, kit)
  }

  const threats: Threat[] = []
  for (const cls of CLASSES) {
    const heroes = new Set<number>()
    const spells: SpellThreat[] = []
    const attackDeaths: number[] = []

    if (cls.id === 'physical') {
      // Физическая угроза измеряется по атакам: урон способностей сюда не
      // подмешивается, иначе в класс попадут магические нюкеры.
      for (const window of windows) {
        if ((window.attacks ?? 0) < ATTACK_DEATH) continue
        attackDeaths.push(window.t)
        for (const attacker of window.decision?.attackers ?? []) heroes.add(attacker.heroId)
      }
    } else {
      for (const [heroId, kit] of kitOf) {
        const strong = cls.id === 'control' ? kit.control >= CONTROL_HERO : cls.id === 'burst' ? kit.burst >= BURST_HERO : kit.escapes >= ESCAPES_HERO
        const carried = (kit.abilities ?? []).filter(ability =>
          cls.id === 'control' ? ability.control >= CONTROL_SPELL : cls.id === 'burst' ? burstOf(ability) >= BURST_SPELL : false)
        if (!strong && !carried.length) continue
        heroes.add(heroId)
        for (const ability of carried) spells.push({ key: ability.name, title: ability.title, heroId, control: ability.control, burst: burstOf(ability) })
      }
    }

    const kills = killRecords(windows, spells)
    const times = [...new Set(kills.length ? killWindowTimes(windows, spells) : attackDeaths)].sort((a, b) => a - b)
    if (!heroes.size && !kills.length && !attackDeaths.length) continue
    threats.push({ ...cls, heroes: [...heroes], spells, kills, times, attackDeaths })
  }
  return threats
}
