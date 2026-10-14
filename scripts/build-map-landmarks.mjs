import {readFileSync,writeFileSync} from 'node:fs'
const source=process.argv[2]??'server/data/replays/9038997807.json'
const raw=JSON.parse(readFileSync(source)).movement.structures
const towers=raw.filter(s=>s.kind==='CDOTA_BaseNPC_Tower')
if(towers.length!==22)throw Error('Expected the 22 actual tower entities')
const names=[
  ['goodguys',97.125,80.25,'tower3_bot'],['goodguys',91.75,95.625,'tower3_mid'],['goodguys',76.5,101.375,'tower3_top'],
  ['goodguys',125.1875,79.125,'tower2_bot'],['goodguys',165.9678,78.1621,'tower1_bot'],['goodguys',103.0754,105.1387,'tower2_mid'],
  ['goodguys',77.2109,121.1875,'tower2_top'],['goodguys',78.5,142.5,'tower1_top'],['goodguys',83.375,90,'tower4_1'],
  ['goodguys',85.875,87.4375,'tower4_2'],['goodguys',115.9375,117,'tower1_mid'],
  ['badguys',166.625,165.3125,'tower4_1'],['badguys',169.25,162.625,'tower4_2'],['badguys',127,175,'tower2_top'],
  ['badguys',86.7925,175.1565,'tower1_top'],['badguys',147.5,144.5,'tower2_mid'],['badguys',132.0938,133.0938,'tower1_mid'],
  ['badguys',178,131,'tower2_bot'],['badguys',177.5,151.6875,'tower3_bot'],['badguys',155.75,173.125,'tower3_top'],
  ['badguys',161.375,157.3672,'tower3_mid'],['badguys',176.9792,110.5,'tower1_bot'],
]
const structures=raw.filter(s=>!s.kind.includes('Watch_Tower')).map(s=>{
  const n=names.find(n=>Math.hypot(s.x-n[1],s.y-n[2])<.01)
  const side=s.team===2?'goodguys':'badguys'
  return {...s,key:n?`npc_dota_${n[0]}_${n[3]}`:s.kind.includes('Fort')?`npc_dota_${side}_fort`:undefined}
})
writeFileSync('server/data/constants/map_741.json',JSON.stringify({version:1,patch:'7.41',sourceMatch:9038997807,
  image:'/assets/map/dota-741.webp',projection:{xmin:7487,xmax:25809,ymin:7693,ymax:26015},structures}))
console.log('Map landmarks:',towers.length,'towers;',structures.length,'structures')
