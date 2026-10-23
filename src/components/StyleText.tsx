import { createContext, useContext, type ReactNode } from 'react';
import { resolveStyleText, type StyleAppearance, type StyleTextContext, type TextAppearanceTarget } from '../../shared/style-appearance';
import type { BroadcastState } from '../../shared/types';

const Templates = createContext<{ state: BroadcastState; appearance: StyleAppearance } | null>(null);
export const StyleTextProvider = Templates.Provider;
export function useStyleText(target: TextAppearanceTarget | undefined, context?: StyleTextContext): string | undefined {
  const value = useContext(Templates), template = target ? value?.appearance[target]?.text : undefined;
  if (!value || template === undefined) return undefined;
  try { return resolveStyleText(template, value.state, context); } catch { return undefined; }
}
/** React text nodes preserve escaping; template fields never enter HTML or CSS parsing. */
export function StyleText({ target, context, children }: { target: TextAppearanceTarget; context?: StyleTextContext; children?: ReactNode }) {
  const text = useStyleText(target, context);
  return <>{text === undefined ? children : text}</>;
}
