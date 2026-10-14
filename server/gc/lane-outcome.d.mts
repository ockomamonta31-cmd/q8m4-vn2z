export type LaneOutcome = {
  version: number; result: 'stomp' | 'win' | 'draw' | 'loss' | 'stomp_loss';
  lane: string; score: number; goldDelta: number; xpDelta: number;
  allyHeroIds: number[]; enemyHeroIds: number[];
}
export const LANE_RESULT_LABELS: Record<LaneOutcome['result'], string>
export function startingLanes(replay: any): Map<number, string>
export function laneOutcome(players: any[], player: any, durationSeconds: number): LaneOutcome | null
