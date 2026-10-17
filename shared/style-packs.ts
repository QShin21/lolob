import type { StyleAppearance } from './style-appearance';
import catalog from './style-pack-catalog.json';
import type { BuiltinScene } from './types';

export const STYLE_SCENES = ['standby', 'draft', 'lineup', 'live', 'economy', 'ranking', 'schedule', 'postgame', 'interview', 'teamfight', 'gold-ranking'] as const satisfies readonly BuiltinScene[];
export const STYLE_SURFACES = ['header', 'panel', 'cardBlue', 'cardRed', 'scoreboard', 'rowBlue', 'rowRed', 'nameplate', 'ticker', 'paper', 'draftCenter'] as const;
export type StyleSurface = typeof STYLE_SURFACES[number];
export type StyleFonts = { body: 'default' | 'modern' | 'serif'; display: 'default' | 'modern' | 'serif' };
export interface StyleScene { appearance?: StyleAppearance; background: string | null; frame: string | null; textures: Partial<Record<StyleSurface, string | null>> }
export interface StylePack {
  format: 'riftcast-style-pack'; schemaVersion: 1; id: string; name: string; version: string; author: string; description: string;
  canvas: { width: 1920; height: 1080 }; palette: Record<string, string>; fonts: StyleFonts;
  appearance?: StyleAppearance;
  textures: Record<StyleSurface, string | null>; scenes: Record<BuiltinScene, StyleScene>; assets: Record<string, string>;
}
/** State and TAKE snapshots carry only this small immutable reference, never image bytes. */
export interface StylePackRef { id: string; revision: string; name: string }
export interface StylePackSummary extends StylePackRef { version: string; author: string; description: string; builtin: boolean }
export interface RuntimeStylePack extends StylePack { revision: string; builtin: boolean }
/** Approved original artwork, with the same normalized content identity as ZIP imports. */
export const BUILTIN_STYLE_RECORDS = catalog.entries as Array<{
  manifest: StylePack; revision: string; hashes: Record<string, string>;
  archiveName: string; archiveSha256: string;
}>;
export const BUILTIN_RUNTIME_STYLES: RuntimeStylePack[] = BUILTIN_STYLE_RECORDS.map(({ manifest, revision }) => ({
  ...manifest, revision, builtin: true,
  assets: Object.fromEntries(Object.keys(manifest.assets).map(id => [id, `/api/style-packs/${manifest.id}/${revision}/assets/${id}`])),
}));
export const BUILTIN_RUNTIME_STYLE = BUILTIN_RUNTIME_STYLES.find(pack => pack.id === catalog.defaultId)!;
export const BUILTIN_STYLE_PACK = BUILTIN_STYLE_RECORDS.find(pack => pack.manifest.id === catalog.defaultId)!.manifest;
export const BUILTIN_STYLE_REF: StylePackRef = { id: BUILTIN_RUNTIME_STYLE.id, revision: BUILTIN_RUNTIME_STYLE.revision, name: BUILTIN_RUNTIME_STYLE.name };
export const builtinStyle = (ref: Pick<StylePackRef, 'id' | 'revision'>): RuntimeStylePack | undefined =>
  BUILTIN_RUNTIME_STYLES.find(pack => pack.id === ref.id && pack.revision === ref.revision);
export const FULL_STYLE_SCENES: readonly BuiltinScene[] = ['standby', 'lineup', 'schedule', 'postgame'];
export const STYLE_PACK_MAX_BYTES = 48 * 1024 * 1024;
export function validStyleRef(value: unknown): value is StylePackRef {
  if (!value || typeof value !== 'object') return false;
  const p = value as StylePackRef;
  return typeof p.id === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(p.id) && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 80 &&
    p.id !== 'jianlou' && typeof p.revision === 'string' && /^[a-f0-9]{64}$/.test(p.revision);
}
/** Retired/default/malformed references migrate; valid custom revisions remain untouched. */
export const styleRef = (value?: StylePackRef): StylePackRef => {
  if (!validStyleRef(value)) return { ...BUILTIN_STYLE_REF };
  const builtin = builtinStyle(value);
  return { id: value.id, revision: value.revision, name: builtin?.name ?? value.name };
};
export const sameStyle = (a?: StylePackRef, b?: StylePackRef) => styleRef(a).id === styleRef(b).id && styleRef(a).revision === styleRef(b).revision;
export const styleSummary = (pack: RuntimeStylePack): StylePackSummary => ({ id: pack.id, revision: pack.revision, name: pack.name, version: pack.version, author: pack.author, description: pack.description, builtin: pack.builtin });
