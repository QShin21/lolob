import type { OBSRequestTypes, OBSResponseTypes } from 'obs-websocket-js';
import { engineScene } from './obs-engine';
import { ValidationError } from './state';
type Call = <T extends keyof OBSRequestTypes>(name: T, data?: OBSRequestTypes[T]) => Promise<OBSResponseTypes[T]>;
const inputName = 'RiftCast 团队协作画面';
const gameName = 'RiftCast 游戏画面', hudName = 'RiftCast HUD', desktopName = 'RiftCast 桌面音频';
export class ObsCollaboration {
  private desktopMuted?: boolean;
  constructor(private call: Call) {}
  async select(url?: string, kind: 'game' | 'program' = 'game', ready?:()=>Promise<void>, audio=false) {
    if (url) { const parsed = new URL(url); if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/team-player.html') throw new ValidationError('协作画面地址无效'); }
    const { inputs } = await this.call('GetInputList');
    if (!inputs.some(i => i.inputName === gameName)) throw new ValidationError('请先准备主控端的内置 OBS 游戏画面');
    const original = await this.call('GetSceneItemList', { sceneName: engineScene });
    const originalEnabled = original.sceneItems.filter(i => [gameName, hudName, inputName].includes(String(i.sourceName))).map(i => ({ id: Number(i.sceneItemId), enabled: i.sceneItemEnabled === true }));
    const previousScene = (await this.call('GetCurrentProgramScene')).sceneName;
    const previousInput=inputs.some(i=>i.inputName===inputName)?await this.call('GetInputSettings',{inputName}):undefined;
    const previousDesktopMuted=this.desktopMuted;
    const oldTeamMute=previousInput?(await this.call('GetInputMute',{inputName})).inputMuted:undefined;
    const oldMute = inputs.some(i => i.inputName === desktopName) ? (await this.call('GetInputMute', { inputName: desktopName })).inputMuted : undefined;
    try {
      if (url) {
        const inputSettings = { url, width: 1920, height: 1080, fps: 30, fps_custom: true, reroute_audio: true, shutdown: false, restart_when_active: false, riftcast_team_active:true, riftcast_team_restore_desktop:audio?(this.desktopMuted??oldMute??null):null };
        if (!inputs.some(i => i.inputName === inputName)) await this.call('CreateInput', { sceneName: engineScene, inputName, inputKind: 'browser_source', inputSettings, sceneItemEnabled: false });
        else { const old = await this.call('GetInputSettings', { inputName }); if (old.inputKind !== 'browser_source') throw new ValidationError('协作画面同名来源类型不匹配'); await this.call('SetInputSettings', { inputName, inputSettings, overlay: true }); }
        const items = await this.call('GetSceneItemList', { sceneName: engineScene });
        if (!items.sceneItems.some(i => i.sourceName === inputName)) await this.call('CreateSceneItem', { sceneName: engineScene, sourceName: inputName, sceneItemEnabled: false });
      }
      if(url&&ready)await ready();
      const { sceneItems } = await this.call('GetSceneItemList', { sceneName: engineScene });
      for (const item of sceneItems) {
        const id = Number(item.sceneItemId);
        if (item.sourceName === inputName) {
          await this.call('SetSceneItemTransform', { sceneName: engineScene, sceneItemId: id, sceneItemTransform: { positionX: 0, positionY: 0, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 1920, boundsHeight: 1080 } });
          await this.call('SetSceneItemIndex', { sceneName: engineScene, sceneItemId: id, sceneItemIndex: kind==='program'?sceneItems.length-1:1 });
          await this.call('SetSceneItemEnabled', { sceneName: engineScene, sceneItemId: id, sceneItemEnabled: !!url });
        } else if (item.sourceName === gameName || item.sourceName === hudName) await this.call('SetSceneItemEnabled', { sceneName: engineScene, sceneItemId: id, sceneItemEnabled: item.sourceName === gameName ? !url : !url || kind === 'game' });
      }
      if (url&&audio) { this.desktopMuted ??= oldMute; if (oldMute !== undefined) await this.call('SetInputMute', { inputName: desktopName, inputMuted: true }); }
      else if (this.desktopMuted !== undefined) { await this.call('SetInputMute', { inputName: desktopName, inputMuted: this.desktopMuted }); this.desktopMuted = undefined; }
      if(url||previousInput)await this.call('SetInputMute',{inputName,inputMuted:!url||!audio});
      if(!url&&previousInput)await this.call('SetInputSettings',{inputName,inputSettings:{url:'about:blank',riftcast_team_active:false,riftcast_team_restore_desktop:null},overlay:true});
      await this.call('SetCurrentProgramScene', { sceneName: engineScene });
      if ((await this.call('GetCurrentProgramScene')).sceneName !== engineScene) throw new Error('OBS 协作画面切换待确认');
    } catch (error) {
      this.desktopMuted=previousDesktopMuted;
      if(previousInput)await this.call('SetInputSettings',{inputName,inputSettings:previousInput.inputSettings,overlay:false}).catch(()=>{});
      if(oldTeamMute!==undefined)await this.call('SetInputMute',{inputName,inputMuted:oldTeamMute}).catch(()=>{});
      for (const item of originalEnabled) await this.call('SetSceneItemEnabled', { sceneName: engineScene, sceneItemId: item.id, sceneItemEnabled: item.enabled }).catch(() => {});
      if (!originalEnabled.some(i => original.sceneItems.some(v => v.sourceName === inputName && Number(v.sceneItemId) === i.id))) { const current = await this.call('GetSceneItemList', { sceneName: engineScene }).catch(() => ({ sceneItems: [] })); const created = current.sceneItems.find(i => i.sourceName === inputName); if (created) await this.call('SetSceneItemEnabled', { sceneName: engineScene, sceneItemId: Number(created.sceneItemId), sceneItemEnabled: false }).catch(() => {}); }
      if (oldMute !== undefined) await this.call('SetInputMute', { inputName: desktopName, inputMuted: oldMute }).catch(() => {});
      await this.call('SetCurrentProgramScene', { sceneName: previousScene }).catch(() => {}); throw error;
    }
  }
}
