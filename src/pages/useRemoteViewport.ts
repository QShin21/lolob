import { useEffect, useState } from 'react';

/** Keyboard geometry only; focus changes never dispatch a production action. */
export function useRemoteViewport() {
  const [editing, setEditing] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    let frame = 0, baseline = window.innerHeight;
    const viewport = window.visualViewport;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        const text = active instanceof HTMLElement && (active.matches('textarea,input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="file"])') || active.isContentEditable);
        setEditing(text);
        if (!text) baseline = window.innerHeight;
        const obscured = text ? Math.max(0, baseline - (viewport?.height ?? window.innerHeight), window.innerHeight - (viewport?.height ?? window.innerHeight)) : 0;
        setKeyboardInset(obscured > 120 ? obscured : 0);
        if (text && obscured > 120) active.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      });
    };
    document.addEventListener('focusin', measure);
    document.addEventListener('focusout', measure);
    viewport?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('focusin', measure); document.removeEventListener('focusout', measure);
      viewport?.removeEventListener('resize', measure); window.removeEventListener('resize', measure);
    };
  }, []);
  return { editing, keyboardInset };
}
