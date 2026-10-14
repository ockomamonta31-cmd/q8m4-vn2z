// Collect real parsed examples. No invented pro trajectories or inferred MMR.
// node scripts/collect-coach-references.mjs [limit=60]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { playerEvidence } from '../server/gc/player-evidence.mjs'
const heroes = JSON.parse(readFileSync('server/data/constants/heroes.json'))
const output = 'server/data/constants/coach_references.json'
const cache = 'server/data/coach-reference-raw'
mkdirSync(cache, { recursive: true })
const limit = Math.max(1, Math.min(200, Number(process.argv[2]) || 60))
const previous = existsSync(output) ? JSON.parse(readFileSync(output)) : { version: 1, examples: [] }
const examples = new Map(previous.examples.map(e => [e.matchId + ':' + e.slot, e]))
const targets = [56, 34, 2, 96, 7, 100, 8, 14, 29, 52, 11, 25]
const candidates = []
const rows = ['scripts/opendota-impact.jsonl', 'scripts/opendota-ranked-impact.jsonl'].flatMap(path => existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse) : [])
for (const hero of targets) {
  const byHero = rows.filter(m => m.players.some(p => p.heroId === hero) && m.leagueId).sort((a,b) => b.id - a.id)
  candidates.push(...byHero.slice(0, 3))
}
const pubs=rows.filter(m => Number(m.actualRank)>0 && Number(m.actualRank)<80).sort((a,b)=>b.id-a.id)
for(let i=0;i<30;i++) for(const bucket of [40,50,60,70,30,20,10]) {
  const row=pubs.filter(m=>Math.floor(m.actualRank/10)*10===bucket)[i]
  if(row)candidates.push(row)
}
const selected = [...new Map(candidates.map(m => [m.id, m])).values()].slice(0, limit)
for (const m of selected) {
  try {
    const path = cache + '/' + m.id + '.json'
    let raw
    if (existsSync(path)) raw = JSON.parse(readFileSync(path))
    else {
      const res = await fetch('https://api.opendota.com/api/matches/' + m.id, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) { console.log('skip', m.id, res.status); if (res.status === 429) break; continue }
      raw = await res.json(); writeFileSync(path, JSON.stringify(raw))
      await new Promise(r=>setTimeout(r,1100))
    }
    if (!raw.players?.length || raw.game_mode === 23 || !raw.players.some(p=>p.gold_t?.length)) continue
    const positions = new Map()
    for (const side of [true, false]) {
      const team = raw.players.filter(p => (p.player_slot < 128) === side)
      for (const [lane, core, support] of [[1,1,5],[2,2,0],[3,3,4]]) {
        const group = team.filter(p=>p.lane_role === lane).sort((a,b)=>(b.gold_t?.[10]??b.gold_per_min)-(a.gold_t?.[10]??a.gold_per_min))
        if (group.length) positions.set(group[0], core)
        if (support && group.length === 2) positions.set(group[1], support)
      }
    }
    for (const p of raw.players) {
      const trained = m.players.find(q=>q.heroId === p.hero_id && q.isRadiant === (p.player_slot < 128))
      const position = trained?.position || positions.get(p)
      if (!(position >= 1 && position <= 5)) continue
      const existing=examples.get(raw.match_id + ':' + p.player_slot)
      const evidence = existing?.mapPlays ? existing.evidence : playerEvidence({ ...raw, radiant_gold_adv: raw.radiant_gold_adv }, p.player_slot, p.hero_id, heroes)
      if (!evidence?.curve.length) continue
      examples.set(raw.match_id + ':' + p.player_slot, { matchId: raw.match_id, slot: p.player_slot, heroId: p.hero_id, position, roleSource: trained?.position ? 'corpus' : 'lane-economy',
        rank: Number(trained.seasonRank) || Number(m.actualRank) || 0, cohort: raw.leagueid ? 'pro' : 'pub',
        start: raw.start_time, patch: raw.patch ?? null, duration: raw.duration, won: raw.radiant_win === (p.player_slot < 128),mapPlays:existing?.mapPlays??null,
        evidence: { ...evidence, curve:evidence.curve.filter((row,i)=>Number(row[0])%300===0||i===evidence.curve.length-1),
          purchases:evidence.purchases?.filter(x=>['blink','black_king_bar','desolator','orchid','battlefury','radiance','maelstrom','travel_boots','kaya','witch_blade','armlet'].includes(x.key))??null,
          uses: null, deaths: evidence.deaths?.slice(0,40), runes: null, fights: null } })
    }
    writeFileSync(output, JSON.stringify({ version: 1, generated: new Date().toISOString(), source: 'OpenDota parsed match logs; roles from source corpus', examples: [...examples.values()] }))
    console.log(m.id, 'examples', examples.size)
  } catch(e) { console.log('skip',m.id,e.message) }
}
