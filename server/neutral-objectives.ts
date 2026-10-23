import type { NeutralObjective, NeutralSample } from '../shared/combat-display';

/** Summoner's Rift 2026 rules. Rebuild from the full event log, so seeks and repeated polls are idempotent. */
export function neutralObjectives(data: Record<string,any>, now=Date.now()): NeutralSample | undefined {
  const time=data.gameData?.gameTime,raw=data.events?.Events;
  const observed=data._observerObjectives;
  if(data.gameData?.mapNumber===11&&data.gameData?.gameMode==='CLASSIC'&&observed&&['cn-16.20.824.8524','cn-16.21.829.9102'].includes(observed.profile)&&Math.abs(observed.gameTime-time)<2&&now-Date.parse(observed.sampledAt)>=-1000&&now-Date.parse(observed.sampledAt)<=3000&&Array.isArray(observed.objectives)&&observed.objectives.length===2&&observed.objectives.every((o:any)=>['grubs','herald','baron','dragon','elder'].includes(o.kind)&&['alive','countdown','unknown'].includes(o.state)&&(o.state!=='countdown'||Number.isFinite(o.dueAt)&&o.dueAt>time&&o.dueAt<time+900)))return observed;
  if(!Number.isFinite(time)||time<0||data.gameData?.mapNumber!==11||data.gameData?.gameMode!=='CLASSIC'||!Array.isArray(raw))return;
  const profile=String(data._observerProfile??data.gameData?.gameVersion??'');
  if(!/^(cn-16\.|16\.|26\.)/.test(profile))return;
  const events=raw.filter(e=>Number.isFinite(e.EventTime)&&e.EventTime>=0&&e.EventTime<=time).sort((a,b)=>a.EventTime-b.EventTime);
  const complete=data._eventHistoryComplete===true&&events.some(e=>e.EventName==='GameStart');
  const latest=(name:string)=>events.filter(e=>e.EventName===name).at(-1);
  const status=(kind:NeutralObjective['kind'],dueAt:number,element?:string):NeutralObjective=>({kind,element,state:complete?(time<dueAt?'countdown':'alive'):'unknown',...(complete?{dueAt}: {})});
  let top:NeutralObjective;
  const grubs=events.filter(e=>['HordeKill','VoidGrubKill','VoidGrubsKill'].includes(e.EventName));
  if(time<885&&grubs.length<3)top=status('grubs',480);
  else if(time<1185&&!latest('HeraldKill'))top=status('herald',900);
  else top=status('baron',latest('BaronKill')?latest('BaronKill').EventTime+360:1200);
  const dragons=events.filter(e=>e.EventName==='DragonKill'),last=dragons.at(-1);
  const counts={ORDER:0,CHAOS:0};let soul=false;
  for(const event of dragons){
    if(String(event.DragonType).toLowerCase()==='elder'){soul=true;continue;}
    const killer=(data.allPlayers??[]).find((p:any)=>[p.riotId,p.summonerName,p.riotIdGameName].includes(event.KillerName));
    const side=killer?.team as keyof typeof counts;if(side in counts&&++counts[side]>=4)soul=true;
  }
  const elder=soul||String(last?.DragonType).toLowerCase()==='elder';
  // The first two elements are random; retain an explicit unknown element until observed.
  const element=!elder&&dragons.length>=3?String(last?.DragonType??'').toLowerCase():undefined;
  const bottom=status(elder?'elder':'dragon',last?last.EventTime+(elder?360:300):300,element);
  return {gameTime:time,sampledAt:new Date(now).toISOString(),validForMs:5000,profile,objectives:[top,bottom]};
}

/** API fallback is trusted only after continuous observation from the opening seconds. */
export class ObjectiveEventContinuity {
  private previous?:{time:number;at:number}; private complete=false;
  observe(data:Record<string,any>,now=Date.now()) {
    const time=data.gameData?.gameTime;
    if(!Number.isFinite(time)){this.complete=false;return;}
    const previous=this.previous;
    if(!previous||time<previous.time-.5)this.complete=time<=30;
    else if(time-previous.time>Math.max(3,(now-previous.at)/1000*4+1))this.complete=false;
    this.previous={time,at:now};data._eventHistoryComplete=this.complete;
  }
}
