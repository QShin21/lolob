import type { OBSRequestTypes, OBSResponseTypes } from 'obs-websocket-js';
import { randomUUID } from 'node:crypto';
import type { PlayerFeedSettings, Side } from '../shared/types';
import { record, str, ValidationError } from './state';

type ObsCall = <T extends keyof OBSRequestTypes>(request:T,data?:OBSRequestTypes[T])=>Promise<OBSResponseTypes[T]>;
const hudName='RiftCast HUD';
const transparentCss='body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }';
const finite=(value:unknown):number=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:0;
const cameraNames={blue:'RiftCast 蓝方选手摄像头',red:'RiftCast 红方选手摄像头'} as const;
const cameraPanels={blue:{x:306,y:829.4,width:190,height:250.6},red:{x:1424,y:829.4,width:190,height:250.6}} as const;
export interface CameraScene { sceneName:string; hudName:string; visible:boolean }
type CameraDevice={name:string;id:string};

function streamDestination(input:unknown):{server:string;key:string}{
  const value=record(input);
  const server=str(value.server,2048).trim();
  const key=str(value.key,1024);
  let url:URL;
  try{url=new URL(server);}catch{throw new ValidationError('服务器地址无效，请粘贴直播应用提供的 RTMP 地址');}
  if(!['rtmp:','rtmps:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.search||url.hash||/[\u0000-\u0020\u007f]/.test(server))throw new ValidationError('服务器需为 rtmp:// 或 rtmps:// 地址，推流码请单独填写');
  if(!key.trim()||/[\u0000-\u001f\u007f]/.test(key))throw new ValidationError('请填写有效推流码');
  return {server,key};
}

/** Keeps RTMP credentials outside BroadcastState, persistence and WebSocket events. */
export class ObsBroadcast {
  private mutating=false;
  constructor(private connected:()=>boolean,private request:ObsCall){}
  private ensureConnected(){if(!this.connected())throw new Error('请先连接 OBS WebSocket 5.x');}
  private async call<T extends keyof OBSRequestTypes>(request:T,data?:OBSRequestTypes[T]):Promise<OBSResponseTypes[T]>{
    // OBS/plugin errors may contain request data. Return only our fixed message.
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([this.request(request,data),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('OBS 请求超时')),5000);})]);}catch{throw new Error(request==='SetStreamServiceSettings'?'OBS 推流配置写入失败，请确认 OBS 已停止推流且支持 WebSocket 5.x':request==='CreateInput'?(data as OBSRequestTypes['CreateInput'])?.inputKind==='dshow_input'?'OBS 无法创建摄像头来源，请确认 Windows 摄像头权限和视频采集设备组件':'OBS 无法创建浏览器来源，请确认 OBS 已安装浏览器来源组件':'OBS 操作失败，请确认连接仍然有效');}finally{if(timer)clearTimeout(timer);}
  }
  async status(){
    this.ensureConnected();
    const value=await this.call('GetStreamStatus');
    if(typeof value.outputActive!=='boolean'||typeof value.outputReconnecting!=='boolean')throw new Error('OBS 未返回有效推流状态');
    return {
      outputActive:value.outputActive,outputReconnecting:value.outputReconnecting,
      outputTimecode:typeof value.outputTimecode==='string'&&/^\d{2,}:\d{2}:\d{2}(?:\.\d+)?$/.test(value.outputTimecode)?value.outputTimecode:'00:00:00.000',
      outputDuration:finite(value.outputDuration),outputCongestion:finite(value.outputCongestion),outputBytes:finite(value.outputBytes),
      outputSkippedFrames:finite(value.outputSkippedFrames),outputTotalFrames:finite(value.outputTotalFrames)
    };
  }
  async configure(input:unknown){
    this.ensureConnected();
    const {server,key}=streamDestination(input);
    if(this.mutating)throw new ValidationError('OBS 配置正在处理中，请稍后再试');
    this.mutating=true;
    try{
      const status=await this.status();
      if(status.outputActive||status.outputReconnecting)throw new ValidationError('OBS 正在推流或重连，请先在 OBS 停止推流再应用配置');
      await this.call('SetStreamServiceSettings',{streamServiceType:'rtmp_custom',streamServiceSettings:{server,key,use_auth:false}});
      return {applied:true,streamServiceType:'rtmp_custom',server};
    }finally{this.mutating=false;}
  }
  async addHud(input:unknown,overlayUrl:string){
    this.ensureConnected();
    const sceneName=str(record(input).sceneName,200);
    if(!sceneName.trim())throw new ValidationError('请选择 OBS 场景');
    const url=new URL(overlayUrl);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/overlay'||url.username||url.password||url.search||url.hash)throw new ValidationError('HUD 来源仅允许当前主机的节目输出');
    if(this.mutating)throw new ValidationError('OBS 配置正在处理中，请稍后再试');
    this.mutating=true;
    try{
      const stream=await this.status();
      if(stream.outputActive||stream.outputReconnecting)throw new ValidationError('OBS 正在推流或重连，请先在 OBS 停止推流再添加 HUD');
      const scenes=await this.call('GetSceneList');
      if(!scenes.scenes.some(scene=>scene.sceneName===sceneName))throw new ValidationError('OBS 场景不存在，请刷新场景列表');
      const inputs=await this.call('GetInputList');
      const existing=inputs.inputs.find(source=>source.inputName===hudName);
      if(existing){
        const source=await this.call('GetInputSettings',{inputName:hudName});
        const settings=source.inputSettings;
        if(source.inputKind!=='browser_source'||settings.url!==overlayUrl||settings.width!==1920||settings.height!==1080)throw new ValidationError('OBS 中已有同名 RiftCast HUD 来源，设置与当前输出不同；请先手动改名后重试');
        const items=await this.call('GetSceneItemList',{sceneName});
        if(!items.sceneItems.some(item=>item.sourceName===hudName)){
          const video=await this.call('GetVideoSettings');
          const created=await this.call('CreateSceneItem',{sceneName,sourceName:hudName,sceneItemEnabled:true});
          await this.fitHud(sceneName,created.sceneItemId,video);
        }
        return {sceneName,inputName:hudName,reused:true};
      }
      const video=await this.call('GetVideoSettings');
      const fps=Number.isFinite(video.fpsNumerator/video.fpsDenominator)?Math.max(1,Math.min(60,Math.round(video.fpsNumerator/video.fpsDenominator))):60;
      const created=await this.call('CreateInput',{sceneName,inputName:hudName,inputKind:'browser_source',inputSettings:{url:overlayUrl,width:1920,height:1080,fps,fps_custom:true,css:transparentCss,reroute_audio:false,shutdown:false,restart_when_active:false},sceneItemEnabled:true});
      await this.fitHud(sceneName,created.sceneItemId,video);
      return {sceneName,inputName:hudName,reused:false};
    }finally{this.mutating=false;}
  }
  /** OBS's device identifiers must come from its DirectShow property list. */
  async cameraDevices():Promise<{devices:CameraDevice[];detail:string}>{
    this.ensureConnected();
    if(this.mutating)throw new ValidationError('OBS 配置正在处理中，请稍后再试');
    this.mutating=true;
    try{return {devices:await this.readCameraDevices(),detail:'摄像头由 OBS 采集并显示在局内计分板两侧'};}finally{this.mutating=false;}
  }
  private async readCameraDevices():Promise<CameraDevice[]>{
    const {inputs}=await this.call('GetInputList');
    const existing=inputs.find(input=>input.inputKind==='dshow_input');
    let probeName:string|undefined;
    let probeCreated=false;
    try{
      let inputName=existing?.inputName as string|undefined;
      if(!inputName){
        const {currentProgramSceneName}=await this.call('GetSceneList');
        if(!currentProgramSceneName)throw new ValidationError('请先创建 OBS 场景，再读取摄像头设备');
        probeName=`RiftCast 摄像头设备探测 ${randomUUID()}`;
        // A disabled source exposes properties without appearing in either output bus.
        await this.call('CreateInput',{sceneName:currentProgramSceneName,inputName:probeName,inputKind:'dshow_input',inputSettings:{video_device_id:'',deactivate_when_not_showing:true},sceneItemEnabled:false});
        probeCreated=true;
        inputName=probeName;
      }
      const {propertyItems}=await this.call('GetInputPropertiesListPropertyItems',{inputName,propertyName:'video_device_id'});
      if(!Array.isArray(propertyItems))throw new Error('OBS 未返回有效摄像头设备列表');
      const devices:CameraDevice[]=[];
      for(const item of propertyItems){
        const id=item.itemValue;
        if(item.itemEnabled===false||typeof id!=='string'||!id||id.length>2048||/[\u0000-\u001f\u007f]/.test(id)||devices.some(device=>device.id===id))continue;
        const name=typeof item.itemName==='string'?String(item.itemName).slice(0,200):'摄像头';
        devices.push({name,id});
      }
      return devices;
    }finally{if(probeName&&probeCreated)await this.call('RemoveInput',{inputName:probeName});}
  }
  /** Browser overlays provide labels; camera pixels are cropped underneath them. */
  async applyPlayerFeeds(feeds:Record<Side,PlayerFeedSettings>|undefined,scenes:CameraScene[]){
    this.ensureConnected();
    if(this.mutating)throw new ValidationError('OBS 配置正在处理中，请稍后再试');
    this.mutating=true;
    try{
      const {inputs}=await this.call('GetInputList');
      const selected=(['blue','red'] as const).filter(side=>feeds?.[side]?.mode==='camera');
      if(!selected.length&&!inputs.some(input=>Object.values(cameraNames).some(name=>input.inputName===name)))return {applied:true,scenes:[]};
      for(const side of selected){
        const id=feeds![side].cameraDeviceId;
        if(typeof id!=='string'||!id||id.length>2048||/[\u0000-\u001f\u007f]/.test(id))throw new ValidationError('请选择有效的选手摄像头设备');
      }
      // Validate both sources and every scene before changing a camera or its transform.
      for(const side of ['blue','red'] as const){
        const existing=inputs.find(input=>input.inputName===cameraNames[side]);
        if(existing&&existing.inputKind!=='dshow_input')throw new ValidationError(`OBS 中同名 ${cameraNames[side]} 来源类型冲突，请先手动改名`);
      }
      const targets:({scene:CameraScene;items:OBSResponseTypes['GetSceneItemList']['sceneItems']})[]=[];
      for(const scene of scenes){
        const {sceneItems}=await this.call('GetSceneItemList',{sceneName:scene.sceneName});
        if(!sceneItems.some(item=>item.sourceName===scene.hudName))continue;
        targets.push({scene,items:sceneItems});
      }
      if(!targets.length)return {applied:false,detail:'请先将 HUD 添加到 OBS 场景'};
      if(selected.length){
        const devices=await this.readCameraDevices();
        if(selected.some(side=>!devices.some(device=>device.id===feeds![side].cameraDeviceId)))throw new ValidationError('选择的摄像头已不可用，请刷新摄像头列表');
      }
      const video=selected.length?await this.call('GetVideoSettings'):undefined;
      if(video&&(!Number.isFinite(video.baseWidth)||!Number.isFinite(video.baseHeight)||video.baseWidth<1||video.baseHeight<1))throw new Error('OBS 画布尺寸不可用，请重新连接引擎');
      const sourceForSide:Record<Side,string>={...cameraNames};
      if(selected.length===2&&feeds!.blue.cameraDeviceId===feeds!.red.cameraDeviceId)sourceForSide.red=cameraNames.blue;
      const sources=new Map<string,{settings:{video_device_id:string;deactivate_when_not_showing:boolean;use_custom_audio_device:boolean;audio_output_mode:number};exists:boolean;changed:boolean}>();
      for(const side of selected){
        const inputName=sourceForSide[side];
        if(sources.has(inputName))continue;
        const settings={video_device_id:feeds![side].cameraDeviceId,deactivate_when_not_showing:true,use_custom_audio_device:false,audio_output_mode:0};
        const exists=inputs.some(input=>input.inputName===inputName);
        const current=exists?(await this.call('GetInputSettings',{inputName})).inputSettings:undefined;
        sources.set(inputName,{settings,exists,changed:!current||Object.entries(settings).some(([key,value])=>current[key]!==value)});
      }
      if([...sources.values()].some(source=>source.changed)){
        // Release owned devices before swapping selections, including two cameras exchanged between sides.
        for(const target of targets)for(const item of target.items)if(Object.values(cameraNames).some(name=>item.sourceName===name))await this.call('SetSceneItemEnabled',{sceneName:target.scene.sceneName,sceneItemId:Number(item.sceneItemId),sceneItemEnabled:false});
      }
      for(const [inputName,source]of sources){
        if(!source.exists){
          const target=targets[0];
          const created=await this.call('CreateInput',{sceneName:target.scene.sceneName,inputName,inputKind:'dshow_input',inputSettings:source.settings,sceneItemEnabled:false});
          target.items.push({sourceName:inputName,sceneItemId:created.sceneItemId} as typeof target.items[number]);
        }else if(source.changed)await this.call('SetInputSettings',{inputName,inputSettings:source.settings,overlay:true});
        // Camera microphones must not enter the commentary mix.
        await this.call('SetInputMute',{inputName,inputMuted:true});
      }
      for(const target of targets){
        const claimed=new Set<number>();
        for(const side of selected){
          const inputName=sourceForSide[side];
          let item=target.items.find(item=>item.sourceName===inputName&&!claimed.has(Number(item.sceneItemId)));
          if(!item){
            const created=await this.call('CreateSceneItem',{sceneName:target.scene.sceneName,sourceName:inputName,sceneItemEnabled:false});
            item={sourceName:inputName,sceneItemId:created.sceneItemId} as typeof target.items[number];target.items.push(item);
          }
          const sceneItemId=Number(item.sceneItemId),sceneName=target.scene.sceneName;
          claimed.add(sceneItemId);
          const panel=cameraPanels[side],scale=Math.min(video!.baseWidth/1920,video!.baseHeight/1080);
          await this.call('SetSceneItemTransform',{sceneName,sceneItemId,sceneItemTransform:{positionX:(video!.baseWidth-1920*scale)/2+panel.x*scale,positionY:(video!.baseHeight-1080*scale)/2+panel.y*scale,alignment:5,rotation:0,scaleX:1,scaleY:1,boundsType:'OBS_BOUNDS_SCALE_OUTER',boundsWidth:panel.width*scale,boundsHeight:panel.height*scale,boundsAlignment:0,cropToBounds:true,cropLeft:0,cropRight:0,cropTop:0,cropBottom:0}});
          // Place cameras above the game. The browser gets the highest index below.
          await this.call('SetSceneItemIndex',{sceneName,sceneItemId,sceneItemIndex:target.items.length-1});
          await this.call('SetSceneItemEnabled',{sceneName,sceneItemId,sceneItemEnabled:target.scene.visible});
        }
        for(const item of target.items)if(Object.values(cameraNames).some(name=>item.sourceName===name)&&!claimed.has(Number(item.sceneItemId)))await this.call('SetSceneItemEnabled',{sceneName:target.scene.sceneName,sceneItemId:Number(item.sceneItemId),sceneItemEnabled:false});
      }
      for(const target of targets){
        const hud=target.items.find(item=>item.sourceName===target.scene.hudName)!;
        await this.call('SetSceneItemIndex',{sceneName:target.scene.sceneName,sceneItemId:Number(hud.sceneItemId),sceneItemIndex:target.items.length-1});
      }
      return {applied:true,scenes:targets.map(target=>target.scene.sceneName)};
    }finally{this.mutating=false;}
  }
  private async fitHud(sceneName:string,sceneItemId:number,video:{baseWidth:number;baseHeight:number}){
    const width=video.baseWidth,height=video.baseHeight;
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw new Error('OBS 画布尺寸不可用，请在 OBS 中手动适配 HUD');
    const scale=Math.min(width/1920,height/1080);
    await this.call('SetSceneItemTransform',{sceneName,sceneItemId,sceneItemTransform:{positionX:(width-1920*scale)/2,positionY:(height-1080*scale)/2,scaleX:scale,scaleY:scale,alignment:5,boundsType:'OBS_BOUNDS_NONE'}});
  }
}
