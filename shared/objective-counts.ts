import type { BroadcastState, Side } from './types';
import { currentOcrMatch } from './hud-ocr';

export const objectiveKeys=['towers','dragons','barons','voidgrubs','heralds','elders'] as const;
export type ObjectiveKey=typeof objectiveKeys[number];
export const objectiveLabels:Record<ObjectiveKey,string>={towers:'防御塔',dragons:'元素龙',barons:'男爵',voidgrubs:'虚空巢虫',heralds:'峡谷先锋',elders:'远古龙'};
/** Saved observations remain valid for reports; live displays require the current sample. */
export function objectiveCount(state:BroadcastState,side:Side,key:ObjectiveKey,now=Date.now()):number|undefined {
  const stats=state.stats[side];
  if(stats.objectivesSource==='memory'){
    if(state.phase!=='postgame'&&(!stats.objectivesExpiresAt||Date.parse(stats.objectivesExpiresAt)<=now))return;
    return stats[key];
  }
  return currentOcrMatch(state)?.objectives[side][key]?.value;
}
