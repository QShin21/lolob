import type { CustomSceneSource } from '../../shared/types';
export type ResizeHandle = 'move' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
const clamp = (n: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, n)));
/** OBS coordinates, independent of CSS zoom and device pixel ratio. Bounds match server validation. */
export function transformSceneSource(source: CustomSceneSource, handle: ResizeHandle, dx: number, dy: number): Pick<CustomSceneSource, 'x' | 'y' | 'width' | 'height'> {
  let { x, y, width, height } = source;
  if (handle === 'move') return { x: clamp(x + dx, -1920, 1920), y: clamp(y + dy, -1080, 1080), width, height };
  if (handle.includes('e')) width = clamp(width + dx, 1, 3840);
  if (handle.includes('s')) height = clamp(height + dy, 1, 2160);
  if (handle.includes('w')) {
    // Keep the opposite edge fixed, including at the server's size/position limits.
    const left = Math.max(-1920, x + width - 3840), right = Math.min(1920, x + width - 1);
    const next = clamp(x + dx, left, right); width += x - next; x = next;
  }
  if (handle.includes('n')) {
    const top = Math.max(-1080, y + height - 2160), bottom = Math.min(1080, y + height - 1);
    const next = clamp(y + dy, top, bottom); height += y - next; y = next;
  }
  return { x, y, width, height };
}
export const layerStyle = (s: CustomSceneSource) => ({ left: `${s.x / 19.2}%`, top: `${s.y / 10.8}%`, width: `${s.width / 19.2}%`, height: `${s.height / 10.8}%` });
