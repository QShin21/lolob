import defaults from './style-pack-default.json';
import type { BuiltinScene } from './types';

export const STYLE_SCENES = ['standby', 'draft', 'lineup', 'live', 'economy', 'ranking', 'schedule', 'postgame', 'interview', 'teamfight', 'gold-ranking'] as const satisfies readonly BuiltinScene[];
export const STYLE_SURFACES = ['header', 'panel', 'cardBlue', 'cardRed', 'scoreboard', 'rowBlue', 'rowRed', 'nameplate', 'ticker', 'paper', 'draftCenter'] as const;
export type StyleSurface = typeof STYLE_SURFACES[number];
export type StyleFonts = { body: 'default' | 'modern' | 'serif'; display: 'default' | 'modern' | 'serif' };
export interface StyleScene { background: string | null; frame: string | null; textures: Partial<Record<StyleSurface, string | null>> }
export interface StylePack {
  format: 'riftcast-style-pack'; schemaVersion: 1; id: string; name: string; version: string; author: string; description: string;
  canvas: { width: 1920; height: 1080 }; palette: Record<string, string>; fonts: StyleFonts;
  textures: Record<StyleSurface, string | null>; scenes: Record<BuiltinScene, StyleScene>; assets: Record<string, string>;
}
/** State and TAKE snapshots carry only this small immutable reference, never image bytes. */
export interface StylePackRef { id: string; revision: string; name: string }
export interface StylePackSummary extends StylePackRef { version: string; author: string; description: string; builtin: boolean }
export interface RuntimeStylePack extends StylePack { revision: string; builtin: boolean }
export const BUILTIN_STYLE_PACK = defaults as StylePack;
export const BUILTIN_STYLE_REF: StylePackRef = { id: 'jianlou', revision: 'builtin-v1', name: '简陋包' };
export const BUILTIN_RUNTIME_STYLE: RuntimeStylePack = { ...BUILTIN_STYLE_PACK, ...BUILTIN_STYLE_REF, builtin: true };
export const FULL_STYLE_SCENES: readonly BuiltinScene[] = ['standby', 'lineup', 'schedule', 'postgame'];
export const STYLE_PACK_MAX_BYTES = 48 * 1024 * 1024;
export function validStyleRef(value: unknown): value is StylePackRef {
  if (!value || typeof value !== 'object') return false;
  const p = value as StylePackRef;
  return typeof p.id === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(p.id) && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 80 &&
    (p.id === 'jianlou' ? p.revision === 'builtin-v1' : typeof p.revision === 'string' && /^[a-f0-9]{64}$/.test(p.revision));
}
export const styleRef = (value?: StylePackRef): StylePackRef => validStyleRef(value) ? value : BUILTIN_STYLE_REF;
export const sameStyle = (a?: StylePackRef, b?: StylePackRef) => styleRef(a).id === styleRef(b).id && styleRef(a).revision === styleRef(b).revision;
export const styleSummary = (pack: RuntimeStylePack): StylePackSummary => ({ id: pack.id, revision: pack.revision, name: pack.name, version: pack.version, author: pack.author, description: pack.description, builtin: pack.builtin });
