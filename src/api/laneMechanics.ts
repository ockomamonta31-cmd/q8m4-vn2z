import type { MatchPlayer } from './types'
import data from '../../server/data/constants/lane_specs.json'
const specs=data.heroes as unknown as Record<string,{attackRange?:number;spells:{key:string;title:string;description:string}[]}>
export function laneMechanics(allies: MatchPlayer[],enemies: MatchPlayer[],name: (p:MatchPlayer)=>string): string[] {
  const lines: string[]=[]
  const ranged=(team:MatchPlayer[])=>team.filter(p=>(specs[p.heroId]?.attackRange??0)>300)
  if(ranged(allies).length>ranged(enemies).length) lines.push(`Radiant чаще может начать размен с дистанции (${ranged(allies).length} дальних против ${ranged(enemies).length}). Реализация зависит от позиции и агро крипов; это не гарантирует контроль линии.`)
  else if(ranged(enemies).length>ranged(allies).length) lines.push(`Dire чаще может начать размен с дистанции (${ranged(enemies).length} дальних против ${ranged(allies).length}). Ближней паре нужно окно сближения; лобовой размен вне своей волны опаснее.`)
  for(const p of [...allies,...enemies]) {
    const spells=specs[p.heroId]?.spells??[]
    if(spells.some(s=>s.key==='pudge_meat_hook')) lines.push(`${name(p)}: Meat Hook цепляет первую цель. Крипы перекрывают прямой бросок; контроль после попадания не равен постоянному преимуществу пары.`)
    if(spells.some(s=>s.key==='tidehunter_anchor_smash')) lines.push(`${name(p)}: Anchor Smash ослабляет атаки противника. Сравни короткий размен после применения и длинный размен под эффектом; без сближения способность не даёт такой защиты.`)
    const channels=spells.filter(s=>/channeled|channeling/i.test(s.description))
    if(channels.length && [...(allies.includes(p)?enemies:allies)].some(q=>specs[q.heroId]?.spells.some(s=>/stun|interrupt/i.test(s.description)))) lines.push(`${name(p)}: ${channels.map(s=>s.title).join(', ')} требует времени применения; у соперников есть описание стана/прерывания. Реализовать весь контроль получится только при подходящей позиции и готовности врага.`)
    const heal=spells.find(s=>/heals?|restores?.*(health|hp)/i.test(s.description))
    if(heal) lines.push(`${name(p)}: ${heal.title} даёт лечение по описанию способности. Это помогает повторять размены при наличии маны и готовности, но часть умений открывается только с уровнем или предметом.`)
  }
  lines.push('До 6-го уровня и после него условия различаются. Ресурсы, прокачка, попадание способностями, крипы и помощь других линий важнее небольшой разницы индексов. Здесь разобран потенциал, а не гарантированный исход.')
  return lines.slice(0,7)
}
