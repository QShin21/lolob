import { test } from 'node:test';
import assert from 'node:assert/strict';
import type OBSWebSocket from 'obs-websocket-js';
import type { PlayerFeedSettings, Side } from '../shared/types';
import { ObsBroadcast } from './obs-broadcast';
import { Adapters, ChampionCatalog } from './adapters';
import { createSeed } from './state';
import { engineScene, enginePreviewScene } from './obs-engine';

const names={blue:'RiftCast 蓝方选手摄像头',red:'RiftCast 红方选手摄像头'};
const feeds:Record<Side,PlayerFeedSettings>={
  blue:{mode:'camera',cameraDeviceId:'camera-blue',imageUrl:'',label:'Raptor'},
  red:{mode:'camera',cameraDeviceId:'camera-red',imageUrl:'',label:'Heng'}
};
const scenes=[{sceneName:engineScene,hudName:'RiftCast HUD',visible:true},{sceneName:enginePreviewScene,hudName:'RiftCast 预监 HUD',visible:false}];

class CameraObs {
  requests:{type:string;data:any}[]=[];
  inputs:{inputName:string;inputKind:string}[]=[{inputName:'RiftCast HUD',inputKind:'browser_source'},{inputName:'RiftCast 预监 HUD',inputKind:'browser_source'}];
  items=new Map<string,{sourceName:string;sceneItemId:number}[]>([
    [engineScene,[{sourceName:'RiftCast 游戏画面',sceneItemId:1},{sourceName:'RiftCast HUD',sceneItemId:2}]],
    [enginePreviewScene,[{sourceName:'RiftCast 游戏画面',sceneItemId:3},{sourceName:'RiftCast 预监 HUD',sceneItemId:4}]]
  ]);
  nextId=5;
  settings=new Map<string,Record<string,unknown>>();
  video={baseWidth:1920,baseHeight:1080};
  failDevices=false;
  devices=[{itemName:'Blue USB Camera',itemValue:'camera-blue',itemEnabled:true},{itemName:'Red USB Camera',itemValue:'camera-red',itemEnabled:true}];
  call=(async(type:string,data:any)=>{
    this.requests.push({type,data});
    if(type==='GetSceneList')return {scenes:[{sceneName:engineScene},{sceneName:enginePreviewScene}],currentProgramSceneName:engineScene};
    if(type==='GetInputList')return {inputs:[...this.inputs]};
    if(type==='GetSceneItemList')return {sceneItems:this.items.get(data.sceneName)!.map(item=>({...item}))};
    if(type==='GetVideoSettings')return this.video;
    if(type==='GetInputSettings')return {inputKind:'dshow_input',inputSettings:this.settings.get(data.inputName)??{}};
    if(type==='GetInputPropertiesListPropertyItems'){
      if(this.failDevices)throw new Error('simulated DirectShow failure');
      return {propertyItems:this.devices};
    }
    if(type==='CreateInput'){
      this.inputs.push({inputName:data.inputName,inputKind:data.inputKind});
      this.settings.set(data.inputName,data.inputSettings??{});
      const sceneItemId=this.nextId++;this.items.get(data.sceneName)!.push({sourceName:data.inputName,sceneItemId});
      return {sceneItemId};
    }
    if(type==='CreateSceneItem'){
      const sceneItemId=this.nextId++;this.items.get(data.sceneName)!.push({sourceName:data.sourceName,sceneItemId});return {sceneItemId};
    }
    if(type==='RemoveInput'){
      this.inputs=this.inputs.filter(input=>input.inputName!==data.inputName);
      this.settings.delete(data.inputName);
      for(const [scene,items]of this.items)this.items.set(scene,items.filter(item=>item.sourceName!==data.inputName));
      return {};
    }
    if(type==='SetInputSettings'){this.settings.set(data.inputName,{...this.settings.get(data.inputName),...data.inputSettings});return {};}
    if(['SetInputMute','SetSceneItemTransform','SetSceneItemEnabled','SetSceneItemIndex'].includes(type))return {};
    throw new Error(`Unexpected OBS request ${type}`);
  }) as OBSWebSocket['call'];
}

test('camera enumeration reads actual OBS device identifiers and removes its disabled probe',async()=>{
  const obs=new CameraObs();
  obs.devices.push({itemName:'Duplicate',itemValue:'camera-blue',itemEnabled:true},{itemName:'Unavailable',itemValue:'gone',itemEnabled:false},{itemName:'Empty',itemValue:'',itemEnabled:true});
  const controller=new ObsBroadcast(()=>true,obs.call);
  const result=await controller.cameraDevices();
  assert.deepEqual(result.devices,[{name:'Blue USB Camera',id:'camera-blue'},{name:'Red USB Camera',id:'camera-red'}]);
  const probe=obs.requests.find(request=>request.type==='CreateInput')!;
  assert.equal(probe.data.inputKind,'dshow_input');
  assert.equal(probe.data.sceneItemEnabled,false);
  assert.equal(probe.data.inputSettings.video_device_id,'');
  assert.equal(probe.data.inputSettings.deactivate_when_not_showing,true);
  assert.deepEqual(obs.requests.find(request=>request.type==='RemoveInput')!.data,{inputName:probe.data.inputName});
  assert.ok(!obs.inputs.some(input=>input.inputName===probe.data.inputName));
  assert.ok(!obs.requests.some(request=>request.type.startsWith('Set')||['StartStream','StopStream','SetCurrentProgramScene'].includes(request.type)));
});

test('device enumeration reuses an existing DirectShow source and cleans a probe after failed properties',async()=>{
  const existing=new CameraObs();existing.inputs.push({inputName:'User camera',inputKind:'dshow_input'});
  await new ObsBroadcast(()=>true,existing.call).cameraDevices();
  assert.equal(existing.requests.find(request=>request.type==='GetInputPropertiesListPropertyItems')!.data.inputName,'User camera');
  assert.ok(!existing.requests.some(request=>['CreateInput','RemoveInput','SetInputSettings'].includes(request.type)));
  const failed=new CameraObs();failed.failDevices=true;
  await assert.rejects(new ObsBroadcast(()=>true,failed.call).cameraDevices(),/OBS 操作失败/);
  assert.equal(failed.requests.filter(request=>request.type==='RemoveInput').length,1);
  assert.ok(!failed.inputs.some(input=>input.inputKind==='dshow_input'));
});

test('two cameras cover only their exact panels, mute camera audio and sit under both browser buses',async()=>{
  const obs=new CameraObs();const controller=new ObsBroadcast(()=>true,obs.call);
  assert.deepEqual(await controller.applyPlayerFeeds(feeds,scenes),{applied:true,scenes:[engineScene,enginePreviewScene]});
  const cameras=obs.requests.filter(request=>request.type==='CreateInput'&&Object.values(names).includes(request.data.inputName));
  assert.equal(cameras.length,2);
  for(const side of ['blue','red'] as const){
    const created=cameras.find(request=>request.data.inputName===names[side])!;
    assert.equal(created.data.inputKind,'dshow_input');assert.equal(created.data.sceneItemEnabled,false);
    assert.equal(created.data.inputSettings.video_device_id,feeds[side].cameraDeviceId);
    assert.ok(obs.requests.some(request=>request.type==='SetInputMute'&&request.data.inputName===names[side]&&request.data.inputMuted===true));
    for(const scene of scenes){
      const item=obs.items.get(scene.sceneName)!.find(item=>item.sourceName===names[side])!;
      const transform=obs.requests.find(request=>request.type==='SetSceneItemTransform'&&request.data.sceneName===scene.sceneName&&request.data.sceneItemId===item.sceneItemId)!.data.sceneItemTransform;
      assert.equal(transform.positionX,side==='blue'?306:1424);assert.equal(transform.positionY,829.4);
      assert.equal(transform.boundsWidth,190);assert.equal(transform.boundsHeight,250.6);
      assert.equal(transform.boundsType,'OBS_BOUNDS_SCALE_OUTER');assert.equal(transform.cropToBounds,true);
      assert.equal(transform.alignment,5);assert.equal(transform.boundsAlignment,0);
      assert.equal(obs.requests.find(request=>request.type==='SetSceneItemEnabled'&&request.data.sceneItemId===item.sceneItemId)!.data.sceneItemEnabled,scene.visible);
    }
  }
  for(const scene of scenes){
    const indexes=obs.requests.filter(request=>request.type==='SetSceneItemIndex'&&request.data.sceneName===scene.sceneName);
    const hud=obs.items.get(scene.sceneName)!.find(item=>item.sourceName===scene.hudName)!;
    assert.equal(indexes.at(-1)!.data.sceneItemId,hud.sceneItemId);
    assert.equal(indexes.at(-1)!.data.sceneItemIndex,obs.items.get(scene.sceneName)!.length-1);
  }
  assert.ok(!obs.requests.some(request=>['StartStream','StopStream','StartRecord','StopRecord','SetCurrentProgramScene','SetCurrentPreviewScene'].includes(request.type)));
  assert.ok(!obs.requests.some(request=>request.type==='SetSceneItemTransform'&&[1,3].includes(request.data.sceneItemId)));
});

test('camera rectangles follow HUD letterboxing on a non 16:9 OBS canvas',async()=>{
  const obs=new CameraObs();obs.video={baseWidth:1280,baseHeight:800};
  await new ObsBroadcast(()=>true,obs.call).applyPlayerFeeds(feeds,scenes.slice(0,1));
  const item=obs.items.get(engineScene)!.find(item=>item.sourceName===names.blue)!;
  const transform=obs.requests.find(request=>request.type==='SetSceneItemTransform'&&request.data.sceneItemId===item.sceneItemId)!.data.sceneItemTransform;
  assert.ok(Math.abs(transform.positionX-204)<.0001);
  assert.ok(Math.abs(transform.positionY-(40+829.4*2/3))<.0001);
  assert.ok(Math.abs(transform.boundsWidth-190*2/3)<.0001);
  assert.ok(Math.abs(transform.boundsHeight-250.6*2/3)<.0001);
});

test('both panels can share one camera without opening the same USB device twice',async()=>{
  const obs=new CameraObs();const controller=new ObsBroadcast(()=>true,obs.call);
  await controller.applyPlayerFeeds({blue:feeds.blue,red:{...feeds.red,cameraDeviceId:feeds.blue.cameraDeviceId}},scenes);
  assert.equal(obs.inputs.filter(input=>input.inputKind==='dshow_input').length,1);
  for(const scene of scenes){
    const items=obs.items.get(scene.sceneName)!.filter(item=>item.sourceName===names.blue);
    assert.equal(items.length,2);
    const positions=obs.requests.filter(request=>request.type==='SetSceneItemTransform'&&request.data.sceneName===scene.sceneName).map(request=>request.data.sceneItemTransform.positionX);
    assert.deepEqual(positions,[306,1424]);
  }
  obs.requests=[];
  await controller.applyPlayerFeeds({blue:feeds.blue,red:{...feeds.red,cameraDeviceId:feeds.blue.cameraDeviceId}},scenes.map(scene=>({...scene,visible:true})));
  assert.ok(!obs.requests.some(request=>request.type==='CreateInput'||request.type==='CreateSceneItem'||request.type==='SetInputSettings'));
});

test('swapping camera devices releases both owned inputs before changing selections',async()=>{
  const obs=new CameraObs();const controller=new ObsBroadcast(()=>true,obs.call);await controller.applyPlayerFeeds(feeds,scenes);
  obs.requests=[];
  await controller.applyPlayerFeeds({blue:{...feeds.blue,cameraDeviceId:feeds.red.cameraDeviceId},red:{...feeds.red,cameraDeviceId:feeds.blue.cameraDeviceId}},scenes);
  const firstSettings=obs.requests.findIndex(request=>request.type==='SetInputSettings');
  const disabled=obs.requests.slice(0,firstSettings).filter(request=>request.type==='SetSceneItemEnabled'&&request.data.sceneItemEnabled===false);
  assert.equal(disabled.length,4);
  assert.equal(obs.requests.filter(request=>request.type==='SetInputSettings').length,2);
});

test('switching to image or off disables both camera buses without touching uploaded images',async()=>{
  const obs=new CameraObs();const controller=new ObsBroadcast(()=>true,obs.call);await controller.applyPlayerFeeds(feeds,scenes);
  obs.requests=[];
  await controller.applyPlayerFeeds({blue:{...feeds.blue,mode:'image',imageUrl:'/uploads/player.png'},red:{...feeds.red,mode:'off'}},scenes);
  const visibility=obs.requests.filter(request=>request.type==='SetSceneItemEnabled');
  assert.equal(visibility.length,4);assert.ok(visibility.every(request=>request.data.sceneItemEnabled===false));
  assert.ok(!obs.requests.some(request=>['CreateInput','CreateSceneItem','GetInputPropertiesListPropertyItems','SetInputSettings','SetSceneItemTransform'].includes(request.type)));
});

test('unknown devices and conflicting source types cannot change existing camera selections',async()=>{
  const missing=new CameraObs();await assert.rejects(new ObsBroadcast(()=>true,missing.call).applyPlayerFeeds({...feeds,blue:{...feeds.blue,cameraDeviceId:'gone'}},scenes),/已不可用/);
  assert.ok(!missing.requests.some(request=>request.type.startsWith('Set')));
  assert.ok(!missing.inputs.some(input=>Object.values(names).includes(input.inputName)));
  const conflict=new CameraObs();conflict.inputs.push({inputName:names.red,inputKind:'image_source'});
  await assert.rejects(new ObsBroadcast(()=>true,conflict.call).applyPlayerFeeds(feeds,scenes),/类型冲突/);
  assert.deepEqual(conflict.requests.map(request=>request.type),['GetInputList']);
  const disconnected=new ObsBroadcast(()=>false,missing.call);await assert.rejects(disconnected.cameraDevices(),/请先连接 OBS/);
});

test('adapter sync caches stable settings and updates camera visibility independently for program and preview',async()=>{
  const state=createSeed();state.connections.obs.status='connected';state.programScene='live';state.previewScene='draft';state.overlay.playerFeeds=structuredClone(feeds);
  const obs=new CameraObs();const adapters=new Adapters(()=>state,work=>work(state),new ChampionCatalog('unused'));
  (adapters as any).obs.call=obs.call;
  await adapters.syncPlayerFeeds();
  const count=obs.requests.length;state.stats.blue.kills++;await adapters.syncPlayerFeeds();assert.equal(obs.requests.length,count);
  state.previewScene='live';obs.requests=[];await adapters.syncPlayerFeeds();
  assert.ok(obs.requests.filter(request=>request.type==='SetSceneItemEnabled').every(request=>request.data.sceneItemEnabled===true));
  state.programScene='standby';obs.requests=[];await adapters.syncPlayerFeeds();
  const enabled=obs.requests.filter(request=>request.type==='SetSceneItemEnabled');
  assert.ok(enabled.filter(request=>request.data.sceneName===engineScene).every(request=>request.data.sceneItemEnabled===false));
  assert.ok(enabled.filter(request=>request.data.sceneName===enginePreviewScene).every(request=>request.data.sceneItemEnabled===true));
  obs.requests=[];state.overlay.players=false;await adapters.syncPlayerFeeds();assert.equal(obs.requests.length,0);
});

test('failed camera sync is throttled across broadcast ticks and retries a changed selection immediately',async()=>{
  const state=createSeed();state.connections.obs.status='connected';state.overlay.playerFeeds=structuredClone(feeds);state.overlay.playerFeeds.blue.cameraDeviceId='missing';
  const obs=new CameraObs();const adapters=new Adapters(()=>state,work=>work(state),new ChampionCatalog('unused'));(adapters as any).obs.call=obs.call;
  await assert.rejects(adapters.syncPlayerFeeds(),/已不可用/);
  const count=obs.requests.length;
  for(let i=0;i<5;i++)assert.equal((await adapters.syncPlayerFeeds()).applied,false);
  assert.equal(obs.requests.length,count);
  await assert.rejects(adapters.syncPlayerFeeds(true),/已不可用/);
  assert.ok(obs.requests.length>count,'Explicit camera retry bypasses automatic failure backoff');
  state.overlay.playerFeeds.blue.cameraDeviceId=feeds.blue.cameraDeviceId;assert.equal((await adapters.syncPlayerFeeds()).applied,true);
  assert.ok(obs.requests.length>count);
});
