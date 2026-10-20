import { decompress } from 'fzstd';
import { setImmediate } from 'node:timers/promises';
import type { DamageTotals } from '../shared/player-telemetry';
import { decodeCnDamageParameters } from './protocol/cn-16.20-damage';

export const DAMAGE_BUILD = '16.20.824.8524';
export interface DamageEvent { time: number; source: number; target: number; amount: number; type: 0 | 1 | 2 }
export interface DamageHero { networkId: number; champion: string; team: 'blue' | 'red'; officialTotal: number; officialTaken?: number }
interface Block { time: number; id: number; param: number; payload: Uint8Array }

/** ROFL2 blocks carry relative timestamps, packet IDs and object IDs across a chunk. */
export function* damageBlocks(data: Uint8Array): Generator<Block> {
  const b=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
  let cursor=0,time=0,id=0,param=0,count=0;
  const need=(n:number)=>{if(cursor+n>b.length)throw Error('截断的观战数据块');};
  while(cursor<b.length){
    if(++count>500000)throw Error('观战数据块数量异常');
    need(1);const marker=b[cursor++];
    need(marker&128?1:4);
    if(marker&128)time+=b[cursor++]/1000;else{time=b.readFloatLE(cursor);cursor+=4;}
    if(!Number.isFinite(time)||time<0||time>200000)throw Error('观战时间无效');
    need(marker&16?1:4);
    const size=marker&16?b[cursor++]:b.readUInt32LE(cursor);
    if(!(marker&16))cursor+=4;
    if(!(marker&64)){need(2);id=b.readUInt16LE(cursor);cursor+=2;}
    need(marker&32?1:4);
    if(marker&32)param=(param+b[cursor++])>>>0;else{param=b.readUInt32LE(cursor);cursor+=4;}
    need(size);const payload=b.subarray(cursor,cursor+size);cursor+=size;
    yield {time,id,param,payload};
  }
}

export function decodeDamageBlock(block: Block): DamageEvent | undefined {
  if(block.id!==359)return;
  const v=decodeCnDamageParameters(block.payload);
  const bytes=Buffer.allocUnsafe(4);bytes.writeUInt32LE(v[9]);const amount=bytes.readFloatLE();
  // The block param can identify a proxy object; use the decoded target/source fields.
  // Scripted non-hero self-destruction can carry very large finite damage.
  if(!Number.isFinite(amount)||amount<0||![0,1,2].includes(v[2]))
    throw Error('伤害数据包字段校验失败');
  return {time:block.time,target:v[1],source:v[8],amount,type:v[2] as 0|1|2};
}

type Point={time:number;total:number;physical:number;magic:number;trueDamage:number};
export class ReplayDamageIndex {
  readonly tracks=new Map<number,Point[]>();
  readonly received=new Map<number,{time:number;total:number}[]>();
  constructor(readonly heroes:DamageHero[],readonly duration:number,events:DamageEvent[]){
    const roster=new Map(heroes.map(h=>[h.networkId,h]));
    for(const h of heroes){this.tracks.set(h.networkId,[{time:0,total:0,physical:0,magic:0,trueDamage:0}]);this.received.set(h.networkId,[{time:0,total:0}]);}
    for(const e of events.sort((a,b)=>a.time-b.time)){
      const source=roster.get(e.source),target=roster.get(e.target);
      if(target&&e.amount>10000000)throw Error('英雄承伤数值异常');
      if(target){const received=this.received.get(e.target)!;received.push({time:e.time,total:received.at(-1)!.total+e.amount});}
      if(!source||!target||source.team===target.team)continue;
      if(e.amount>10000000)throw Error('英雄伤害数值异常');
      const points=this.tracks.get(e.source)!,previous=points.at(-1)!;
      points.push({time:e.time,total:previous.total+e.amount,
        physical:previous.physical+(e.type===0?e.amount:0),magic:previous.magic+(e.type===1?e.amount:0),
        trueDamage:previous.trueDamage+(e.type===2?e.amount:0)});
    }
  }
  at(networkId:number,time:number):DamageTotals|undefined{
    if(!Number.isFinite(time)||time<0||time>this.duration+2)return;
    const points=this.tracks.get(networkId);if(!points)return;
    let low=0,high=points.length;
    while(low<high){const mid=(low+high)>>>1;if(points[mid].time<=time)low=mid+1;else high=mid;}
    const p=points[Math.max(0,low-1)];
    const received=this.received.get(networkId)!;let left=0,right=received.length;while(left<right){const mid=(left+right)>>>1;if(received[mid].time<=time)left=mid+1;else right=mid;}
    return {taken:received[Math.max(0,left-1)].total,toChampions:p.total,physicalToChampions:p.physical,magicToChampions:p.magic,trueToChampions:p.trueDamage};
  }
}

/** Bounded, exact-build decoding. Only game-data chunks contribute; snapshots never count twice. */
export async function parseReplayDamage(b:Buffer, cancelled=()=>false):Promise<ReplayDamageIndex>{
  if(b.length<300||b.length>128*1024*1024||b.toString('ascii',0,4)!=='RIOT'||b.readUInt16LE(4)!==2)throw Error('不支持的回放格式');
  const headerEnd=15+b[14];
  if(b.toString('utf8',15,headerEnd)!==DAMAGE_BUILD)throw Error('回放版本尚无伤害解析配置');
  const footerLength=b.readUInt32LE(b.length-4),footerStart=b.length-4-footerLength,end=footerStart-256;
  if(footerLength<1||footerLength>2*1024*1024||end<headerEnd)throw Error('回放元数据范围异常');
  const footer=JSON.parse(b.toString('utf8',footerStart,b.length-4));
  const stats=JSON.parse(footer.statsJson),duration=Number(footer.gameLength)/1000;
  if(!Array.isArray(stats)||stats.length!==10||!Number.isFinite(duration)||duration<=0||duration>200000)throw Error('回放阵容不完整');
  let offset=headerEnd,chunks=0,firstKeyframe=false;
  const avatar:number[]=[],heroStats:number[]=[],events:DamageEvent[]=[],chunkIds=new Set<number>();
  while(offset<end){
    if(cancelled())throw Error('观战进程已更换');
    if(++chunks>20000||offset+17>end)throw Error('回放分片范围异常');
    const id=b.readUInt32LE(offset),kind=b[offset+8],decodedLength=b.readUInt32LE(offset+9),compressed=b.readUInt32LE(offset+13);
    const size=compressed||decodedLength;offset+=17;
    if(decodedLength>16*1024*1024||size>16*1024*1024||offset+size>end||![1,2,3,4].includes(kind))throw Error('回放分片长度异常');
    if(kind===1||kind===2&&!firstKeyframe){
      const stored=b.subarray(offset,offset+size);
      // Supply a bounded output buffer: malformed Zstandard headers cannot allocate arbitrary memory.
      const data=compressed?decompress(stored,new Uint8Array(decodedLength)):stored;
      if(data.length!==decodedLength)throw Error('回放解压长度异常');
      if(kind===1&&chunkIds.has(id))throw Error('重复的回放分片');
      if(kind===1)chunkIds.add(id);
      for(const block of damageBlocks(data)){
        if(kind===2){
          if(block.id===1093)avatar.push(block.param);
          if(block.id===853)heroStats.push(block.param);
        }else{
          const event=decodeDamageBlock(block);
          if(event){events.push(event);if(events.length>1000000)throw Error('伤害数据量异常');}
        }
      }
      if(kind===2)firstKeyframe=true;
    }
    offset+=size;await setImmediate();
  }
  const ids=[...new Set(avatar)].sort((a,b)=>a-b),statIds=[...new Set(heroStats)].sort((a,b)=>a-b);
  if(avatar.length!==10||heroStats.length!==10||ids.length!==10||statIds.length!==10||
    ids.some((id,i)=>id!==ids[0]+i||id!==statIds[i]))throw Error('回放英雄标识校验失败');
  const heroes:DamageHero[]=stats.map((p:any,i:number)=>{
    const champion=String(p.SKIN),team=Number(p.TEAM),officialTotal=Number(p.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS);
    if(!/^[A-Za-z0-9]{2,40}$/.test(champion)||![100,200].includes(team)||!Number.isFinite(officialTotal)||officialTotal<0)throw Error('回放选手字段无效');
    const taken=Number(p.TOTAL_DAMAGE_TAKEN);
    return {networkId:ids[i],champion,team:team===100?'blue':'red',officialTotal,...(p.TOTAL_DAMAGE_TAKEN!==undefined&&Number.isFinite(taken)&&taken>=0?{officialTaken:taken}:{})};
  });
  if(new Set(heroes.map(h=>`${h.team}:${h.champion}`)).size!==10)throw Error('回放英雄对应关系不唯一');
  const index=new ReplayDamageIndex(heroes,duration,events);
  // A new packet variant, missing pet attribution or unsupported mechanics must remain unknown.
  for(const hero of heroes){
    const total=index.at(hero.networkId,duration)?.toChampions;
    if(total===undefined||Math.abs(total-hero.officialTotal)>=1.1)throw Error('逐次伤害累计与官方赛后数据不一致');
    if(hero.officialTaken!==undefined&&Math.abs(index.at(hero.networkId,duration)!.taken!-hero.officialTaken)>=1.1)throw Error('逐次承伤累计与官方赛后数据不一致');
  }
  return index;
}
