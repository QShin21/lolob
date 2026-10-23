import type { ProductionState } from './production-types';

export type GlobalShortcutAction = keyof ProductionState['hotkeys'] | `button-${string}`;
export type GlobalShortcutBindings = Record<string, string | string[]>;
export const globalShortcutLabels: Record<keyof ProductionState['hotkeys'], string> = {
  take: '切入节目 TAKE', live: '返回直播', analysis: '收起分析画面', feeds: '收起选手镜头', emergency: '紧急垫片', undo: '撤销最近制作操作',
};
export type GlobalShortcutStatus = {
  enabled: boolean;
  registered: { action: GlobalShortcutAction; accelerator: string }[];
  failures: { action: string; accelerator: string; reason: string }[];
  message: string;
};
export type GlobalShortcutEvent = { action: GlobalShortcutAction; accelerator: string };
export type GlobalShortcutRequest = { action: 'status' | 'disable' } | { action: 'enable'; seatToken: string; bindings: GlobalShortcutBindings };
export const initialGlobalShortcutStatus: GlobalShortcutStatus = { enabled: false, registered: [], failures: [], message: '后台快捷键已关闭' };
