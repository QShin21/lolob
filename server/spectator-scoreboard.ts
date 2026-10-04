import type { Player, Side } from '../shared/types';

/** Normalized OCR word bounds in the game client area. */
export interface ScoreboardWord { text: string; x: number; y: number; width: number; height: number }
export interface PlayerScoreboardRow { team: Side; kills: number; deaths: number; assists: number; cs: number; currentGold?: number; totalGold?: number; raw: string; rowIndex?: number; championId?: string; identitySource?: 'portrait' | 'roster-elimination' }
export interface PlayerGoldRow extends PlayerScoreboardRow { currentGold: number; totalGold: number }
export interface ScoreboardPortrait { team: Side; championId: string; x: number; y: number; width: number; height: number; score: number; margin: number; method?: 'full' | 'outer-gray' }

/** The native spectator gold column explicitly shows current(total). Preserve both meanings. */
export function parsePlayerGoldRow(text: string, team: Side): PlayerGoldRow | undefined {
  const normalized = text.normalize('NFKC').trim();
  const amounts = [...normalized.matchAll(/(?<!\d)(\d{1,6})\s*\(\s*(\d{1,6})\s*\)(?!\d)/g)];
  const scores = [...normalized.matchAll(/(?<!\d)(\d{1,3})\s*\/\s*(\d{1,3})\s*\/\s*(\d{1,3})(?!\d)/g)];
  if (amounts.length !== 1 || scores.length !== 1) return;
  const remaining = normalized.replace(amounts[0][0], '').replace(scores[0][0], '').trim();
  // Extra text, death timers, multiple CS candidates and O/l substitutions are ambiguous.
  if (!/^\d{1,4}$/.test(remaining)) return;
  const currentGold = Number(amounts[0][1]), totalGold = Number(amounts[0][2]);
  if (currentGold > totalGold || totalGold > 1000000) return;
  return { team, kills: Number(scores[0][1]), deaths: Number(scores[0][2]), assists: Number(scores[0][3]), cs: Number(remaining), currentGold, totalGold, raw: text };
}

export function parseScoreboardRows(value: unknown, portraitValue?: unknown): PlayerScoreboardRow[] {
  if (!Array.isArray(value) || value.length > 1000) return [];
  const words = value.filter((word): word is ScoreboardWord => !!word && typeof word === 'object' && typeof word.text === 'string' && word.text.length <= 80 &&
    ['x', 'y', 'width', 'height'].every(key => typeof word[key] === 'number' && Number.isFinite(word[key]) && word[key] >= 0 && word[key] <= 1) && word.width > 0 && word.height > 0);
  const scoreHeights=words.filter(word=>word.text.includes('/')).map(word=>word.height).sort((a,b)=>a-b);
  const mainHeight=scoreHeights[Math.floor(scoreHeights.length/2)]??0;
  const result: PlayerScoreboardRow[] = [];
  const portraits = Array.isArray(portraitValue) && portraitValue.length <= 10 ? portraitValue.filter((portrait): portrait is ScoreboardPortrait => !!portrait && typeof portrait === 'object' &&
    (portrait.team === 'blue' || portrait.team === 'red') && typeof portrait.championId === 'string' && /^[A-Za-z][A-Za-z0-9]{1,40}$/.test(portrait.championId) &&
    ['x','y','width','height','score','margin'].every(key => typeof portrait[key] === 'number' && Number.isFinite(portrait[key]) && portrait[key] >= 0 && portrait[key] <= 1) &&
    portrait.width > 0 && portrait.height > 0 && portrait.score >= .9 && portrait.margin >= .09 &&
    (portrait.method !== 'outer-gray' || (portrait.score >= .94 && portrait.margin >= .12)) &&
    (portrait.team === 'blue' ? portrait.x + portrait.width <= .5 : portrait.x >= .5)) : [];
  for (const team of ['blue', 'red'] as const) {
    const members = words.filter(word => word.height>=mainHeight*.65 && (team === 'blue' ? word.x + word.width / 2 < .5 : word.x + word.width / 2 > .5)).sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2));
    const lines: ScoreboardWord[][] = [];
    for (const word of members) {
      const center = word.y + word.height / 2;
      const line = lines.find(candidate => Math.abs(center - (candidate[0].y + candidate[0].height / 2)) <= Math.min(word.height, candidate[0].height) * .65);
      if (line) line.push(word); else lines.push([word]);
    }
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      const text = line.map(word => word.text.normalize('NFKC')).join(' ');
      const amounts = [...text.matchAll(/(?<!\d)\d{1,6}\s*\(\s*\d{1,6}\s*\)(?!\d)/g)];
      const scores = [...text.matchAll(/(?<!\d)\d{1,3}\s*\/\s*\d{1,3}\s*\/\s*\d{1,3}(?!\d)/g)];
      if (scores.length !== 1) continue;
      const spans: {word: ScoreboardWord; start: number; end: number}[] = [];let offset=0;
      for (const word of line) {const length=word.text.normalize('NFKC').length;spans.push({word,start:offset,end:offset+length});offset+=length+1;}
      const bounds=(match:RegExpMatchArray)=>{
        const involved=spans.filter(span=>span.start<match.index!+match[0].length&&span.end>match.index!).map(span=>span.word);
        return {left:Math.min(...involved.map(word=>word.x)),right:Math.max(...involved.map(word=>word.x+word.width))};
      };
      const scoreBounds=bounds(scores[0]);
      const amountBounds=amounts.length===1?bounds(amounts[0]):undefined;
      const outerGap=amountBounds?(team==='blue'?scoreBounds.left-amountBounds.right:amountBounds.left-scoreBounds.right):(scoreBounds.right-scoreBounds.left)*1.1;
      if(outerGap<=0)continue;
      const centerY=line.reduce((sum,word)=>sum+word.y+word.height/2,0)/line.length;
      const portraitCandidates=portraits.filter(portrait=>portrait.team===team&&Math.abs(portrait.y+portrait.height/2-centerY)<=portrait.height*.4);
      const rowPortrait=portraitCandidates.length===1?portraitCandidates[0]:undefined;
      // CS is the adjacent numeric column toward the center, followed by champion portraits.
      // Use the measured outer column gap as a conservative spacing bound: a missing CS
      // cannot be replaced by a farther portrait death timer.
      const candidates=spans.filter(span=>/^\d{1,4}$/.test(span.word.text.normalize('NFKC'))&&
        (team==='blue'?span.word.x>=scoreBounds.right:span.word.x+span.word.width<=scoreBounds.left)&&
        (!rowPortrait||(team==='blue'?span.word.x+span.word.width<=rowPortrait.x+1e-9:span.word.x>=rowPortrait.x+rowPortrait.width-1e-9)))
        .map(span=>({word:span.word,gap:team==='blue'?span.word.x-scoreBounds.right:scoreBounds.left-span.word.x-span.word.width})).sort((a,b)=>a.gap-b.gap);
      const cs=candidates[0];if(!cs||cs.gap>outerGap*.8)continue;
      const adjacent=candidates[1];
      if(adjacent){const gap=team==='blue'?adjacent.word.x-cs.word.x-cs.word.width:cs.word.x-adjacent.word.x-adjacent.word.width;
        if(gap<=cs.word.width/cs.word.text.length*1.1)continue;}
      const score=scores[0][0].match(/\d+/g)!;
      const parsed:PlayerScoreboardRow={team,kills:Number(score[0]),deaths:Number(score[1]),assists:Number(score[2]),cs:Number(cs.word.text),raw:text};
      const gold=amounts.length===1?parsePlayerGoldRow(`${amounts[0][0]} ${scores[0][0]} ${cs.word.text}`, team):undefined;
      if(gold){parsed.currentGold=gold.currentGold;parsed.totalGold=gold.totalGold;}
      parsed.rowIndex=result.filter(row=>row.team===team).length;
      if(rowPortrait){parsed.championId=rowPortrait.championId;parsed.identitySource='portrait';}
      result.push(parsed);
    }
  }
  return result.length <= 10 ? result : [];
}

/** Gold-view compatibility: equipment-view statistics never invent gold values. */
export function parseScoreboardWords(value: unknown, portraitValue?: unknown): PlayerGoldRow[] {
  return parseScoreboardRows(value,portraitValue).filter((row):row is PlayerGoldRow=>row.currentGold!==undefined&&row.totalGold!==undefined);
}

const identity = (player: Pick<Player, 'team' | 'kills' | 'deaths' | 'assists' | 'cs'>) => [player.team, player.kills, player.deaths, player.assists, player.cs].join(':');

/** Portraits identify a same-side champion even while API statistics lag; duplicate identities remain unresolved. */
function matchRows<T extends PlayerScoreboardRow>(rows: T[], players: Player[]): Map<string, T> {
  const matched = new Map<string, T>();
  for (const row of rows.filter(row=>row.championId&&row.identitySource==='portrait')) {
      if(rows.filter(other=>other.team===row.team&&other.championId===row.championId&&other.identitySource==='portrait').length!==1)continue;
      const candidates=players.filter(player=>player.team===row.team&&player.championId===row.championId);
      if(candidates.length===1&&!matched.has(candidates[0].id))matched.set(candidates[0].id,row);
  }
  // Four independent same-frame portraits plus a complete five-player side determine
  // the sole remaining identity, including a portrait covered by a respawn timer.
  for(const team of ['blue','red'] as const){
    const sideRows=rows.filter(row=>row.team===team),sidePlayers=players.filter(player=>player.team===team);
    const confirmed=sideRows.filter(row=>row.identitySource==='portrait'&&[...matched.values()].includes(row));
    const unresolved=sideRows.filter(row=>!confirmed.includes(row)),remaining=sidePlayers.filter(player=>!matched.has(player.id));
    if(sideRows.length===5&&sidePlayers.length===5&&confirmed.length===4&&unresolved.length===1&&remaining.length===1&&
      sideRows.every(row=>Number.isInteger(row.rowIndex))&&new Set(sideRows.map(row=>row.rowIndex)).size===5&&
      new Set(sidePlayers.map(player=>player.id)).size===5&&new Set(sidePlayers.map(player=>player.championId)).size===5&&sidePlayers.every(player=>player.championId)){
      matched.set(remaining[0].id,{...unresolved[0],championId:remaining[0].championId,identitySource:'roster-elimination'});
    }
  }
  for(const row of rows.filter(row=>!row.championId||row.identitySource!=='portrait')){
    if([...matched.values()].some(other=>other===row||(other.team===row.team&&other.rowIndex!==undefined&&other.rowIndex===row.rowIndex)))continue;
    const key = identity(row);
    if (rows.filter(other => identity(other) === key).length !== 1) continue;
    const candidates = players.filter(player => identity(player) === key);
    if (candidates.length === 1 && !matched.has(candidates[0].id)) matched.set(candidates[0].id, row);
  }
  return matched;
}

export function matchPlayerScoreboardRows(rows: PlayerScoreboardRow[], players: Player[]): Map<string, PlayerScoreboardRow> { return matchRows(rows,players); }
export function matchPlayerGoldRows(rows: PlayerGoldRow[], players: Player[]): Map<string, PlayerGoldRow> { return matchRows(rows,players); }
