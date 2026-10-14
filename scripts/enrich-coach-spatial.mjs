import { readFileSync,writeFileSync,existsSync } from 'node:fs'
import { playerEvidence } from '../server/gc/player-evidence.mjs'
import { buildMapPlays } from '../server/gc/map-plays.mjs'
const path='server/data/constants/coach_references.json'
const corpus=JSON.parse(readFileSync(path)),heroes=JSON.parse(readFileSync('server/data/constants/heroes.json'))
for(const arg of process.argv.slice(2)) {
  const id=Number(arg), base='server/data/coach-reference-raw/'+id
  if(!existsSync(base+'-spatial.json')) continue
  const replay=JSON.parse(readFileSync(base+'-spatial.json')),raw=JSON.parse(readFileSync(base+'.json'))
  const players=raw.players.map(p=>({heroId:p.hero_id,isRadiant:p.player_slot<128})).sort((a,b)=>Number(b.isRadiant)-Number(a.isRadiant))
  const plays=buildMapPlays(replay,{players,durationSeconds:raw.duration},heroes)
  for(const p of raw.players) {
    let row=corpus.examples.find(r=>r.matchId===id&&r.slot===p.player_slot)
    if(!row && id===9040034249 && p.hero_id===34) {
      row={matchId:id,slot:p.player_slot,heroId:34,position:2,rank:80,cohort:'pro',start:raw.start_time,patch:raw.patch??null,duration:raw.duration,won:raw.radiant_win===(p.player_slot<128),roleSource:'parsed-lane'}
      corpus.examples.push(row)
    }
    if(!row) continue
    const e=playerEvidence(replay,p.player_slot,p.hero_id,heroes)
    row.evidence={...e,curve:e.curve.filter((r,i)=>Number(r[0])%300===0||i===e.curve.length-1),uses:null,fights:null,runes:null,
      purchases:e.purchases?.filter(x=>['blink','black_king_bar','desolator','orchid','battlefury','radiance','maelstrom','travel_boots','kaya','witch_blade','armlet'].includes(x.key))??null}
    row.mapPlays=plays?.[p.player_slot]??null
  }
  console.log('spatial references',id,Object.keys(plays??{}).length)
}
writeFileSync(path,JSON.stringify(corpus))
