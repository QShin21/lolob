/** Shared 1920x1080 geometry keeps the HTML frame aligned with the actual OBS game source. */
export const L_FRAME_GAME_RECT = { x: 280, y: 0, width: 1640, height: 922.5 } as const;
export function lFrameGameTransform(enabled: boolean, width: number, height: number) {
  const scale = Math.min(width / 1920, height / 1080), rect = enabled ? L_FRAME_GAME_RECT : { x: 0, y: 0, width: 1920, height: 1080 };
  return { positionX: (width - 1920 * scale) / 2 + rect.x * scale, positionY: (height - 1080 * scale) / 2 + rect.y * scale,
    alignment: 5, rotation: 0, scaleX: 1, scaleY: 1, boundsAlignment: 0,
    boundsType: 'OBS_BOUNDS_SCALE_INNER' as const, boundsWidth: rect.width * scale, boundsHeight: rect.height * scale,
    cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 };
}
