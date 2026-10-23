import { useEffect, useRef } from 'react';
import type { StateContext, Scene } from '../../shared/types';
import { initialGlobalShortcutStatus, type GlobalShortcutAction, type GlobalShortcutStatus } from '../../shared/global-shortcuts';
import { sceneInfo } from '../lib';
import { casterBindings } from '../../shared/caster-controls';
import { executeCasterAction } from './caster-action';

/** One listener owns console shortcuts; editing surfaces never bubble into TAKE. */
export function useDirectorKeys(ctx: Partial<StateContext>, studio: boolean, enabled: boolean) {
  const { state, send, notify, seat, connected } = ctx;
  const globalStatus = useRef<GlobalShortcutStatus>(initialGlobalShortcutStatus);
  useEffect(() => {
    if (!enabled || connected === false || seat?.role !== 'director') void window.riftcastDesktop?.globalShortcuts({ action: 'disable' }).catch(() => {});
  }, [enabled, connected, seat?.id, seat?.role]);
  useEffect(() => {
    if (!enabled || !state || !send || !notify) return;
    const editing = (target: Element | null) => !!target?.closest('input,textarea,select,[contenteditable],dialog,[popover]') || !!document.querySelector('dialog[open], [popover]:popover-open');
    const ownsOutput = () => connected !== false && seat?.role === 'director' && state.production?.control?.owner === seat.id;
    const bindings = state.production ? casterBindings(state.production) : {};
    const execute = (binding: GlobalShortcutAction) => {
      if (!ownsOutput()) return;
      void executeCasterAction({state,send,seat,connected}, binding).catch(e=>notify(e.message,'error'));
    };
    let disposed = false;
    const receiveStatus = (value: GlobalShortcutStatus) => {
      if (disposed) return;
      globalStatus.current = value;
      if (value.enabled && (!ownsOutput() || value.registered.some(item => !bindings[item.action]?.includes(item.accelerator)))) {
        void window.riftcastDesktop?.globalShortcuts({ action: 'disable' }).catch(() => {});
      }
    };
    const removeStatus = window.riftcastDesktop?.onGlobalShortcutStatus(receiveStatus);
    const removeGlobal = window.riftcastDesktop?.onGlobalShortcut(event => {
      if (!globalStatus.current.enabled || !globalStatus.current.registered.some(item => item.action === event.action && item.accelerator === event.accelerator) ||
          !bindings[event.action]?.includes(event.accelerator) || (document.hasFocus() && editing(document.activeElement))) return;
      execute(event.action);
    });
    void window.riftcastDesktop?.globalShortcuts({ action: 'status' }).then(receiveStatus).catch(() => {});
    const handler = (event: KeyboardEvent) => {
      if (!seat || connected === false) return;
      const target = event.target instanceof Element ? event.target : null;
      if (event.repeat) {
        if (event.key === 'Enter' && target?.closest('.take-button,.scene-card')) event.preventDefault();
        return;
      }
      if (event.defaultPrevented || event.isComposing || editing(target)) return;
      const key = [event.ctrlKey ? 'Control' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', event.key === 'Enter' ? 'Enter' : event.key.toUpperCase()].filter(Boolean).join('+');
      if (!event.metaKey && globalStatus.current.enabled && globalStatus.current.registered.some(item => item.accelerator === key)) { event.preventDefault(); return; }
      const binding = !event.metaKey && Object.entries(bindings).find(([, value]) => value.includes(key))?.[0] as GlobalShortcutAction | false | undefined;
      if (binding) {
        event.preventDefault();
        execute(binding);
        return;
      }
      if (!studio || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const scene = Object.entries(sceneInfo).find(([, info]) => info.shortcut.toLowerCase() === event.key.toLowerCase())?.[0] as Scene | undefined;
      if (scene) { event.preventDefault(); void send({ type: 'preview-scene', scene }).catch(() => {}); return; }
      if (event.key === 'Enter' && (!target?.closest('button,a,summary,[role=button]') || target.closest('.scene-card'))) {
        event.preventDefault(); void send({ type: 'take' }).catch(() => {});
      }
    };
    window.addEventListener('keydown', handler);
    return () => { disposed = true; removeGlobal?.(); removeStatus?.(); window.removeEventListener('keydown', handler); };
  }, [state, send, notify, seat, connected, studio, enabled]);
}
