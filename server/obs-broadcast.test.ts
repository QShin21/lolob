import { test } from 'node:test';
import assert from 'node:assert/strict';
import type OBSWebSocket from 'obs-websocket-js';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { ObsBroadcast } from './obs-broadcast';
import { lanAddresses } from './security';

const stopped={outputActive:false,outputReconnecting:false,outputTimecode:'00:00:00.000',outputDuration:0,outputCongestion:0,outputBytes:0,outputSkippedFrames:0,outputTotalFrames:0};
const destination={server:'rtmp://192.0.2.10:1935',key:'example-only-test-stream-key'};
const overlayUrl='http://127.0.0.1:3888/overlay';

test('RTMP configuration checks inactive OBS and returns only a credential-free confirmation',async()=>{
  const requests:{type:string;data:any}[]=[];
  const controller=new ObsBroadcast(()=>true,(async(type,data)=>{requests.push({type,data});return type==='GetStreamStatus'?{...stopped,key:destination.key}:{};}) as OBSWebSocket['call']);
  assert.deepEqual(await controller.configure(destination),{applied:true,streamServiceType:'rtmp_custom',server:destination.server});
  assert.deepEqual(requests,[{type:'GetStreamStatus',data:undefined},{type:'SetStreamServiceSettings',data:{streamServiceType:'rtmp_custom',streamServiceSettings:{server:destination.server,key:destination.key,use_auth:false}}}]);
  const status=await controller.status();assert.deepEqual(status,stopped);assert.ok(!JSON.stringify(status).includes(destination.key));
  assert.ok(!requests.some(request=>['StartStream','StopStream','ToggleStream','GetStreamServiceSettings'].includes(request.type)));
});

test('RTMP configuration refuses active, reconnecting, unknown and disconnected OBS states',async()=>{
  for(const state of [{...stopped,outputActive:true},{...stopped,outputReconnecting:true},{...stopped,outputActive:undefined}]){
    const requests:string[]=[];const controller=new ObsBroadcast(()=>true,(async(type)=>{requests.push(type);return state;}) as OBSWebSocket['call']);
    await assert.rejects(controller.configure(destination));assert.deepEqual(requests,['GetStreamStatus']);
  }
  const disconnected=new ObsBroadcast(()=>false,(async()=>{throw new Error('should not be called');}) as OBSWebSocket['call']);
  await assert.rejects(disconnected.configure(destination),/请先连接 OBS/);
});

test('RTMP validation and OBS failures never include stream credentials in error messages',async()=>{
  const controller=new ObsBroadcast(()=>true,(async(type)=>{if(type==='GetStreamStatus')return stopped;throw new Error(`Rejected request ${destination.key}`);}) as OBSWebSocket['call']);
  await assert.rejects(controller.configure(destination),error=>error instanceof Error&&error.message.includes('写入失败')&&!error.message.includes(destination.key));
  for(const invalid of [{server:'https://example.test',key:destination.key},{server:'rtmp://user:password@example.test/live',key:destination.key},{server:`rtmp://example.test/live?key=${destination.key}`,key:destination.key},{server:destination.server,key:'\nsecret'}])await assert.rejects(controller.configure(invalid),error=>error instanceof Error&&!error.message.includes(destination.key));
});

test('HUD installation creates a transparent browser input and safely reuses matching sources',async()=>{
  let existing=false,added=false;const requests:{type:string;data:any}[]=[];
  const controller=new ObsBroadcast(()=>true,(async(type,data)=>{
    requests.push({type,data});
    if(type==='GetStreamStatus')return stopped;
    if(type==='GetSceneList')return {scenes:[{sceneName:'赛事直播'}]};
    if(type==='GetInputList')return {inputs:existing?[{inputName:'RiftCast HUD',inputKind:'browser_source'}]:[]};
    if(type==='GetInputSettings')return {inputKind:'browser_source',inputSettings:{url:overlayUrl,width:1920,height:1080}};
    if(type==='GetSceneItemList')return {sceneItems:added?[{sourceName:'RiftCast HUD'}]:[]};
    if(type==='GetVideoSettings')return {baseWidth:1280,baseHeight:720};
    if(type==='SetSceneItemTransform')return {};
    if(type==='CreateInput'){existing=true;added=true;return {sceneItemId:1};}
    if(type==='CreateSceneItem'){added=true;return {sceneItemId:2};}
    throw new Error('unexpected request');
  }) as OBSWebSocket['call']);
  assert.deepEqual(await controller.addHud({sceneName:'赛事直播'},overlayUrl),{sceneName:'赛事直播',inputName:'RiftCast HUD',reused:false});
  const create=requests.find(request=>request.type==='CreateInput')!;assert.equal(create.data.inputKind,'browser_source');assert.equal(create.data.inputSettings.width,1920);assert.equal(create.data.inputSettings.height,1080);assert.equal(create.data.inputSettings.url,overlayUrl);assert.match(create.data.inputSettings.css,/rgba\(0, 0, 0, 0\)/);
  assert.deepEqual(requests.find(request=>request.type==='SetSceneItemTransform')!.data,{sceneName:'赛事直播',sceneItemId:1,sceneItemTransform:{positionX:0,positionY:0,scaleX:2/3,scaleY:2/3,alignment:5,boundsType:'OBS_BOUNDS_NONE'}});
  assert.equal((await controller.addHud({sceneName:'赛事直播'},overlayUrl)).reused,true);
  assert.equal(requests.filter(request=>request.type==='SetSceneItemTransform').length,1);
  added=false;await controller.addHud({sceneName:'赛事直播'},overlayUrl);assert.equal(requests.filter(request=>request.type==='CreateInput').length,1);assert.equal(requests.filter(request=>request.type==='CreateSceneItem').length,1);
  assert.equal(requests.filter(request=>request.type==='SetSceneItemTransform').length,2);
  assert.ok(!requests.some(request=>['SetCurrentProgramScene','StartStream','SetInputSettings'].includes(request.type)));
});

test('HUD installation refuses conflicting sources, missing scenes and external URLs',async()=>{
  const requests:string[]=[];const controller=new ObsBroadcast(()=>true,(async(type)=>{
    requests.push(type);if(type==='GetStreamStatus')return stopped;if(type==='GetSceneList')return {scenes:[{sceneName:'直播'}]};if(type==='GetInputList')return {inputs:[{inputName:'RiftCast HUD'}]};if(type==='GetInputSettings')return {inputKind:'browser_source',inputSettings:{url:'http://other.test/overlay',width:1920,height:1080}};return {};
  }) as OBSWebSocket['call']);
  await assert.rejects(controller.addHud({sceneName:'直播'},overlayUrl),/同名/);
  await assert.rejects(controller.addHud({sceneName:'已删除'},overlayUrl),/场景不存在/);
  await assert.rejects(controller.addHud({sceneName:'直播'},'http://other.test/overlay'),/当前主机/);
  assert.ok(!requests.some(request=>request.startsWith('Create')||request.startsWith('Set')));
  const activeRequests:string[]=[];const active=new ObsBroadcast(()=>true,(async(type)=>{activeRequests.push(type);return {...stopped,outputActive:true};})as OBSWebSocket['call']);await assert.rejects(active.addHud({sceneName:'直播'},overlayUrl),/正在推流/);assert.deepEqual(activeRequests,['GetStreamStatus']);
});

test('Bilibili endpoints use OBS WebSocket protocol and keep keys out of HTTP, WS, files and logs',{timeout:25000},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'riftcast-obs-test-'));
  const port=await new Promise<number>((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(0,'0.0.0.0',()=>{const address=probe.address();assert.ok(address&&typeof address==='object');probe.close(error=>error?reject(error):resolve(address.port));});});
  const base=`http://127.0.0.1:${port}`;
  const mock=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise<void>(resolve=>mock.once('listening',resolve));const address=mock.address();assert.ok(address&&typeof address==='object');
  let active=false,failWrite=false;const obsRequests:{type:string;data:any}[]=[];
  mock.on('connection',socket=>{
    socket.send(JSON.stringify({op:0,d:{obsWebSocketVersion:'5.6.3',rpcVersion:1}}));
    socket.on('message',raw=>{const message=JSON.parse(raw.toString());if(message.op===1){socket.send(JSON.stringify({op:2,d:{negotiatedRpcVersion:1}}));return;}if(message.op!==6)return;
      const {requestType,requestId,requestData}=message.d;obsRequests.push({type:requestType,data:requestData});let responseData:unknown={};
      if(requestType==='GetStreamStatus')responseData={...stopped,outputActive:active};
      if(requestType==='GetSceneList')responseData={scenes:[{sceneName:'比赛'}],currentProgramSceneName:'比赛'};
      if(requestType==='GetInputList')responseData={inputs:[]};
      if(requestType==='GetInputPropertiesListPropertyItems')responseData={propertyItems:[{itemName:'USB Camera',itemValue:'test-camera',itemEnabled:true}]};
      if(requestType==='GetVideoSettings')responseData={baseWidth:1280,baseHeight:720};
      if(requestType==='CreateInput')responseData={sceneItemId:10,inputUuid:'test-uuid'};
      const failed=failWrite&&requestType==='SetStreamServiceSettings';socket.send(JSON.stringify({op:7,d:{requestType,requestId,requestStatus:failed?{result:false,code:606,comment:`mock rejects ${destination.key}`}:{result:true,code:100},responseData}}));
    });
  });
  const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),windowsHide:true,env:{...process.env,PORT:String(port),ENABLE_LAN:'1',RIFTCAST_DATA_DIR:dir,RIFTCAST_OBS_MODE:'external',DEBUG:'obs-websocket-js'},stdio:['ignore','pipe','pipe','ipc']});let diagnostics='';child.stdout?.on('data',value=>{diagnostics+=value.toString();});child.stderr?.on('data',value=>{diagnostics+=value.toString();});
  let stateSocket:WebSocket|undefined;const broadcasts:string[]=[];
  const post=(url:string,input:unknown,headers:Record<string,string>={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(input)});
  try{
    let ready=false;for(let i=0;i<60;i++){try{if((await fetch(`${base}/api/health`)).ok){ready=true;break;}}catch{/* startup */}await new Promise(resolve=>setTimeout(resolve,150));}assert.ok(ready,diagnostics);
    assert.equal((await post(`${base}/api/action`,{type:'set-settings',patch:{obsUrl:`ws://127.0.0.1:${address.port}`}})).status,200);
    const savedFeeds=await post(`${base}/api/obs/player-feeds`,{});assert.equal(savedFeeds.status,200);assert.deepEqual(await savedFeeds.json(),{applied:false,detail:'摄像头配置已保存，连接 OBS 引擎后自动应用'});
    assert.equal((await post(`${base}/api/connect`,{target:'obs'})).status,200);
    stateSocket=new WebSocket(`ws://127.0.0.1:${port}/ws`);await new Promise<void>((resolve,reject)=>{stateSocket!.once('message',raw=>{broadcasts.push(raw.toString());resolve();});stateSocket!.once('error',reject);});stateSocket.on('message',raw=>broadcasts.push(raw.toString()));
    const before=await fetch(`${base}/api/state`).then(response=>response.json());
    const configured=await post(`${base}/api/obs/stream/settings`,destination);assert.equal(configured.status,200);assert.deepEqual(await configured.json(),{applied:true,streamServiceType:'rtmp_custom',server:destination.server});
    const status=await fetch(`${base}/api/obs/stream/status`).then(response=>response.json());assert.deepEqual(status,stopped);
    const after=await fetch(`${base}/api/state`).then(response=>response.json());assert.equal(after.revision,before.revision);assert.ok(!JSON.stringify(after).includes(destination.key));
    active=true;const writesBefore=obsRequests.filter(request=>request.type==='SetStreamServiceSettings').length;const refused=await post(`${base}/api/obs/stream/settings`,destination);assert.equal(refused.status,400);assert.match((await refused.json()).error,/正在推流/);assert.equal(obsRequests.filter(request=>request.type==='SetStreamServiceSettings').length,writesBefore);
    const cameras=await fetch(`${base}/api/obs/cameras`);assert.equal(cameras.status,200);assert.deepEqual((await cameras.json()).devices,[{name:'USB Camera',id:'test-camera'}]);
    const cameraProbe=obsRequests.find(request=>request.type==='CreateInput'&&request.data.inputKind==='dshow_input')!;assert.equal(cameraProbe.data.sceneItemEnabled,false);assert.ok(obsRequests.some(request=>request.type==='RemoveInput'&&request.data.inputName===cameraProbe.data.inputName));
    active=false;failWrite=true;const failed=await post(`${base}/api/obs/stream/settings`,destination);assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes(destination.key));
    const hud=await post(`${base}/api/obs/hud`,{sceneName:'比赛',url:'http://untrusted.test'});assert.equal(hud.status,200);assert.deepEqual(await hud.json(),{sceneName:'比赛',inputName:'RiftCast HUD',reused:false});assert.equal(obsRequests.find(request=>request.type==='CreateInput'&&request.data.inputKind==='browser_source')!.data.inputSettings.url,`${base}/overlay`);
    const addresses=lanAddresses();if(addresses.length){const network=await fetch(`${base}/api/network`).then(response=>response.json());const remote=`http://${addresses[0]}:${port}`;const headers={'x-control-token':network.controlToken};assert.equal((await post(`${remote}/api/obs/stream/settings`,destination,headers)).status,403);assert.equal((await post(`${remote}/api/obs/hud`,{sceneName:'比赛'},headers)).status,403);assert.equal((await fetch(`${remote}/api/obs/cameras`)).status,403);assert.equal((await post(`${remote}/api/obs/player-feeds`,{},headers)).status,403);}
    assert.ok(!obsRequests.some(request=>['StartStream','StopStream','ToggleStream','GetStreamServiceSettings','SetCurrentProgramScene'].includes(request.type)));
    await post(`${base}/api/action`,{type:'demo-pause',paused:true});
    const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.send({type:'riftcast-shutdown'});await exited;
    const persisted=await readFile(path.join(dir,'state.json'),'utf8');assert.ok(!persisted.includes(destination.key));assert.ok(broadcasts.every(raw=>!raw.includes(destination.key)));assert.ok(!diagnostics.includes(destination.key));
  }finally{
    stateSocket?.terminate();if(child.exitCode===null){child.kill();await new Promise<void>(resolve=>{child.once('exit',()=>resolve());setTimeout(resolve,3000);});}
    for(const socket of mock.clients)socket.terminate();await new Promise<void>(resolve=>mock.close(()=>resolve()));
    const absolute=path.resolve(dir);assert.ok(absolute.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(absolute).startsWith('riftcast-obs-test-'));await rm(absolute,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
});
