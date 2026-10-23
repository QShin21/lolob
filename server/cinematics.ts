import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Express, Request } from 'express';
import { cameraSequence, defaultController, nudgeCamera } from '../shared/cinematics';
import type { CameraController, CameraKeyframe, CameraPose, CameraTrack, CameraVector, CinematicLibrary, CinematicView, ReplayCameraSequence } from '../shared/cinematics';
import { writeDurableState } from './durable-state';
import { validPlayback, type LocalRequest } from './replay';
import { record, str, ValidationError } from './state';

const num=(v:unknown,min:number,max:number,label:string):number=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new ValidationError(`${label}需为 ${min} 至 ${max} 的数值`);return v;};
const identifier=(v:unknown)=>{const id=str(v,80);if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw new ValidationError('镜头标识无效');return id;};
const vec=(v:unknown,limit:number):CameraVector=>{const p=record(v);return {x:num(p.x,-limit,limit,'坐标'),y:num(p.y,-limit,limit,'坐标'),z:num(p.z,-limit,limit,'坐标')};};
export function validPose(input:unknown):CameraPose {const p=record(input);return {position:vec(p.position,1000000),rotation:vec(p.rotation,100000),fov:num(p.fov,1,179,'视野角度')};}
export function validTrack(input:unknown):CameraTrack {
  const p=record(input),name=str(p.name,100).trim();if(!name)throw new ValidationError('请填写镜头轨迹名称');
  if(!Array.isArray(p.frames)||p.frames.length>100)throw new ValidationError('每条轨迹最多保存 100 个关键帧');
  const frames=p.frames.map((value:unknown)=>{const f=record(value);if(!['spline','linear','cut'].includes(String(f.interpolation)))throw new ValidationError('关键帧插值方式无效');return {id:identifier(f.id),time:num(f.time,0,86400,'关键帧时间'),interpolation:f.interpolation as CameraKeyframe['interpolation'],...validPose(f)};}).sort((a,b)=>a.time-b.time);
  if(new Set(frames.map(f=>f.id)).size!==frames.length)throw new ValidationError('关键帧标识重复');
  for(let i=1;i<frames.length;i++)if(frames[i].time-frames[i-1].time<.049)throw new ValidationError('关键帧至少相隔 0.05 秒');
  if(frames.length&&frames.at(-1)!.time-frames[0].time>600)throw new ValidationError('每条镜头轨迹最长 10 分钟');
  return {id:identifier(p.id),name,frames};
}
function validController(input:unknown):CameraController {
  const p=record(input),b=record(p.bindings),bindings=defaultController().bindings;
  for(const key of Object.keys(bindings) as (keyof typeof bindings)[]) {
    const value=num(b[key],0,['moveX','moveZ','yaw','pitch'].includes(key)?15:31,'手柄键位');
    if(!Number.isInteger(value))throw new ValidationError('手柄键位需为整数');bindings[key]=value;
  }
  const buttons=['up','down','next','previous','play','stop','capture'] as const;
  if(new Set(buttons.map(key=>bindings[key])).size!==buttons.length)throw new ValidationError('手柄按钮绑定需互不重复');
  if(typeof p.invertY!=='boolean')throw new ValidationError('反转俯仰设置无效');
  return {bindings,deadzone:num(p.deadzone,0,.8,'死区'),moveSpeed:num(p.moveSpeed,1,10000,'移动速度'),lookSpeed:num(p.lookSpeed,1,360,'转动速度'),invertY:p.invertY};
}
const poseFromRender=(render:unknown)=>{const p=record(render);return validPose({position:p.cameraPosition,rotation:p.cameraRotation,fov:p.fieldOfView});};
const sameNumber=(a:unknown,b:number,tolerance=.05)=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=tolerance;
const sameVector=(a:any,b:CameraVector)=>a&&(['x','y','z'] as const).every(key=>sameNumber(a[key],b[key],.5));
const samePose=(render:any,pose:CameraPose)=>sameVector(render.cameraPosition,pose.position)&&sameVector(render.cameraRotation,pose.rotation)&&sameNumber(render.fieldOfView,pose.fov);
const alias=(name:unknown)=>typeof name==='string'?name.replace(/#[^#]*$/,'').toLowerCase().trim():'';

export interface CinematicOptions {
  dataDir:string; request:LocalRequest; authorize:(req:Request)=>unknown;
  playback?:(patch:{time?:number;paused?:boolean;speed?:number})=>Promise<unknown>;
}

export class CinematicEngine {
  private library:CinematicLibrary={version:1,revision:0,tracks:[],controller:defaultController()};
  private file:string;private loading?:Promise<void>;private loadError='';private busy=false;
  private pid=0;private session='';private activeTrackId?:string;private autoFollow=false;private autoSession='';private lastAuto='';private lastAutoTime=0;
  private timer?:ReturnType<typeof setInterval>;private detail='打开游戏回放后读取镜头';
  constructor(private options:CinematicOptions){this.file=path.join(options.dataDir,'cinematics.json');}
  private load(){return this.loading??=this.loadFile();}
  private async loadFile(){
    try {const p=JSON.parse(await readFile(this.file,'utf8'));if(p.version!==1||!Array.isArray(p.tracks)||p.tracks.length>30)throw new Error('镜头文件格式无效');
      const tracks=p.tracks.map(validTrack);if(new Set(tracks.map((t:CameraTrack)=>t.id)).size!==tracks.length)throw new Error('镜头轨迹标识重复');
      this.library={version:1,revision:Number.isInteger(p.revision)&&p.revision>=0?p.revision:0,tracks,controller:validController(p.controller)};
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')this.loadError='镜头文件读取失败，请保留 cinematics.json 并修复后重新启动';}
  }
  private async save(next:CinematicLibrary){if(this.loadError)throw new ValidationError(this.loadError);await mkdir(this.options.dataDir,{recursive:true});await writeDurableState(this.file,next);this.library=next;}
  private checkRevision(value:unknown){if(value!==this.library.revision)throw new ValidationError('镜头库已更新，请刷新后再保存');}
  private async readCamera(){
    const [game,render,playback]=await Promise.all(['/replay/game','/replay/render','/replay/playback'].map(route=>this.options.request(2999,route)));
    if(!Number.isInteger(game?.processID)||game.processID<=0||!validPlayback(playback))throw new ValidationError('当前客户端未提供有效镜头与播放状态');
    const pose=poseFromRender(render);
    if(this.pid!==game.processID){this.pid=game.processID;this.session=randomUUID();this.activeTrackId=undefined;this.autoFollow=false;}
    return {game,render,playback,pose};
  }
  async view():Promise<CinematicView>{
    await this.load();const base={library:structuredClone(this.library),autoFollow:this.autoFollow};
    try {const c=await this.readCamera();return {...base,autoFollow:this.autoFollow,connected:true,session:this.session,pose:c.pose,playback:c.playback,selection:typeof c.render.selectionName==='string'?c.render.selectionName:undefined,activeTrackId:this.activeTrackId,detail:this.loadError||this.detail};}
    catch {this.pid=0;this.session='';this.autoFollow=false;this.activeTrackId=undefined;return {...base,autoFollow:false,connected:false,session:'',detail:this.loadError||'Replay API 镜头不可用，请打开回放并启用 Replay API'};}
  }
  private async current(session:unknown){const c=await this.readCamera();if(!session||session!==this.session)throw new ValidationError('镜头连接已变化，请刷新后重试');return c;}
  private async write(session:unknown,route:string,body:unknown){await this.current(session);return this.options.request(2999,route,{method:'POST',body});}
  private async transport(session:unknown,patch:{time?:number;paused?:boolean;speed?:number}){
    const c=await this.current(session);if(patch.time!==undefined&&typeof c.playback.length==='number'&&patch.time>c.playback.length)throw new ValidationError('关键帧超出当前回放时长');
    if(this.options.playback)await this.options.playback(patch);else await this.write(session,'/replay/playback',patch);
  }
  private async clearSequence(session:unknown){
    await this.write(session,'/replay/sequence',{});
    const result=await this.options.request(2999,'/replay/sequence');
    if(!result||typeof result!=='object'||Object.values(result).some(value=>Array.isArray(value)&&value.length>0))throw new ValidationError('游戏尚未确认镜头轨迹已停止');
    this.activeTrackId=undefined;
  }
  private async applyPose(session:unknown,pose:CameraPose){
    await this.write(session,'/replay/render',{cameraMode:'fps',cameraAttached:false,cameraPosition:pose.position,cameraRotation:pose.rotation,fieldOfView:pose.fov});
    const current=await this.current(session);
    if(current.render.cameraMode!=='fps'||current.render.cameraAttached!==false||!samePose(current.render,pose))throw new ValidationError('游戏尚未确认镜头位置，请刷新后核对');
  }
  private async follow(session:unknown,name:string){
    const data=await this.options.request(2999,'/liveclientdata/allgamedata');
    const player=Array.isArray(data?.allPlayers)?data.allPlayers.find((p:any)=>[p.summonerName,p.riotId,p.riotIdGameName,p.championName,p.rawChampionName?.replace(/^game_character_displayname_/,'')].some(value=>alias(value)===alias(name))):undefined;
    if(!player)throw new ValidationError('跟随目标已离开当前对局');
    await this.clearSequence(session);
    await this.write(session,'/replay/render',{cameraMode:'top',cameraAttached:true,selectionName:name});
    const c=await this.current(session);
    if(c.render.cameraMode!=='top'||c.render.cameraAttached!==true||alias(c.render.selectionName)!==alias(name))throw new ValidationError('游戏尚未确认跟随目标');
    this.detail=`镜头已跟随 ${name}`;
  }
  async command(input:unknown):Promise<CinematicView>{
    if(this.busy)throw new ValidationError('正在应用上一次镜头操作');this.busy=true;
    try {await this.load();const p=record(input);
      if(p.action==='save'||p.action==='delete'||p.action==='controller'){
        this.checkRevision(p.expectedRevision);const next=structuredClone(this.library);next.revision++;
        if(p.action==='controller')next.controller=validController(p.controller);
        else if(p.action==='delete')next.tracks=next.tracks.filter(t=>t.id!==identifier(p.trackId));
        else {const track=validTrack(p.track),i=next.tracks.findIndex(t=>t.id===track.id);if(i<0){if(next.tracks.length>=30)throw new ValidationError('最多保存 30 条镜头轨迹');next.tracks.push(track);}else next.tracks[i]=track;}
        await this.save(next);this.detail='镜头库已保存';return this.view();
      }
      const c=await this.current(p.session);
      if(p.action==='capture'){this.detail='已读取当前游戏镜头';return {...await this.view(),captured:{id:randomUUID(),time:c.playback.time,interpolation:'spline',...c.pose}};}
      if(p.action==='auto'){
        if(typeof p.enabled!=='boolean')throw new ValidationError('自动跟随设置无效');
        this.autoFollow=false;this.autoSession=this.session;this.lastAuto='';this.lastAutoTime=c.playback.time;
        if(p.enabled){await this.clearSequence(p.session);await this.baselineAuto();this.autoFollow=true;this.start();}
        this.detail=p.enabled?'自动跟随已启用，等待新的击杀或资源事件':'自动跟随已停止';return this.view();
      }
      this.autoFollow=false;
      if(p.action==='stop'){await this.clearSequence(p.session);this.detail='镜头轨迹已停止，保留当前游戏画面';return this.view();}
      if(c.playback.seeking)throw new ValidationError('游戏正在跳转，请等待位置稳定');
      if(p.action==='follow'){await this.follow(p.session,str(p.name,120));return this.view();}
      if(p.action==='jump') {await this.clearSequence(p.session);await this.applyPose(p.session,validPose(p.pose));this.detail='镜头已跳至关键帧位置';return this.view();}
      if(p.action==='nudge') {
        if(p.mode!=='free'&&p.mode!=='dolly')throw new ValidationError('请选择自由或轨道镜头');
        const axes=record(p.axes),v={x:num(axes.x,-1,1,'横移'),y:num(axes.y,-1,1,'升降'),z:num(axes.z,-1,1,'推进'),yaw:num(axes.yaw,-1,1,'水平旋转'),pitch:num(axes.pitch,-1,1,'俯仰'),dt:num(p.dt,.01,.25,'手柄采样间隔')};
        if(this.activeTrackId)await this.clearSequence(p.session);
        await this.applyPose(p.session,validPose(nudgeCamera(c.pose,p.mode,v,this.library.controller)));this.detail='手柄镜头已应用';return this.view();
      }
      if(p.action==='play') {
        const track=this.library.tracks.find(t=>t.id===p.trackId);if(!track||track.frames.length<2)throw new ValidationError('播放轨迹需要至少两个已保存关键帧');
        if(typeof c.playback.length==='number'&&track.frames.at(-1)!.time>c.playback.length)throw new ValidationError('镜头轨迹超出当前回放时长');
        const sequence=cameraSequence(track);await this.clearSequence(p.session);
        await this.transport(p.session,{time:track.frames[0].time,paused:true,speed:1});
        let ready=false;
        for(let n=0;n<40;n++){const probe=await this.current(p.session);if(!probe.playback.seeking&&Math.abs(probe.playback.time-track.frames[0].time)<.5){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}
        if(!ready)throw new ValidationError('游戏时间尚未跳到轨迹起点');
        await this.applyPose(p.session,track.frames[0]);
        this.activeTrackId=track.id;
        try{
          await this.write(p.session,'/replay/sequence',sequence);
          const applied=await this.options.request(2999,'/replay/sequence');
          if(!sequenceMatches(applied,sequence))throw new ValidationError('游戏尚未确认镜头轨迹，请核对当前 Replay API 版本');
          await this.transport(p.session,{paused:false,speed:1});const check=await this.current(p.session);if(check.playback.paused)throw new ValidationError('游戏尚未开始播放镜头轨迹');
        }
        catch(error){await this.clearSequence(p.session).catch(()=>{});throw error;}
        this.detail=`正在游戏内播放 ${track.name}`;return this.view();
      }
      throw new ValidationError('镜头操作无效');
    } finally {this.busy=false;}
  }
  private async autoEvents(){
    const data=await this.options.request(2999,'/liveclientdata/allgamedata');
    const time=data?.gameData?.gameTime;
    const events=Array.isArray(data?.events?.Events)?data.events.Events.filter((e:any)=>['ChampionKill','DragonKill','BaronKill','HeraldKill','HordeKill','ElderDragonKill'].includes(e.EventName)&&typeof e.KillerName==='string'&&typeof e.EventTime==='number'&&Number.isFinite(time)&&e.EventTime<=time+.1&&time-e.EventTime<=5):[];
    return events.at(-1);
  }
  private async baselineAuto(){const e=await this.autoEvents();this.lastAuto=e?JSON.stringify([e.EventName,e.EventTime,e.KillerName,e.VictimName]):'';}
  private start(){if(this.timer)return;this.timer=setInterval(()=>{void this.tickAuto();},1000);this.timer.unref();}
  private async tickAuto(){
    if(this.busy||!this.autoFollow)return;this.busy=true;
    try {const c=await this.current(this.autoSession);if(c.playback.seeking)return;const discontinuity=c.playback.time<this.lastAutoTime-.5||c.playback.time-this.lastAutoTime>10;this.lastAutoTime=c.playback.time;if(discontinuity){await this.baselineAuto();return;}const event=await this.autoEvents();if(!event)return;const key=JSON.stringify([event.EventName,event.EventTime,event.KillerName,event.VictimName]);if(key===this.lastAuto)return;this.lastAuto=key;await this.follow(this.autoSession,event.KillerName);}
    catch(error){this.autoFollow=false;this.detail=error instanceof Error?`自动跟随已停止：${error.message}`:'自动跟随连接已停止';}
    finally{this.busy=false;}
  }
  async close(){if(this.timer)clearInterval(this.timer);this.autoFollow=false;if(this.activeTrackId&&this.session)await this.clearSequence(this.session).catch(()=>{});}
}
export function sequenceMatches(value:any,expected:ReplayCameraSequence):boolean {
  return (['cameraPosition','cameraRotation','fieldOfView'] as const).every(key=>Array.isArray(value?.[key])&&value[key].length===expected[key].length&&expected[key].every((frame,i)=>sameNumber(value[key][i]?.time,frame.time,.005)&&(typeof frame.value==='number'?sameNumber(value[key][i]?.value,frame.value):sameVector(value[key][i]?.value,frame.value))));
}
export function registerCinematicRoutes(app:Express,options:CinematicOptions):CinematicEngine {
  const engine=new CinematicEngine(options);
  app.get('/api/cinematics',async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await engine.view());});
  app.post('/api/cinematics',async(req,res)=>{options.authorize(req);res.json(await engine.command(req.body));});
  return engine;
}
