import type { BroadcastState, Player, Side } from '../shared/types';

const roles=[['上单','TOP'],['打野','JUNGLE'],['中单','MIDDLE','MID'],['下路','BOTTOM','BOT','ADC'],['辅助','UTILITY','SUPPORT']];
/** Pair both teams by lane even when the upstream roster arrives in another order. */
export function bottomPlayers(state:Pick<BroadcastState,'players'>,side:Side):(Player|undefined)[] {
  const members=state.players.filter(p=>p.team===side).slice(0,5),used=new Set<string>();
  const ordered=roles.map(names=>{const p=members.find(member=>names.includes(member.role.toUpperCase()));if(p)used.add(p.id);return p;});
  return ordered.map(p=>p||members.find(member=>{if(used.has(member.id))return false;used.add(member.id);return true;}));
}
/** Live row differences use fresh cumulative OCR samples; current gold and item prices are excluded. */
export function bottomGoldDifference(mode:BroadcastState['mode'],blue?:Player,red?:Player,now=Date.now()):number|null {
  const canonical=(p?:Player)=>roles.findIndex(names=>names.includes(p?.role.toUpperCase()??''));
  if(mode==='live'&&(canonical(blue)<0||canonical(blue)!==canonical(red)||blue?.team===red?.team))return null;
  const valid=(p?:Player)=>!!p&&p.gold!==null&&Number.isFinite(p.gold)&&(mode==='demo'||(['api','ocr'].includes(p.goldSource??'')&&Number.isFinite(Date.parse(p.goldSampledAt??''))&&now-Date.parse(p.goldSampledAt!)>=-1000&&now-Date.parse(p.goldSampledAt!)<=10000&&(!p.goldExpiresAt||Date.parse(p.goldExpiresAt)>now)));
  if(mode==='live'&&(!Number.isFinite(blue?.goldGameTime)||!Number.isFinite(red?.goldGameTime)||Math.abs(blue!.goldGameTime!-red!.goldGameTime!)>2||Math.abs(Date.parse(blue?.goldSampledAt??'')-Date.parse(red?.goldSampledAt??''))>2000))return null;
  return valid(blue)&&valid(red)?blue!.gold!-red!.gold!:null;
}
export function bottomItemSlots(player?:Player):number[] {
  if(player?.itemSlots)return Array.from({length:7},(_,i)=>player.itemSlots?.[i]||0);
  // Old compact inventories place a trinket after fewer than six equipment items.
  const items=[...(player?.items||[])];const trinketIndex=items.findIndex(id=>[3340,3363,3364].includes(id));
  const trinket=trinketIndex<0?0:items.splice(trinketIndex,1)[0];
  return [...Array.from({length:6},(_,i)=>items[i]||0),trinket];
}
