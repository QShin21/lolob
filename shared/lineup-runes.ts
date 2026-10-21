import catalog from './rune-catalog.json';
import type {Player} from './types';
const selected=new Set(catalog.runes.map(r=>r.id).filter(id=>![8000,8100,8200,8300,8400].includes(id)));
const trees=new Map<number,number>();let tree=0;
for(const r of catalog.runes){if(!selected.has(r.id))tree=r.id;else trees.set(r.id,tree);}
export function selectedRuneIds(full:unknown):number[]|undefined {
 if(!full||typeof full!=='object')return;
 const raw=(full as {generalRunes?:unknown}).generalRunes;if(!Array.isArray(raw)||raw.length!==6)return;
 const ids=raw.map(r=>r&&typeof r==='object'?(r as {id?:number}).id:undefined);
 if(ids.some(id=>!id||!selected.has(id))||new Set(ids).size!==6)return;
 if(ids.slice(0,4).some(id=>trees.get(id!)!==trees.get(ids[0]!))||
   trees.get(ids[4]!)!==trees.get(ids[5]!)||trees.get(ids[0]!)===trees.get(ids[4]!))return;
 return ids as number[];
}
export function compactRunes(player?:Player):number[]{
 const ids=[player?.runeSelection?.keystoneId??player?.runeIds?.[0],player?.runeSelection?.secondaryTreeId??player?.runeIds?.[2]];
 return [...new Set(ids.filter((id):id is number=>!!id&&catalog.runes.some(r=>r.id===id)))];
}
export function lineupRunes(player?:Player):number[]{
 return selectedRuneIds({generalRunes:player?.fullRuneIds?.map(id=>({id}))})??compactRunes(player).filter(id=>selected.has(id));
}
