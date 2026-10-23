import { open } from 'node:fs/promises';
import { damageProtocolForProfile, parseReplayDamage, type ReplayDamageIndex } from './replay-damage';

type Json=Record<string,any>;
async function loadReplay(file:string,cancelled:()=>boolean):Promise<ReplayDamageIndex>{
  const handle=await open(file,'r');
  try{
    const before=await handle.stat();
    if(!before.isFile()||before.size>128*1024*1024)throw Error('回放文件过大或无效');
    const bytes=await handle.readFile(),after=await handle.stat();
    if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('回放文件仍在写入');
    return await parseReplayDamage(bytes,cancelled);
  }finally{await handle.close();}
}

/** Decode in the background once per process/file. Never expose paths or future totals to program state. */
export class ReplayDamageTelemetry {
  private session='';
  private generation=0;
  private index?:ReplayDamageIndex;
  private pending?:Promise<void>;
  detail='等待回放伤害数据';
  constructor(private load=loadReplay){}
  reset(){
    this.generation++;this.session='';this.index=undefined;this.pending=undefined;
    this.detail='等待回放伤害数据';
  }
  enrich(sample:Json):boolean{
    const protocol=damageProtocolForProfile(sample.profile);
    if(!protocol||!sample.ok||!Number.isInteger(sample.pid)||
      typeof sample.processSession!=='string'||typeof sample.replayPath!=='string'||!sample.replayPath.toLowerCase().endsWith('.rofl')){
      if(this.session)this.reset();return false;
    }
    const session=`${sample.profile}:${sample.pid}:${sample.processSession}:${sample.replayPath}`;
    if(session!==this.session){
      this.reset();this.session=session;this.detail='正在解析回放逐次伤害';
      const generation=this.generation;
      this.pending=this.load(sample.replayPath,()=>generation!==this.generation).then(index=>{
        if(generation===this.generation){this.index=index;this.detail='回放逐次伤害已连接';}
      }).catch(()=>{
        if(generation===this.generation)this.detail='当前回放伤害校验未通过';
      });
    }
    if(!this.index||this.index.build!==protocol.build||!Array.isArray(sample.players)||sample.players.length!==10)return false;
    const roster=new Map(this.index.heroes.map(h=>[h.networkId,h]));
    const pairs=sample.players.map((p:Json)=>({p,h:roster.get(p.networkId),damage:this.index!.at(p.networkId,sample.gameTime)}));
    if(new Set(sample.players.map((p:Json)=>p.networkId)).size!==10||
      pairs.some(({p,h,damage})=>!h||h.champion!==p.champion||h.team!==p.team||!damage))return false;
    for(const {p,damage} of pairs){p.damageStats=damage;p.damageStatsSource='packets';p.damageStatsSession=`replay:${sample.pid}:${sample.processSession}`;p.damageStatsSince=0;}
    return true;
  }
  /** Used by bounded integration checks, never to block normal telemetry polling. */
  async settled(){await this.pending;}
  timeline(){return this.index;}
}
