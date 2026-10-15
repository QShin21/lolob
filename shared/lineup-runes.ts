import catalog from './rune-catalog.json';
import type {Player} from './types';
const selected=new Set(catalog.runes.map(r=>r.id).filter(id=>![8000,8100,8200,8300,8400].includes(id)));
export function selectedRuneIds(full:unknown):number[]|undefined {
 if(!full||typeof full!=='object')return;
 const raw=(full as {generalRunes?:unknown}).generalRunes;if(!Array.isArray(raw)||raw.length!==6)return;
 const ids=raw.map(r=>r&&typeof r==='object'?(r as {id?:number}).id:undefined);
 if(ids.some(id=>!id||!selected.has(id))||new Set(ids).size!==6)return;
 return ids as number[];
}
export function lineupRunes(player?:Player):number[]{
 const ids=[player?.runeSelection?.keystoneId??player?.runeIds?.[0],player?.runeSelection?.secondaryTreeId??player?.runeIds?.[2]];
 return [...new Set(ids.filter((id):id is number=>!!id&&catalog.runes.some(r=>r.id===id)))];
}
