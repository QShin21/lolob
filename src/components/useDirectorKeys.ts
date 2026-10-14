import { useEffect } from 'react';
import type { StateContext, Scene } from '../../shared/types';
import { api, sceneInfo } from '../lib';

/** One listener owns console shortcuts; editing surfaces never bubble into TAKE. */
export function useDirectorKeys(ctx: Partial<StateContext>, studio: boolean, enabled: boolean) {
  const { state, send, notify, seat, connected } = ctx;
  useEffect(() => {
    if (!enabled || !state || !send || !notify) return;
    const handler = (event: KeyboardEvent) => {
      if (!seat || connected === false) return;
      const target = event.target instanceof Element ? event.target : null;
      if (event.repeat) {
        if (event.key === 'Enter' && target?.closest('.take-button,.scene-card')) event.preventDefault();
        return;
      }
      if (event.defaultPrevented || event.isComposing ||
          target?.closest('input,textarea,select,[contenteditable],dialog,[popover]') ||
          document.querySelector('dialog[open], [popover]:popover-open')) return;
      const key = [event.ctrlKey ? 'Control' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', event.key === 'Enter' ? 'Enter' : event.key.toUpperCase()].filter(Boolean).join('+');
      const binding = !event.metaKey && Object.entries(state.production?.hotkeys ?? {}).find(([, value]) => value === key)?.[0];
      if (binding) {
        event.preventDefault();
        if (binding === 'take') { void send({ type: 'take' }).catch(() => {}); return; }
        if (binding === 'emergency' || binding === 'live') {
          if (seat.role !== 'director' || state.production?.control?.owner !== seat.id) return;
          void api('/api/obs/production', { method: 'POST', body: JSON.stringify({ action: binding === 'emergency' ? 'emergency' : 'return-live' }) }).catch(e => notify(e.message, 'error'));
          return;
        }
        void send({ type: 'production', command: { op: 'immediate', action: binding === 'analysis' ? 'analysis-off' : binding === 'feeds' ? 'feeds-off' : 'undo' } }).catch(() => {});
        return;
      }
      if (!studio || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const scene = Object.entries(sceneInfo).find(([, info]) => info.shortcut.toLowerCase() === event.key.toLowerCase())?.[0] as Scene | undefined;
      if (scene) { event.preventDefault(); void send({ type: 'preview-scene', scene }).catch(() => {}); return; }
      if (event.key === 'Enter' && (!target?.closest('button,a,summary,[role=button]') || target.closest('.scene-card'))) {
        event.preventDefault(); void send({ type: 'take' }).catch(() => {});
      }
      if (event.key === ' ' && state.mode === 'demo' && !target?.closest('button,a,summary,[role=button]')) {
        event.preventDefault(); void send({ type: 'demo-pause', paused: !state.paused }).catch(() => {});
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, send, notify, seat, connected, studio, enabled]);
}
