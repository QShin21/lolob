import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ObsCollaboration} from './obs-collaboration';
function fixture(){
 const calls:{name:string;data:any}[]=[],enabled=new Map([[1,true],[2,true],[3,false]]),muted=new Map([['RiftCast 桌面音频',false],['RiftCast 团队协作画面',true]]);let settings={url:'http://127.0.0.1:3888/team-player.html?id=old'},scene='RiftCast 节目';
 const source=new ObsCollaboration((async(name:string,data:any)=>{calls.push({name,data});
 if(name==='GetInputList')return {inputs:['RiftCast 游戏画面','RiftCast HUD','RiftCast 桌面音频','RiftCast 团队协作画面'].map(inputName=>({inputName}))};
 if(name==='GetInputSettings')return {inputKind:'browser_source',inputSettings:settings};
 if(name==='SetInputSettings'){settings=data.inputSettings;return {}};
 if(name==='GetSceneItemList')return {sceneItems:['RiftCast 游戏画面','RiftCast HUD','RiftCast 团队协作画面'].map((sourceName,i)=>({sourceName,sceneItemId:i+1,sceneItemEnabled:enabled.get(i+1)}))};
 if(name==='GetCurrentProgramScene')return {sceneName:scene};if(name==='SetCurrentProgramScene'){scene=data.sceneName;return {}};
 if(name==='GetInputMute')return {inputMuted:muted.get(data.inputName)};if(name==='SetInputMute'){muted.set(data.inputName,data.inputMuted);return {}};
 if(name==='SetSceneItemEnabled')enabled.set(data.sceneItemId,data.sceneItemEnabled);return {};
 }) as any);
 return {source,calls,enabled,muted,get settings(){return settings}};
}
test('full collaborator programs cover host graphics and remote audio replaces desktop only while selected',async()=>{
 const f=fixture();let ready=false;await f.source.select('http://127.0.0.1:3888/team-player.html?id=remote','program',async()=>{assert.equal(f.enabled.get(1),true);ready=true},true);
 assert.ok(ready);assert.equal(f.enabled.get(1),false);assert.equal(f.enabled.get(2),false);assert.equal(f.enabled.get(3),true);assert.equal(f.muted.get('RiftCast 桌面音频'),true);assert.equal(f.muted.get('RiftCast 团队协作画面'),false);assert.equal(f.calls.find(c=>c.name==='SetSceneItemIndex')?.data.sceneItemIndex,2);
 await f.source.select();assert.equal(f.enabled.get(1),true);assert.equal(f.enabled.get(2),true);assert.equal(f.enabled.get(3),false);assert.equal(f.muted.get('RiftCast 桌面音频'),false);assert.equal(f.muted.get('RiftCast 团队协作画面'),true);
});
test('video-only collaborator views retain host sound and HUD',async()=>{const f=fixture();await f.source.select('http://127.0.0.1:3888/team-player.html?id=remote','game',async()=>{});assert.equal(f.enabled.get(2),true);assert.equal(f.muted.get('RiftCast 桌面音频'),false);assert.equal(f.muted.get('RiftCast 团队协作画面'),true);});
test('failed decode restores the prior browser input and leaves game, graphics and audio on air',async()=>{const f=fixture();await assert.rejects(f.source.select('http://127.0.0.1:3888/team-player.html?id=failed','program',async()=>{throw new Error('decode failed')},true),/decode failed/);assert.equal(f.settings.url,'http://127.0.0.1:3888/team-player.html?id=old');assert.equal(f.enabled.get(1),true);assert.equal(f.enabled.get(2),true);assert.equal(f.enabled.get(3),false);assert.equal(f.muted.get('RiftCast 桌面音频'),false);});
