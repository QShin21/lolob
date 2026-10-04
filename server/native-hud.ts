import type { BroadcastState, NativeHudStatus } from '../shared/types';

type Request = (port: number, endpoint: string, options?: {method?: string; body?: unknown}) => Promise<any>;
const liveScenes = new Set(['live', 'income', 'economy', 'ranking']);
const teamfightDetail = '团战视图保留游戏原生 HUD；切入后请在游戏观战窗口按 A 使用团战视角';
const hiddenFields = ['interfaceReplay','interfaceScore','interfaceScoreboard','interfaceFrames','interfaceTimeline','interfaceChat','interfaceQuests','interfaceAnnounce','interfaceKillCallouts'] as const;
// These lower corners remain game-rendered beneath the broadcast footer.
const preservedFields = ['interfaceTarget','interfaceMinimap'] as const;

// Narrow Replay API switches from Riot's League Director. Never change camera, vision or world rendering.
export class NativeHudController {
  private busy = false;
  private original?: Record<string, boolean>;
  private processId?: number;
  private nextAttempt = 0;
  private context?: string;
  private closed = false;
  private completion?: Promise<void>;
  private finished?: () => void;
  constructor(private get: () => BroadcastState, private commit: (work: (s: BroadcastState) => void) => void, private request: Request) {}
  private status(value: NativeHudStatus) {
    const current = this.get().nativeHudStatus;
    if (current?.status === value.status && current.detail === value.detail && current.preserveScore === value.preserveScore && current.preserveScoreboard === value.preserveScoreboard) return;
    this.commit(s => { s.nativeHudStatus = {...value, updatedAt: new Date().toISOString()}; });
  }
  private async restore() {
    const saved=this.original;
    if(!saved)return;
    await this.request(2999,'/replay/render',{method:'POST',body:saved});
    const verified=await this.request(2999,'/replay/render');
    if(Object.entries(saved).some(([key,value])=>verified?.[key]!==value))throw new Error('回放接口未确认原生 HUD 恢复，请在游戏内核对');
    this.original=undefined;
  }
  async tick(force = false) {
    const state = this.get(), mode = state.overlay.nativeHud ?? 'auto';
    const context = `${state.mode}:${state.programScene}:${mode}`;
    if (this.closed || this.busy || (!force && context === this.context && Date.now() < this.nextAttempt)) return;
    this.context = context;
    this.busy = true; this.nextAttempt = Date.now() + 5000;
    this.completion = new Promise<void>(resolve => { this.finished = resolve; });
    try {
      const nativeTeamfight = state.programScene === 'teamfight';
      const active = state.mode === 'live' && liveScenes.has(state.programScene) && mode === 'auto';
      if (!active && !this.original) {
        this.status(nativeTeamfight ? {status: 'off', detail: teamfightDetail} : {status: mode === 'off' ? 'off' : mode === 'mask' ? 'fallback' : 'waiting', detail: mode === 'off' ? '原生 HUD 控制已关闭' : mode === 'mask' ? '使用 OBS 画面遮挡，可在画面设置中校准' : '切入局内节目后自动隐藏回放 HUD'}); return;
      }
      const game = await this.request(2999, '/replay/game');
      if (typeof game?.processID !== 'number' || game.processID <= 0) throw new Error('当前客户端未提供回放进程标识');
      if (this.processId !== undefined && this.processId !== game.processID) this.original = undefined;
      this.processId = game.processID;
      const render = await this.request(2999, '/replay/render');
      if (!render || typeof render !== 'object' || Array.isArray(render)) throw new Error('回放 HUD 响应不兼容');
      if (!active) {
        if (this.original) {
          await this.restore();
        }
        this.status(nativeTeamfight ? {status: 'off', detail: teamfightDetail} : {status: mode === 'off' ? 'off' : mode === 'mask' ? 'fallback' : 'waiting', detail: '已恢复该回放原有 HUD 开关'}); return;
      }
      // OCR reads the actual game window; keeping its score visible avoids destroying its input.
      const preserveScore = state.settings.economyOcr?.enabled === true;
      const preserveScoreboard = state.settings.economyOcr?.players?.enabled ?? preserveScore;
      const fields = hiddenFields.filter(key => !(preserveScore && key === 'interfaceScore') && !(preserveScoreboard && key === 'interfaceScoreboard'));
      if ([...hiddenFields,...preservedFields].some(key => typeof render[key] !== 'boolean')) throw new Error('当前版本缺少完整 HUD 开关');
      if (!this.original) this.original = Object.fromEntries([...hiddenFields,...preservedFields,'interfaceAll'].filter(k => typeof render[k] === 'boolean').map(k => [k,render[k]]));
      const desired: Record<string, boolean> = Object.fromEntries(fields.map(key => [key, false]));
      if (preserveScore) desired.interfaceScore = true;
      if (preserveScoreboard) desired.interfaceScoreboard = true;
      if (typeof render.interfaceAll === 'boolean') desired.interfaceAll = true;
      for (const key of preservedFields) desired[key] = true;
      const patch = Object.fromEntries(Object.entries(desired).filter(([key,value]) => render[key] !== value));
      if (Object.keys(patch).length) {
        await this.request(2999, '/replay/render', {method: 'POST', body: patch});
        const verified = await this.request(2999, '/replay/render');
        if (Object.entries(desired).some(([key,value]) => verified?.[key] !== value)) throw new Error('回放接口未确认 HUD 开关，使用遮挡备用布局');
      }
      this.status({status: 'hidden', preserveScore, preserveScoreboard, detail: preserveScoreboard ? '保留原生底部计分板供个人经济 OCR 采集，请在游戏内显示金币列；中央赛事计分板覆盖直播画面，保留游戏目标面板与小地图' : preserveScore ? '回放原生面板已隐藏；保留游戏比分供 OCR 采集，OBS 顶部使用赛事遮挡，保留游戏目标面板与小地图' : '回放原生计分、选手、聊天和时间轴已隐藏；保留游戏目标面板、小地图与场内血条'});
    } catch (e) {
      const detail = this.get().programScene === 'teamfight' ? '团战视图原生 HUD 恢复未确认，请在游戏观战窗口核对并按 A' : '自动隐藏暂不可用，已启用 OBS 遮挡';
      this.status({status: 'fallback', detail: `${detail}：${e instanceof Error ? e.message : '客户端未响应'}`});
    } finally {this.busy = false;this.finished?.();this.finished=undefined;}
  }
  async close() {
    this.closed = true;
    await this.completion;
    if (this.original) {
      try {const game = await this.request(2999, '/replay/game'); if (game?.processID === this.processId) await this.restore();} catch {this.status({status:'fallback',detail:'关闭时未确认游戏 HUD 恢复，请在游戏内核对原生面板。'});}
    }
  }
}
