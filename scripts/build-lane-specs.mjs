import { readFileSync,writeFileSync } from 'node:fs'
const sources=['https://raw.githubusercontent.com/odota/dotaconstants/master/build/abilities.json','https://raw.githubusercontent.com/odota/dotaconstants/master/build/hero_abilities.json','https://api.opendota.com/api/heroStats']
const [abilities,byHero,stats]=await Promise.all(sources.map(async url=>{
  const res=await fetch(url,{signal:AbortSignal.timeout(30000)})
  if(!res.ok)throw new Error('Constant source HTTP '+res.status)
  return res.json()
}))
const heroes=JSON.parse(readFileSync('server/data/constants/heroes.json'))
const out={version:1,generated:new Date().toISOString(),source:'Valve game data via OpenDota dotaconstants; OpenDota heroStats',heroes:{}}
for(const h of heroes){
  const hs=stats.find(s=>s.id===h.id), names=byHero[h.shortName]?.abilities??byHero['npc_dota_hero_'+h.shortName]?.abilities??[]
  out.heroes[h.id]={attackRange:hs?.attack_range,baseArmor:hs?.base_armor,baseHealth:hs?.base_health,baseRegen:hs?.base_health_regen,baseStr:hs?.base_str,strGain:hs?.str_gain,attackType:hs?.attack_type,
    spells:names.map(key=>({key,...abilities[key]})).filter(a=>a.dname&&a.desc&&!a.behavior?.includes?.('Hidden')).slice(0,6).map(a=>({key:a.key,title:a.dname,description:a.desc.replace(/<[^>]*>/g,'').slice(0,600),behavior:a.behavior,mana:a.mc,cooldown:a.cd,damageType:a.dmg_type}))}
}
writeFileSync('server/data/constants/lane_specs.json',JSON.stringify(out))
console.log('Lane spell descriptions and range:',Object.keys(out.heroes).length,'heroes')
