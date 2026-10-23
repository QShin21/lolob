import type { BroadcastState, Scene, Side } from './types';
import { productionKey } from './production';

export type TransitionKind = 'cut' | 'fade' | 'stinger';
export interface TransitionConfig { kind: TransitionKind; durationMs: number; stingerPath?: string; pointMs?: number }
export const DEFAULT_TRANSITION: TransitionConfig = { kind: 'cut', durationMs: 300 };
export const transitionEvents = ['GameEnd', 'FirstBlood', 'Ace', 'Multikill', 'BaronKill', 'DragonKill', 'HeraldKill', 'InhibKilled', 'TurretKilled'] as const;
export type TransitionEvent = typeof transitionEvents[number];
export interface TransitionRule { id: string; enabled: boolean; event: TransitionEvent; side: Side | 'any'; targetScene: Scene; cooldownSeconds: number; transition: TransitionConfig }
export interface TransitionSettings { default: TransitionConfig; automatic: boolean; rules: TransitionRule[] }
export interface TransitionReceipt { id: string; kind: TransitionKind; status: 'applied' | 'failed'; published: boolean; startedAt: string; endedAt: string; targetScene?: string; detail: string }
export const defaultTransitionSettings = (): TransitionSettings => ({ default: { ...DEFAULT_TRANSITION }, automatic: false, rules: [] });

export function validateTransition(value: unknown): TransitionConfig {
  const v = value as Partial<TransitionConfig> | undefined;
  if (!v || !['cut', 'fade', 'stinger'].includes(String(v.kind))) throw new Error('请选择硬切、淡化或视频转场');
  if (!Number.isInteger(v.durationMs) || v.durationMs! < 50 || v.durationMs! > 10000) throw new Error('转场时长需为 50–10000 毫秒');
  if (v.kind === 'stinger') {
    if (typeof v.stingerPath !== 'string' || !v.stingerPath.trim() || v.stingerPath.length > 2048 || /[\u0000-\u001f\u007f]/.test(v.stingerPath)) throw new Error('请选择本机转场视频文件');
    if (!Number.isInteger(v.pointMs) || v.pointMs! < 0 || v.pointMs! >= v.durationMs!) throw new Error('视频切换点需在转场时长之内');
    return { kind: v.kind, durationMs: v.durationMs!, stingerPath: v.stingerPath, pointMs: v.pointMs };
  }
  return { kind: v.kind!, durationMs: v.durationMs! };
}
export function validateTransitionSettings(value: unknown, scenes: readonly string[]): TransitionSettings {
  const v = value as Partial<TransitionSettings> | undefined;
  if (!v || typeof v.automatic !== 'boolean' || !Array.isArray(v.rules) || v.rules.length > 24) throw new Error('事件转场规则格式无效');
  const ids = new Set<string>();
  const rules = v.rules.map(r => {
    if (!r || typeof r.id !== 'string' || !/^[\w-]{1,80}$/.test(r.id) || ids.has(r.id) || typeof r.enabled !== 'boolean' || !transitionEvents.includes(r.event) || !['any', 'blue', 'red'].includes(r.side) || !scenes.includes(r.targetScene) || !Number.isInteger(r.cooldownSeconds) || r.cooldownSeconds < 1 || r.cooldownSeconds > 300) throw new Error('事件规则的身份、场景或冷却时间无效');
    ids.add(r.id); return { id: r.id, enabled: r.enabled, event: r.event, side: r.side, targetScene: r.targetScene, cooldownSeconds: r.cooldownSeconds, transition: validateTransition(r.transition) };
  });
  return { default: validateTransition(v.default), automatic: v.automatic, rules };
}
export interface TransitionTrigger { ruleId: string; eventId: string; targetScene: Scene; transition: TransitionConfig }
/** New observations only; connecting or seeking never replays historical event transitions. */
export class EventTransitionRules {
  private context = ''; private seen = new Set<string>(); private fired = new Map<string, number>(); private time = 0; private phase?: BroadcastState['phase'];
  observe(state: BroadcastState, settings: TransitionSettings, now = Date.now()): TransitionTrigger | null {
    const key = `${productionKey(state)}:${state.gameClock?.sessionId ?? ''}:${state.gameClock?.discontinuity ?? ''}`;
    const events = state.events.filter(e => Number.isFinite(e.time) && e.time >= 0 && e.time <= state.gameTime + .05);
    const reset = key !== this.context || state.gameTime < this.time - .5 || state.gameTime > this.time + 10 || state.gameClock?.awaitingLiveSample;
    const previousPhase = this.phase; this.phase = state.phase; this.time = state.gameTime;
    if (reset) { this.context = key; this.seen = new Set(events.map(e => e.id)); this.fired.clear(); return null; }
    const fresh = events.filter(e => !this.seen.has(e.id) && state.gameTime - e.time <= 5);
    for (const e of events) this.seen.add(e.id);
    if (this.seen.size > 4000) this.seen = new Set(events.map(e => e.id));
    const phaseEnd = previousPhase === 'live' && state.phase === 'postgame';
    if (phaseEnd && !fresh.some(e => e.type === 'GameEnd')) fresh.push({ id: `phase-end:${key}`, time: state.gameTime, type: 'GameEnd', text: '对局结束' });
    const age = now - Date.parse(state.connections.live.updatedAt ?? '');
    const lcuAge = now - Date.parse(state.connections.lcu.updatedAt ?? '');
    const connected = state.connections.live.status === 'connected' && Number.isFinite(age) && age >= -1000 && age <= 10000 || phaseEnd && state.connections.lcu.status === 'connected' && Number.isFinite(lcuAge) && lcuAge >= -1000 && lcuAge <= 10000;
    if (!settings.automatic || !connected || state.replayReview || state.production?.playingClipId || state.production?.application?.status === 'requested') return null;
    for (const rule of settings.rules) {
      if (!rule.enabled || rule.targetScene === state.programScene || now - (this.fired.get(rule.id) ?? -Infinity) < rule.cooldownSeconds * 1000) continue;
      const event = fresh.find(e => e.type === rule.event && (rule.side === 'any' || e.team === rule.side));
      if (!event) continue;
      this.fired.set(rule.id, now);
      return { ruleId: rule.id, eventId: event.id, targetScene: rule.targetScene, transition: { ...rule.transition } };
    }
    return null;
  }
}
