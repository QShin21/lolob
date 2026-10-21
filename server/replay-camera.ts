import type {ReplayCameraStatus,ReplayFocus} from '../shared/replay-director';
import {validPlayback,type LocalRequest} from './replay';

const nameKey=(name:unknown)=>typeof name==='string'?name.replace(/#[^#]*$/,'').trim().toLowerCase():'';

/** Apply selection after the game has actually finished seeking, then confirm the selected unit. */
export async function focusReplayCamera(request:LocalRequest,focus:ReplayFocus,start:number,pid:number,current:()=>boolean,
 options:{now?:()=>number;wait?:(ms:number)=>Promise<void>;timeoutMs?:number}={}):Promise<ReplayCameraStatus>{
 const now=options.now??(()=>performance.now()),wait=options.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 const began=now(),timeout=options.timeoutMs??8000;
 const unavailable=(detail:string):ReplayCameraStatus=>({status:'unavailable',target:focus.name,detail});
 try{
  let ready=false;
  while(now()-began<timeout){
   if(!current())return unavailable('游戏连接已变化，镜头操作已取消');
   const [playback,stats]=await Promise.all([request(2999,'/replay/playback'),request(2999,'/liveclientdata/gamestats')]);
   if(validPlayback(playback)&&!playback.seeking&&typeof stats?.gameTime==='number'&&Number.isFinite(stats.gameTime)&&
    stats.gameTime>=start-.5&&stats.gameTime<=start+(now()-began)/1000+2){ready=true;break;}
   await wait(200);
  }
  if(!ready)return unavailable('时间跳转尚未完成，镜头暂未切换');
  const expected=new Set([nameKey(focus.name),nameKey(focus.champion)].filter(Boolean));
  for(const selectionName of new Set([focus.name,focus.champion])){
   const game=await request(2999,'/replay/game');
   if(!current()||game.processID!==pid)return unavailable('游戏进程已变化，镜头操作已取消');
   await request(2999,'/replay/render',{method:'POST',body:{selectionName,cameraMode:'top',cameraAttached:true}});
   for(let attempt=0;attempt<3;attempt++){
    await wait(150);if(!current())return unavailable('游戏连接已变化，镜头操作已取消');
    const render=await request(2999,'/replay/render');
    if(render?.cameraAttached===true&&render.cameraMode==='top'&&expected.has(nameKey(render.selectionName)))
     return {status:'following',target:focus.name,detail:`镜头已切至 ${focus.name}，已开启跟随`};
   }
  }
  return unavailable('时间已跳转，游戏暂未确认目标镜头，请在游戏中核对');
 }catch{return unavailable('时间已跳转，镜头接口暂不可用');}
}
