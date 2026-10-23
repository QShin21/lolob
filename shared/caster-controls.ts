import type { ProductionState } from './production-types';
import type { BroadcastAction } from './types';
import { analysisModes } from './broadcast-analysis';

export const casterBaseActions = ['take', 'live', 'analysis', 'feeds', 'emergency', 'undo'] as const;
export type CasterBaseAction = typeof casterBaseActions[number];
export type CasterButtonAction = CasterBaseAction | 'preview' | 'analysis-mode' | 'ticker' | 'player' | 'postgame-page';
export interface CasterButton { id: string; label: string; action: CasterButtonAction; value: string; keys: string[] }
export type HotkeyAliases = Partial<Record<CasterBaseAction, string[]>>;
export const casterActionLabels: Record<CasterButtonAction, string> = { take: 'TAKE', live: '返回直播', analysis: '收起分析', feeds: '收起镜头', emergency: '紧急垫片', undo: '撤销制作', preview: '准备节目到预监', 'analysis-mode': '预监分析面板', ticker: '发布字幕', player: '聚焦选手', 'postgame-page': '预监赛后页' };
export const casterScenes = ['standby', 'draft', 'lineup', 'live', 'economy', 'ranking', 'schedule', 'postgame', 'interview', 'teamfight', 'gold-ranking'] as const;
export const validCasterKey = (value: unknown): value is string => typeof value === 'string' && /^(Control\+Shift\+[A-Z]|Control\+Enter|Alt\+Shift\+[A-Z])$/.test(value);
export function validateCasterConfiguration(primary: ProductionState['hotkeys'], aliases: unknown = {}, buttons: unknown = []): { aliases: HotkeyAliases; buttons: CasterButton[] } {
  if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases) || Object.keys(aliases).some(k => !casterBaseActions.includes(k as CasterBaseAction))) throw new Error('附加快捷键动作无效');
  if (!Array.isArray(buttons) || buttons.length > 24) throw new Error('解说按钮最多 24 个');
  const used = new Set<string>();
  const keys = (values: unknown, max: number) => {
    if (!Array.isArray(values) || values.length > max) throw new Error(`每项最多 ${max} 个快捷键`);
    for (const key of values) { if (!validCasterKey(key) || used.has(key)) throw new Error('快捷键须为互不重复的明确组合键'); used.add(key); }
    return [...values] as string[];
  };
  if (Object.keys(primary).length !== 6 || !casterBaseActions.every(action => Object.hasOwn(primary, action))) throw new Error('需要六项默认动作');
  keys(casterBaseActions.map(a => primary[a]), 6);
  const normalizedAliases: HotkeyAliases = {};
  for (const [action, value] of Object.entries(aliases)) normalizedAliases[action as CasterBaseAction] = keys(value, 3);
  const ids = new Set<string>();
  const normalizedButtons = buttons.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !['id', 'label', 'action', 'value', 'keys'].includes(k))) throw new Error('解说按钮格式无效');
    const b = raw as CasterButton;
    if (typeof b.id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(b.id) || ids.has(b.id)) throw new Error('解说按钮标识重复或无效');
    ids.add(b.id);
    if (typeof b.label !== 'string' || !b.label.trim() || b.label.length > 40 || /[\u0000-\u001f]/.test(b.label)) throw new Error('按钮名称须为 1–40 字符');
    if (!Object.hasOwn(casterActionLabels, b.action) || typeof b.value !== 'string' || b.value.length > 300) throw new Error('按钮动作无效');
    if (b.action === 'preview' && !casterScenes.includes(b.value as typeof casterScenes[number]) || b.action === 'analysis-mode' && !analysisModes.includes(b.value as typeof analysisModes[number]) || b.action === 'postgame-page' && !['1','2','3'].includes(b.value) || b.action === 'player' && (!b.value || b.value.length > 150) || b.action === 'ticker' && !b.value.trim()) throw new Error('按钮参数无效');
    return { id: b.id, label: b.label.trim(), action: b.action, value: b.value, keys: keys(b.keys, 3) };
  });
  return { aliases: normalizedAliases, buttons: normalizedButtons };
}
export function casterBindings(p: Pick<ProductionState, 'hotkeys' | 'hotkeyAliases' | 'casterButtons'>): Record<string, string[]> {
  const result: Record<string, string[]> = Object.fromEntries(casterBaseActions.map(action => [action, [p.hotkeys[action], ...(p.hotkeyAliases?.[action] ?? [])]]));
  for (const b of p.casterButtons ?? []) if (b.keys.length) result[`button-${b.id}`] = b.keys;
  return result;
}
export function casterButtonCommand(button: CasterButton): BroadcastAction | null {
  if (button.action === 'preview') return { type: 'preview-scene', scene: button.value as typeof casterScenes[number] };
  if (button.action === 'analysis-mode') return { type: 'set-overlay', patch: { analysisMode: button.value as typeof analysisModes[number] } };
  if (button.action === 'postgame-page') return { type: 'set-overlay', patch: { postgamePage: Number(button.value) as 1|2|3 } };
  if (button.action === 'player') return { type: 'select-player', playerId: button.value };
  if (button.action === 'ticker') return { type: 'production', command: { op: 'immediate', action: 'ticker', text: button.value } };
  return null;
}
