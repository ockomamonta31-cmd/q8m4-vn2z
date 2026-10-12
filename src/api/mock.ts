// Демо-данные: работают без токена (VITE_DEMO=1), детерминированы по steamId,
// чтобы интерфейс был стабилен при перезагрузке.

import type { HeroInfo, HeroStat, MatchDetails, MatchPlayer, Peer, PlayerMatch, Profile } from './types'

export const DEMO_HEROES: HeroInfo[] = [
  { id: 1, shortName: 'antimage', name: 'Anti-Mage' },
  { id: 2, shortName: 'axe', name: 'Axe' },
  { id: 3, shortName: 'bane', name: 'Bane' },
  { id: 4, shortName: 'bloodseeker', name: 'Bloodseeker' },
  { id: 5, shortName: 'crystal_maiden', name: 'Crystal Maiden' },
  { id: 6, shortName: 'drow_ranger', name: 'Drow Ranger' },
  { id: 7, shortName: 'earthshaker', name: 'Earthshaker' },
  { id: 8, shortName: 'juggernaut', name: 'Juggernaut' },
  { id: 9, shortName: 'mirana', name: 'Mirana' },
  { id: 10, shortName: 'morphling', name: 'Morphling' },
  { id: 11, shortName: 'nevermore', name: 'Shadow Fiend' },
  { id: 13, shortName: 'puck', name: 'Puck' },
  { id: 14, shortName: 'pudge', name: 'Pudge' },
  { id: 18, shortName: 'sven', name: 'Sven' },
  { id: 21, shortName: 'windrunner', name: 'Windranger' },
  { id: 22, shortName: 'zuus', name: 'Zeus' },
  { id: 25, shortName: 'tidehunter', name: 'Tidehunter' },
  { id: 26, shortName: 'witch_doctor', name: 'Witch Doctor' },
  { id: 32, shortName: 'riki', name: 'Riki' },
  { id: 35, shortName: 'sniper', name: 'Sniper' },
  { id: 41, shortName: 'vengefulspirit', name: 'Vengeful Spirit' },
  { id: 42, shortName: 'skeleton_king', name: 'Wraith King' },
  { id: 48, shortName: 'luna', name: 'Luna' },
  { id: 74, shortName: 'invoker', name: 'Invoker' },
  { id: 99, shortName: 'bristleback', name: 'Bristleback' },
  { id: 104, shortName: 'legion_commander', name: 'Legion Commander' },
]

const DEMO_NAMES = [
  'ArcaneFox', 'QuietRune', 'NorthStar', 'Lantern', 'Sage',
  'NightRunner', 'BlueComet', 'SilverOak', 'CloudWalker', 'EmberField',
  'DawnKeeper', 'RiverStone', 'MoonHarbor', 'BrightPine', 'WindHarbor',
]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function demoProfile(id: number): Profile {
  const rnd = mulberry32(id)
  const name = DEMO_NAMES[Math.floor(rnd() * DEMO_NAMES.length)]
  const matchCount = 1200 + Math.floor(rnd() * 3000)
  const winCount = Math.floor(matchCount * (0.44 + rnd() * 0.16))
  return {
    steamAccountId: id,
    name,
    avatar: null,
    matchCount,
    winCount,
    rank: 38 + Math.floor(rnd() * 12),
    rankIsCore: rnd() > 0.3,
  }
}

export function demoMatches(id: number, take: number, skip: number): PlayerMatch[] {
  const rnd = mulberry32(id + skip * 7919)
  const now = Math.floor(Date.now() / 1000)
  const out: PlayerMatch[] = []
  for (let i = 0; i < take; i++) {
    const idx = skip + i
    const hero = DEMO_HEROES[Math.floor(rnd() * DEMO_HEROES.length)]
    const kills = Math.floor(rnd() * 16)
    const deaths = Math.floor(rnd() * 10)
    const assists = Math.floor(rnd() * 20)
    const win = rnd() < 0.52
    out.push({
      id: 7_600_000_000 + idx * 13,
      startDateTime: now - idx * (3600 + Math.floor(rnd() * 7200)),
      durationSeconds: 1200 + Math.floor(rnd() * 2400),
      gameMode: idx % 9 === 0 ? 'TURBO' : 'ALL_PICK_RANKED',
      lobbyType: idx % 4 === 0 ? 'PUBLIC_MATCH' : 'RANKED',
      player: {
        steamAccountId: id,
        heroId: hero.id,
        kills,
        deaths,
        assists,
        goldPerMinute: 380 + Math.floor(rnd() * 320),
        experiencePerMinute: 420 + Math.floor(rnd() * 380),
        numLastHits: 40 + Math.floor(rnd() * 260),
        numDenies: Math.floor(rnd() * 20),
        networth: 12000 + Math.floor(rnd() * 16000),
        level: 18 + Math.floor(rnd() * 10),
        heroDamage: 12000 + Math.floor(rnd() * 30000),
        towerDamage: Math.floor(rnd() * 4000),
        heroHealing: Math.floor(rnd() * 6000),
        position: 1 + Math.floor(rnd() * 5),
        seasonRank: 38 + Math.floor(rnd() * 12),
        isVictory: win,
        // демо-IMP: коррелирует с исходом, ±60, иногда не посчитан
        imp: rnd() < 0.15 ? null : Math.round((win ? 1 : -1) * (5 + rnd() * 55)) - 10,
      },
    })
  }
  return out
}

export function demoHeroStats(id: number): HeroStat[] {
  const rnd = mulberry32(id + 31)
  return DEMO_HEROES.map((h) => ({
    heroId: h.id,
    matchCount: 3 + Math.floor(rnd() * 140),
    winCount: 0,
  }))
    .map((s) => ({ ...s, winCount: Math.floor(s.matchCount * (0.35 + rnd() * 0.3)) }))
    .sort((a, b) => b.matchCount - a.matchCount)
}

export function demoMatch(id: number): MatchDetails {
  const rnd = mulberry32(id)
  const now = Math.floor(Date.now() / 1000)
  const duration = 1500 + Math.floor(rnd() * 2400)
  const radiantWin = rnd() < 0.5
  const players: MatchPlayer[] = Array.from({ length: 10 }, (_, i) => {
    const hero = DEMO_HEROES[Math.floor(rnd() * DEMO_HEROES.length)]
    const isRadiant = i < 5
    const kills = Math.floor(rnd() * 18)
    const deaths = Math.floor(rnd() * 12)
    const assists = Math.floor(rnd() * 22)
    return {
      steamAccountId: 1_700_000_000 + Math.floor(rnd() * 200_000_000),
      name: DEMO_NAMES[Math.floor(rnd() * DEMO_NAMES.length)] + i,
      heroId: hero.id,
      isRadiant,
      isVictory: isRadiant === radiantWin,
      kills,
      deaths,
      assists,
      goldPerMinute: 350 + Math.floor(rnd() * 400),
      experiencePerMinute: 380 + Math.floor(rnd() * 420),
      numLastHits: 30 + Math.floor(rnd() * 280),
      numDenies: Math.floor(rnd() * 30),
      networth: (300 + Math.floor(rnd() * 1200)) * 10,
      level: 15 + Math.floor(rnd() * 11),
      heroDamage: 5000 + Math.floor(rnd() * 40000),
      towerDamage: Math.floor(rnd() * 8000),
      heroHealing: Math.floor(rnd() * 4000),
      imp: rnd() < 0.15 ? null : Math.round((isRadiant === radiantWin ? 1 : -1) * (5 + rnd() * 50)) - 8,
      items: Array.from({ length: 6 }, () => (rnd() < 0.12 ? null : 1 + Math.floor(rnd() * 200))),
      backpack: Array.from({ length: 3 }, () => (rnd() < 0.5 ? null : 1 + Math.floor(rnd() * 100))),
      neutralItem: rnd() < 0.3 ? null : 200 + Math.floor(rnd() * 100),
      neutralItem2: rnd() < 0.7 ? null : 200 + Math.floor(rnd() * 100),
      aghanimsScepter: rnd() < 0.35,
      aghanimsShard: rnd() < 0.45,
      moonshard: rnd() < 0.1,
      leaverStatus: 0,
      scaledHeroDamage: 4000 + Math.floor(rnd() * 30000),
      scaledTowerDamage: Math.floor(rnd() * 6000),
      scaledHeroHealing: Math.floor(rnd() * 3000),
      abilityUpgrades: Array.from({ length: 15 }, (_, lvl) => ({
        ability: 6000 + Math.floor(rnd() * 40),
        time: 60 + lvl * 70 + Math.floor(rnd() * 40),
        level: lvl + 1,
      })),
      position: (i % 5) + 1,
      seasonRank: 35 + Math.floor(rnd() * 25),
      stats: null,
    }
  })
  return {
    id,
    didRadiantWin: radiantWin,
    durationSeconds: duration,
    startDateTime: now - 3600,
    gameMode: 'ALL_PICK_RANKED',
    lobbyType: 'RANKED',
    numHumanPlayers: 10,
    actualRank: 45,
    firstBloodSeconds: 60 + Math.floor(rnd() * 300),
    radiantScore: Math.floor(rnd() * 40),
    direScore: Math.floor(rnd() * 40),
    towerStatusRadiant: 0,
    towerStatusDire: 0,
    barracksStatusRadiant: 0,
    barracksStatusDire: 0,
    picksBans: Array.from({ length: 14 }, (_, order) => ({
      isPick: order >= 4,
      isRadiant: order % 2 === 0,
      heroId: DEMO_HEROES[Math.floor(rnd() * DEMO_HEROES.length)].id,
      order,
    })),
    players,
  }
}

export function demoPeers(id: number): Peer[] {
  const rnd = mulberry32(id + 77)
  return Array.from({ length: 12 }, (_, i) => {
    const peerId = 1_800_000_000 + Math.floor(rnd() * 90_000_000)
    const withMatchCount = 20 + Math.floor(rnd() * 300)
    const againstMatchCount = 5 + Math.floor(rnd() * 80)
    return {
      steamAccountId: peerId,
      name: `${DEMO_NAMES[Math.floor(rnd() * DEMO_NAMES.length)]}${i}`,
      avatar: null,
      withMatchCount,
      withWinCount: Math.floor(withMatchCount * (0.4 + rnd() * 0.25)),
      againstMatchCount,
      againstWinCount: Math.floor(againstMatchCount * (0.4 + rnd() * 0.25)),
    }
  }).sort((a, b) => b.withMatchCount - a.withMatchCount)
}
