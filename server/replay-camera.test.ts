import {test} from 'node:test';
import assert from 'node:assert/strict';
import {focusReplayCamera} from './replay-camera';
import type {LocalRequest} from './replay';
const focus={name:'选手甲',champion:'Xayah',reason:'killer' as const};
function fixture(){
 let elapsed=0,gameTime=100,selected='',pid=10,seeking=false;
 const writes:unknown[]=[],writeTimes:number[]=[];
 const request:LocalRequest=async(_port,route,options)=>{
  if(route==='/replay/game')return {processID:pid};
  if(route==='/replay/playback')return {time:75,paused:false,speed:1,seeking};
  if(route==='/liveclientdata/gamestats')return {gameTime};
  if(options?.method==='POST'){writes.push(options.body);writeTimes.push(elapsed);return {};}
  return {cameraMode:'top',cameraAttached:true,selectionName:selected};
 };
 return {request,writes,writeTimes,clock:{now:()=>elapsed,wait:async(ms:number)=>{elapsed+=ms;},timeoutMs:1000},
  set:(v:{time?:number;selected?:string;pid?:number;seeking?:boolean})=>{gameTime=v.time??gameTime;selected=v.selected??selected;pid=v.pid??pid;seeking=v.seeking??seeking;}};
}
test('camera waits for actual seek completion and confirms the killer without changing HUD properties',async()=>{
 const f=fixture();f.set({selected:'选手甲#12345'});
 const wait=f.clock.wait;f.clock.wait=async ms=>{await wait(ms);if(f.clock.now()>=400)f.set({time:75});};
 const result=await focusReplayCamera(f.request,focus,75,10,()=>true,f.clock);
 assert.equal(result.status,'following');assert(f.writeTimes[0]>=400);
 assert.deepEqual(f.writes,[{selectionName:'选手甲',cameraMode:'top',cameraAttached:true}]);
});
test('HTTP success with a different selected unit is not reported as successful camera following',async()=>{
 const f=fixture();f.set({time:75,selected:'其他选手'});
 const result=await focusReplayCamera(f.request,focus,75,10,()=>true,f.clock);
 assert.equal(result.status,'unavailable');assert.equal(f.writes.length,2);
});
test('a changed game process or session cancels camera writes',async()=>{
 const f=fixture();f.set({time:75,pid:11});
 assert.equal((await focusReplayCamera(f.request,focus,75,10,()=>true,f.clock)).status,'unavailable');assert.equal(f.writes.length,0);
 f.set({pid:10});assert.equal((await focusReplayCamera(f.request,focus,75,10,()=>false,f.clock)).status,'unavailable');assert.equal(f.writes.length,0);
});
test('unfinished seeking or unavailable camera preserves the successful time jump and reports a limited result',async()=>{
 const f=fixture();f.set({time:75,seeking:true});
 assert.equal((await focusReplayCamera(f.request,focus,75,10,()=>true,f.clock)).status,'unavailable');assert.equal(f.writes.length,0);
 const broken:LocalRequest=async()=>{throw Error('unavailable');};
 assert.equal((await focusReplayCamera(broken,focus,75,10,()=>true,f.clock)).status,'unavailable');
});
