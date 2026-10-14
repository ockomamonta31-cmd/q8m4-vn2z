import { keyMistakes } from '../src/api/training'
import type { MatchDetails } from '../src/api/types'

// The primary review is shared with the client and ready with replay evidence.
// Generating a long model report added latency and often failed grounding.
export async function coachResponse(_env: { DB: D1Database; AI?: Ai }, match: MatchDetails, slot: number): Promise<Response> {
  const side=match.players.filter(p=>p.isRadiant===(slot<128))
  const player=side[slot<128?slot:slot-128]
  if(!player)return Response.json({error:'Игрок не найден'},{status:404})
  if(!player.evidence)return Response.json({error:'Для разбора нужен разобранный реплей'},{status:409})
  const notes=keyMistakes(player,match.players.filter(p=>p.isRadiant!==player.isRadiant))
  return Response.json({model:'Эдик · ошибки по событиям',version:10,
    summary:notes.length?'Главные эпизоды, с которых стоит начать исправления.':'Явных ошибок с достаточным контекстом не выделено.',
    priorities:notes.map(note=>({title:note.title,explanation:note.advice,nextGame:note.advice,facts:[note]}))},
    {headers:{'cache-control':'no-store'}})
}
