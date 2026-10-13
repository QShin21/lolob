export type NativeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
};

export function nativePreviewBounds(surface: HTMLElement): NativeBounds | undefined {
  if (document.hidden || !surface.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return;

  // Native child windows render above Chromium's top layer. Suspend them for
  // dialogs and popovers, including their backdrops, wherever they appear.
  const overlays = document.querySelectorAll<HTMLElement>(
    'dialog[open], [aria-modal="true"], [popover]:popover-open',
  );
  if (Array.from(overlays).some(overlay => overlay.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))) return;

  const rect = surface.getBoundingClientRect();
  // Do not squeeze a partly scrolled-out projector into a smaller floating
  // video. Restore the full 16:9 display when its entire surface is visible.
  if (rect.width < 64 || rect.height < 36 || rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) return;
  const width = Math.min(rect.width, rect.height * 16 / 9);
  const height = width * 9 / 16;
  const x = rect.x + (rect.width - width) / 2;
  const y = rect.y + (rect.height - height) / 2;
  const preview = surface.parentElement!;
  // Also respect sticky controls and clipping by scroll containers. Hit tests
  // include the preview's own badge/loading UI, which belongs to this surface.
  for (const [px, py] of [
    [x + 1, y + 1], [x + width - 1, y + 1],
    [x + 1, y + height - 1], [x + width - 1, y + height - 1],
    [x + width / 2, y + height / 2],
  ]) {
    const hit = document.elementFromPoint(px, py);
    if (!hit || !preview.contains(hit)) return;
  }
  return { x, y, width, height, viewportWidth: innerWidth, viewportHeight: innerHeight, devicePixelRatio };
}

export function sameNativeBounds(a: NativeBounds | undefined, b: NativeBounds): boolean {
  return !!a && (Object.keys(b) as (keyof NativeBounds)[]).every(key => a[key] === b[key]);
}
