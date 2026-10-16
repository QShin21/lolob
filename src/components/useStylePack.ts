import { useEffect, useState, type CSSProperties } from 'react';
import type { Scene } from '../../shared/types';
import { BUILTIN_RUNTIME_STYLE, builtinStyle, sameStyle, styleRef, STYLE_SURFACES } from '../../shared/style-packs';
import type { RuntimeStylePack, StylePackRef } from '../../shared/style-packs';

const ready = new Map<string, RuntimeStylePack>();
const pending = new Map<string, Promise<RuntimeStylePack>>();
const keyFor = (ref: StylePackRef) => `${ref.id}/${ref.revision}`;
const imageReady = async (url: string) => {
  const image = new Image(); image.src = url;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([image.decode(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('贴图加载超时')), 15000); })]); }
  finally { if (timer) clearTimeout(timer); }
};
/** Shared promise prevents every scene/monitor from downloading and decoding the same pack. */
export async function loadStylePack(value?: StylePackRef): Promise<RuntimeStylePack> {
  const ref = styleRef(value);
  const key = keyFor(ref), cached = ready.get(key); if (cached) return cached;
  const loading = pending.get(key); if (loading) return loading;
  const request = (async () => {
    const response = await fetch(`/api/style-packs/${key}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('风格包不可用，请重新导入');
    const pack = await response.json() as RuntimeStylePack;
    if (!sameStyle(pack, ref) || pack.schemaVersion !== 1 || pack.format !== 'riftcast-style-pack') throw new Error('风格包版本不匹配');
    // This URL boundary also prevents remote asset references even if a server response is damaged.
    for (const url of Object.values(pack.assets)) if (!url.startsWith(`/api/style-packs/${key}/assets/`) || !/^\/api\/style-packs\/[a-z][a-z0-9-]*\/[a-f0-9]{64}\/assets\/[a-z][a-z0-9-]*$/.test(url)) throw new Error('贴图地址无效');
    await Promise.all(Object.values(pack.assets).map(imageReady));
    if (ready.size >= 8) ready.delete(ready.keys().next().value!);
    ready.set(key, pack); return pack;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}
export function useStylePack(value?: StylePackRef) {
  const ref = styleRef(value), key = keyFor(ref);
  const [loaded, setLoaded] = useState<RuntimeStylePack>(() => ready.get(key) ?? builtinStyle(ref) ?? BUILTIN_RUNTIME_STYLE);
  const [error, setError] = useState('');
  const [loadedKey, setLoadedKey] = useState(() => ready.has(key) ? key : '');
  useEffect(() => {
    let live = true; setError('');
    void loadStylePack(ref).then(pack => { if (live) { setLoaded(pack); setLoadedKey(key); } }).catch(e => { if (live) setError(e instanceof Error ? e.message : '风格包加载失败'); });
    return () => { live = false; };
  }, [key]);
  // Keep the complete previous style while all new images load; never display half a package.
  const pack = ready.get(key) ?? loaded;
  return { pack, error, loading: !error && ((!ready.has(key) && loadedKey !== key) || !sameStyle(pack, ref)) };
}
const bodyFonts = { default: "'Bahnschrift', 'Segoe UI', 'Microsoft YaHei', sans-serif", modern: "'Segoe UI', 'Microsoft YaHei', sans-serif", serif: "Georgia, 'SimSun', serif" };
const displayFonts = { ...bodyFonts, default: "'Bahnschrift', 'Arial Narrow', 'Microsoft YaHei', sans-serif" };
export function stylePackAppearance(pack: RuntimeStylePack, scene: Scene, accent: string) {
  const layout = !scene.startsWith('custom:') ? pack.scenes[scene as keyof typeof pack.scenes] : undefined;
  const surfaces = { ...pack.textures, ...layout?.textures };
  const style: Record<string, string> = Object.fromEntries(Object.entries(pack.palette).map(([key, value]) => [`--art-${key}`, value]));
  style['--broadcast-accent'] = pack.palette.accent;
  style['--cast-font'] = bodyFonts[pack.fonts.body]; style['--cast-display'] = displayFonts[pack.fonts.display];
  const image = (id: string | null | undefined) => id ? `url("${pack.assets[id]}")` : undefined;
  if (layout?.background) style['--pack-background'] = image(layout.background)!;
  for (const key of STYLE_SURFACES) if (surfaces[key]) style[`--pack-${key}`] = image(surfaces[key])!;
  return { style: style as CSSProperties, background: !!layout?.background, textures: STYLE_SURFACES.filter(s => surfaces[s]).join(' '), frame: layout?.frame ? pack.assets[layout.frame] : undefined };
}
