// Preserve measured final outcomes for situational comparisons, never winner labels.
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
const path='server/data/constants/coach_references.json'
const data=JSON.parse(readFileSync(path))
let count=0
for(const r of data.examples) {
  const rawPath=`server/data/coach-reference-raw/${r.matchId}.json`
  if(!existsSync(rawPath))continue
  const raw=JSON.parse(readFileSync(rawPath)), p=raw.players?.find(p=>p.player_slot===r.slot)
  if(!p||!Number.isFinite(p.kills)||!Number.isFinite(p.assists))continue
  r.outcome={kills:p.kills,assists:p.assists,heroDamage:p.hero_damage,towerDamage:p.tower_damage}
  count++
}
writeFileSync(path,JSON.stringify(data))
console.log('Measured reference outcomes:',count)
