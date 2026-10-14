import { personalImpactBreakdown, type ImpactInput } from './impact'
import type { PlayerEvidence, MapPlays } from './types'
import referenceJson from '../../server/data/constants/coach_references.json'

export const ASSESSMENT_VERSION = 5
export interface ReferenceGame {
  matchId: number; slot: number; heroId: number; position: number; rank: number; cohort: string
  start: number; patch: number | null; duration: number; won: boolean; roleSource?: string; evidence: PlayerEvidence
  mapPlays?: MapPlays | null
}
export const referenceGames = (referenceJson as unknown as { examples: ReferenceGame[] }).examples
export const sampleAt = (e: PlayerEvidence | null | undefined, t: number) => e?.curve.filter(r => Number(r[0]) <= t).at(-1) ?? null
const median = (values: number[]) => {
  const a = [...values].sort((a,b)=>a-b)
  return a.length ? (a[Math.floor((a.length-1)/2)] + a[Math.ceil((a.length-1)/2)])/2 : null
}
export function comparisons(p: ImpactInput, rank: number, stronger = false): ReferenceGame[] {
  let pool = referenceGames.filter(r=>r.heroId === p.heroId && r.position === p.position)
  if (stronger) return pool.filter(r=>r.cohort === 'pro' || r.rank >= 70).sort((a,b)=>b.start-a.start)
  const near = pool.filter(r=>rank > 0 && r.cohort !== 'pro' && Math.abs(Math.floor(r.rank/10)-Math.floor(rank/10)) <= 1)
  // A tiny same-hero cohort is not a reliable ranked baseline.
  if (near.length >= 5) return near
  return []
}
export function referenceExpectation(p: ImpactInput, rank: number, t: number, field: number): { value: number; count: number; label: string } | null {
  const available = referenceGames.filter(r=>r.duration>=t && r.position===p.position && sampleAt(r.evidence,t)?.[field]!=null)
  const exact = available.filter(r=>r.heroId===p.heroId && r.cohort!=='pro' && rank>0 && Math.abs(Math.floor(r.rank/10)-Math.floor(rank/10))<=1)
  if(exact.length>=5) return {value:median(exact.map(r=>Number(sampleAt(r.evidence,t)![field])))!,count:exact.length,label:'тот же герой и роль, близкая медаль'}
  const ranked = available.filter(r=>r.cohort!=='pro' && rank>0 && Math.abs(Math.floor(r.rank/10)-Math.floor(rank/10))<=1)
  if(ranked.length<8) return null
  const ownLead=sampleAt(p.evidence,t)?.[9]
  const state = ownLead==null ? [] : ranked.filter(r=>{
    const lead=sampleAt(r.evidence,t)?.[9]
    return lead!=null && (ownLead < -3000 ? lead < -3000 : ownLead>3000 ? lead>3000 : Math.abs(lead)<=3000)
  })
  const cohort=state.length>=8?state:ranked
  let value=median(cohort.map(r=>Number(sampleAt(r.evidence,t)![field])))!
  const strong=available.filter(r=>r.cohort==='pro'||r.rank>=70)
  const hero=strong.filter(r=>r.heroId===p.heroId)
  const roleNorm=median(strong.map(r=>Number(sampleAt(r.evidence,t)![field])))
  const heroNorm=median(hero.map(r=>Number(sampleAt(r.evidence,t)![field])))
  if(heroNorm!=null&&roleNorm&&hero.length>=3) {
    const ratio=Math.max(.65,Math.min(1.5,heroNorm/roleNorm))
    value*=1+(ratio-1)*hero.length/(hero.length+8)
  }
  return {value,count:cohort.length,label:`норма роли и близкой медали${state.length>=8?', похожее отставание/преимущество':''}${hero.length>=3?', осторожная поправка героя по сильным играм':''}`}
}
export interface AssessmentFactor { label: string; contribution: number; detail: string }
export interface Assessment {
  version: number; value: number; factors: AssessmentFactor[]; coverage: string[]; missing: string[]
  referenceCount: number; note: string
}
export function assessPlayer(p: ImpactInput, duration: number, fallbackRank: number | null): Assessment | null {
  if (![p.heroId,p.kills,p.deaths,p.assists,p.goldPerMinute,p.experiencePerMinute].every(v=>typeof v==='number'&&Number.isFinite(v))) return null
  const base = personalImpactBreakdown(p, duration, fallbackRank)
  if (!base) return null
  const rank = p.seasonRank || fallbackRank || 0
  const refs = comparisons(p, rank)
  const e = p.evidence
  const factors: AssessmentFactor[] = []
  const coverage = ['Герой, роль, длительность: фарм, опыт, смерти, участие, урон и объекты']
  const missing: string[] = []
  // Statistical model is trained against match outcomes. Replay corrections
  // below are bounded, explicit heuristics, not expert-trained causal labels.
  const replayWeight = e ? .8 : 1
  for (const section of [...new Set(base.factors.map(f=>f.section))]) {
    const group = base.factors.filter(f=>f.section === section)
    factors.push({ label: section, contribution: replayWeight * group.reduce((n,f)=>n+f.contribution,0),
      detail: group.map(f=>{
        const format=(v:number)=>f.unit==='share'?Math.round(v*100)+'%':v.toLocaleString('ru-RU',{maximumFractionDigits:1})+(f.unit==='rate'?' в минуту':'')
        return `${f.label}: ${format(f.actual)}; норма ${format(f.baseline)}`
      }).join(' · ') })
  }
  const correction = (label: string, actual: number | null | undefined, norms: (number | null | undefined)[], detail: string, inverse = false, cap = 4) => {
    const known = norms.filter((v): v is number=>v != null && Number.isFinite(v))
    const norm = median(known)
    if (actual == null || norm == null || known.length < 5) return
    const delta = (actual-norm)/Math.max(Math.abs(norm),1)
    factors.push({ label, contribution: cap*Math.tanh(delta)*(inverse?-1:1), detail: `${detail}: ${Math.round(actual)}; медиана ${Math.round(norm)} (${known.length} игр того же героя, роли и близкой медали).` })
  }
  if (e) {
    coverage.push('Поминутная экономика и смерти из реплея')
    const ten = sampleAt(e, 600)
    if (refs.length) {
      correction('Добивания на линии', ten?.[4], refs.map(r=>sampleAt(r.evidence,600)?.[4]), 'Добивания к 10:00')
      correction('Опыт на линии', ten?.[3], refs.map(r=>sampleAt(r.evidence,600)?.[3]), 'Опыт к 10:00',false,3)
      correction('Размены на линии', ten?.[6], refs.map(r=>sampleAt(r.evidence,600)?.[6]), 'Урон героям к 10:00',false,3)
      correction('Смерти на линии', e.deaths?.filter(d=>d.t>=0&&d.t<600).length, refs.map(r=>r.evidence.deaths?.filter(d=>d.t>=0&&d.t<600).length), 'Смерти до 10:00',true,3)
      if (p.position >= 4) {
        correction('Стаки',e.stacks,refs.map(r=>r.evidence.stacks),'Стаки лагерей',false,3)
        correction('Снятые Observer',e.dewards,refs.map(r=>r.evidence.dewards),'Снятые Observer',false,3)
      }
    } else {
      for(const [field,label,cap] of [[4,'Добивания на линии',4],[3,'Опыт на линии',3],[6,'Размены на линии',3]] as const) {
        const expected=referenceExpectation(p,rank,Math.min(600,duration),field), actual=ten?.[field]
        if(expected && actual!=null) factors.push({label,contribution:cap*Math.tanh((actual-expected.value)/Math.max(expected.value,1)),
          detail:`К 10:00: ${Math.round(actual)}; ориентир ${Math.round(expected.value)} (${expected.count} игр; ${expected.label}).`})
      }
      if(!factors.some(f=>f.label==='Добивания на линии')) missing.push('Недостаточно сравнительных реплеев для численной нормы линии; показаны сами события')
    }
    const recent=sampleAt(e,Math.min(duration,1500)), earlier=sampleAt(e,900)
    if(recent&&earlier&&Number(recent[0])>900) {
      const end=Number(recent[0]), startNorm=referenceExpectation(p,rank,900,1), endNorm=referenceExpectation(p,rank,end,1)
      if(startNorm&&endNorm&&recent[1]!=null&&earlier[1]!=null&&endNorm.value>startNorm.value) {
        const actual=recent[1]-earlier[1], expected=endNorm.value-startNorm.value
        factors.push({label:'Фарм после старта',contribution:(p.position<=3?4:2)*Math.tanh((actual-expected)/expected),
          detail:`Заработано с 15:00 до ${Math.floor(end/60)}:00: ${actual}; ориентир ${Math.round(expected)}. ${endNorm.label}. Это измерение восстановления экономики, не оправдание каждого выхода.`})
      }
    }
    if (e.lane.attacks != null) coverage.push('Удары по героям и обмен уроном на линии')
    else missing.push('Нет отдельных ударов на линии: доступен только накопленный урон')
    if (e.wards && e.itemUses) coverage.push('Поставленные варды, стаки, снятые Observer, применение расходников')
    else missing.push('Нет полного журнала поддержки')
    if (e.deaths) {
      const diebacks = e.deaths.filter(d=>d.dieback).length
      if (diebacks) factors.push({label:'Повторные смерти после байбека',contribution:-Math.min(6,diebacks*3),detail:`${diebacks} смертей после подтверждённого байбека; цель возврата требует разбора.`})
    }
    if (p.mapPlays?.coverage && p.mapPlays.coverage >= .9) {
      coverage.push('Подтверждённое участие в эпизодах и действия при отставании')
      const behind = p.mapPlays.episodes.filter(x=>x.teamGold < -3000 && x.t >= 600)
      const useful = behind.filter(x=>x.verdict > 0 && (x.kind === 'objective' || (x.facts.kills??0)>0))
      if (useful.length) factors.push({label:'Результативные действия при отставании',contribution:Math.min(5,useful.length),detail:`${useful.length} положительных разменов/объектов при отставании от 3000. Это ограниченная поправка, которая не отменяет смерти и потерю фарма.`})
    } else missing.push('Неполные координаты: решения по карте не оценены')
    if (p.position >= 4 && e.wards) {
      // Only penalize measured zero placements; no arbitrary ward-count reward.
      if (!e.wards.length && duration >= 1200) factors.push({label:'Поддержка без поставленных вардов',contribution:-4,detail:'В полном журнале нет ни Observer, ни Sentry. Покупки не засчитываются как установка.'})
    }
  } else missing.push('Реплей не разобран: линия, тайминги, расходники и движение пока не входят в оценку')
  missing.push('Видимость, готовность способностей, передача предметов и доступные альтернативы не восстановлены полностью')
  const raw = factors.reduce((n,f)=>n+f.contribution,0)
  // Continuous compression: +100 is never handed out for a short streak.
  const value = Math.max(-99,Math.min(99,Math.round(95*Math.tanh(raw/95))))
  const scale = raw ? value/raw : 1
  const exact = factors.map(f=>f.contribution*scale)
  factors.forEach((f,i)=>f.contribution=Math.trunc(exact[i]))
  let left = value-factors.reduce((n,f)=>n+f.contribution,0)
  for (const i of factors.map((_,i)=>i).sort((a,b)=>Math.sign(left)*((exact[b]-factors[b].contribution)-(exact[a]-factors[a].contribution)))) {
    if (!left) break; const step=Math.sign(left); factors[i].contribution+=step;left-=step
  }
  return { version: ASSESSMENT_VERSION, value, factors, coverage, missing, referenceCount: refs.length,
    note: `Комплексная оценка v${ASSESSMENT_VERSION}: 0 — около статистической нормы героя и роли; плюс — выше, минус — ниже. ${rank ? 'Использована медаль игрока.' : 'Медаль неизвестна.'} ${e ? 'Добавлены доступные события реплея.' : 'Пока только итоговая статистика.'} Верхний край шкалы не означает идеальную игру. Поправки реплея экспериментальные; модель не обучена на оценках тренеров.` }
}
