import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import { Blowfish } from 'egoroof-blowfish';
import { DAMAGE_BUILD, damageBlocks, decodeDamageBlock, ReplayDamageIndex, type DamageEvent, type DamageHero } from './replay-damage';

type Json=Record<string,any>;
export interface ObserverStreamContext {host:string;gameId:string;platform:string;target:string;key:string}
interface Chunk {from:number;until:number;events:DamageEvent[]}
type Fetch=(url:URL,headers:Record<string,string>,signal:AbortSignal)=>Promise<Buffer>;

/** Uses the observer process's server directly, matching the game's own connection. */
export const fetchObserverBytes:Fetch=(url,headers,signal)=>new Promise((resolve,reject)=>{
  const request=http.get(url,{headers,signal},response=>{
    if(response.statusCode!==200){response.resume();reject(Error(`HTTP ${response.statusCode}`));return;}
    const buffers:Buffer[]=[];let total=0;
    response.on('data',(b:Buffer)=>{
      total+=b.length;
      if(total>16*1024*1024){response.destroy(Error('观战分片过大'));return;}
      buffers.push(b);
    });
    response.on('end',()=>resolve(Buffer.concat(buffers)));
    response.on('error',reject);
  });
  request.setTimeout(8000,()=>request.destroy(Error('观战连接超时')));
  request.on('error',reject);
});

export function decodeObserverChunk(encrypted:Buffer,key:Uint8Array):Chunk{
  if(encrypted.length===0||encrypted.length>16*1024*1024||encrypted.length%8!==0||key.length<4||key.length>56)throw Error('观战分片格式无效');
  const cipher=new Blowfish(key,Blowfish.MODE.ECB,Blowfish.PADDING.PKCS5);
  const compressed=cipher.decode(encrypted,Blowfish.TYPE.UINT8_ARRAY);
  const data=gunzipSync(compressed,{maxOutputLength:16*1024*1024});
  let from:number|undefined,until=0;
  const events:DamageEvent[]=[];
  for(const block of damageBlocks(data)){
    from??=block.time;
    if(block.time<until-.01)throw Error('观战分片时间倒退');
    until=block.time;
    const event=decodeDamageBlock(block);if(event)events.push(event);
  }
  if(from===undefined||until<from||until-from>90)throw Error('观战分片时间范围无效');
  return {from,until,events};
}

function validContext(c:unknown):c is ObserverStreamContext{
  const x=c as ObserverStreamContext;
  return !!x&&typeof x.host==='string'&&/^[a-z0-9.-]+:[0-9]{1,5}$/i.test(x.host)&&
    typeof x.gameId==='string'&&/^\d{1,20}$/.test(x.gameId)&&typeof x.platform==='string'&&/^[a-z0-9]{2,12}$/i.test(x.platform)&&
    typeof x.target==='string'&&/^[a-z0-9-]{16,100}$/i.test(x.target)&&typeof x.key==='string'&&/^[a-z0-9+/=_-]{8,256}$/i.test(x.key);
}

/** Cumulative damage from a documented capture origin; only covered game-time samples are exposed. */
export class LiveDamageStream {
  private session='';
  private generation=0;
  private epoch=0;
  private controller=new AbortController();
  private key?:Uint8Array;
  private chunks=new Map<number,Chunk>();
  private first?:number;
  private index?:ReplayDamageIndex;
  private from=0;
  private until=0;
  private retryAt=0;
  private pending?:Promise<void>;
  detail='等待实时观战伤害';
  constructor(private fetch:Fetch=fetchObserverBytes){}
  reset(){
    this.controller.abort();this.controller=new AbortController();this.generation++;this.epoch++;
    this.session='';this.key=undefined;this.chunks.clear();this.first=undefined;this.index=undefined;
    this.from=0;this.until=0;this.retryAt=0;this.pending=undefined;this.detail='等待实时观战伤害';
  }
  enrich(sample:Json,now=Date.now()):boolean{
    if(!sample.ok||sample.profile!==`cn-${DAMAGE_BUILD}`||!Number.isInteger(sample.pid)||typeof sample.processSession!=='string'||
      !validContext(sample.observerSession)||!Array.isArray(sample.players)||sample.players.length!==10){
      if(this.session)this.reset();return false;
    }
    const context=sample.observerSession,session=`${sample.pid}:${sample.processSession}:${context.gameId}`;
    if(session!==this.session){this.reset();this.session=session;}
    const heroes:DamageHero[]=sample.players.map((p:Json)=>({networkId:p.networkId,champion:p.champion,team:p.team,officialTotal:0}));
    if(new Set(heroes.map(h=>h.networkId)).size!==10||heroes.some(h=>!Number.isSafeInteger(h.networkId)||h.networkId<=0||
      !/^[A-Za-z0-9]{2,40}$/.test(h.champion)||!['blue','red'].includes(h.team)))return false;
    if(!this.pending&&now>=this.retryAt){
      const generation=this.generation,signal=this.controller.signal;
      this.retryAt=now+3000;
      this.pending=this.poll(context,heroes,generation,signal).catch(()=>{
        if(generation===this.generation)this.detail='等待完整观战伤害分片';
      }).finally(()=>{if(generation===this.generation)this.pending=undefined;});
    }
    if(!this.index||!Number.isFinite(sample.gameTime)||sample.gameTime<this.from||sample.gameTime>this.until)return false;
    const roster=new Map(this.index.heroes.map(h=>[h.networkId,h]));
    if(heroes.some(h=>roster.get(h.networkId)?.champion!==h.champion||roster.get(h.networkId)?.team!==h.team))return false;
    for(const p of sample.players){
      p.damageStats=this.index.at(p.networkId,sample.gameTime);p.damageStatsSource='packets';
      p.damageStatsSession=`${this.session}:${this.epoch}`;p.damageStatsSince=this.from;
    }
    return true;
  }
  private async poll(c:ObserverStreamContext,heroes:DamageHero[],generation:number,signal:AbortSignal){
    const origin=`http://${c.host}`,path=`${encodeURIComponent(c.platform)}/${c.gameId}`;
    const request=(route:string,headers:Record<string,string>={})=>this.fetch(new URL(route,origin),headers,signal);
    const info=JSON.parse((await request(`/observer-mode/rest/consumer/getLastChunkInfo/${path}/1/token`)).toString('utf8'));
    if(generation!==this.generation)return;
    if(!Number.isInteger(info.chunkId)||info.chunkId<1||info.chunkId>20000||!Number.isInteger(info.startGameChunkId)||info.startGameChunkId<1)throw Error('观战分片索引无效');
    if(!this.key){
      const meta=JSON.parse((await request(`/observer-mode/rest/consumer/getGameMetaData/${path}/1/token`)).toString('utf8'));
      if(String(meta.gameKey?.gameId)!==c.gameId||String(meta.gameKey?.platformId).toLowerCase()!==c.platform.toLowerCase()||
        typeof meta.decodedEncryptionKey!=='string'||meta.decodedEncryptionKey.length>128)throw Error('观战比赛信息不匹配');
      if(generation!==this.generation)return;
      this.key=Buffer.from(meta.decodedEncryptionKey,'base64');
    }
    const key=this.key;
    const last=this.chunks.size?Math.max(...this.chunks.keys()):0;
    if(last&&info.chunkId-last>4){
      // Expired server history creates a new origin; an active fight must reject this epoch change.
      this.chunks.clear();this.first=undefined;this.index=undefined;this.epoch++;
    }
    let start=this.first??Math.max(info.startGameChunkId,info.chunkId-4);
    const missing=Array.from({length:info.chunkId-start+1},(_,i)=>start+i).filter(i=>!this.chunks.has(i));
    if(missing.length>12)throw Error('观战分片窗口过大');
    const loaded=new Map<number,Chunk>();
    const failed=new Map<number,unknown>();
    await Promise.all(missing.map(async id=>{
      try{
        const data=await request(`/rest/spectator-consumer/shards/${encodeURIComponent(c.platform)}/players/${encodeURIComponent(c.target)}/game/chunks/${id}`,{'X-Riot-Spectator-Key':c.key});
        loaded.set(id,decodeObserverChunk(data,key));
      }catch(error){failed.set(id,error);}
    }));
    if(generation!==this.generation)return;
    // The metadata edge can lag server retention. On first connection only, trim
    // expired leading chunks; never skip a hole inside an existing capture.
    if(this.first===undefined)while(start<info.chunkId&&failed.get(start) instanceof Error&&
      (failed.get(start) as Error).message==='HTTP 404'){failed.delete(start);start++;}
    if(failed.size)throw Error('观战分片缺失');
    const combined=new Map([...this.chunks,...loaded]),first=this.first??start;
    const events:DamageEvent[]=[];let until=0;
    for(let id=first;id<=info.chunkId;id++){
      const chunk=combined.get(id);if(!chunk)throw Error('观战分片缺失');
      if(id>first&&(chunk.from<until-.01||chunk.from-until>1))throw Error('观战分片时间不连续');
      until=chunk.until;events.push(...chunk.events);
      if(events.length>1000000)throw Error('伤害采集数据量过大');
    }
    const index=new ReplayDamageIndex(heroes,until,events);
    this.chunks=combined;this.first=first;
    this.from=this.chunks.get(first)!.from;this.until=until;
    this.index=index;
    this.detail='实时观战逐次伤害已连接';
  }
  async settled(){await this.pending;}
}
