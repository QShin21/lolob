/** Screenshot monitors share one sampled frame per second. Output timing is owned by OBS. */
export const OBS_SNAPSHOT_INTERVAL_MS = 1000;

export type ObsPreviewPurpose = 'program' | 'monitor';

/** Native projector ownership belongs exclusively to the studio program display. */
export function usesNativeObsPreview(
  kind: 'preview' | 'program',
  purpose: ObsPreviewPurpose = 'monitor',
  canEmbed = false,
  embeddedEngine = false,
) {
  return kind === 'program' && purpose === 'program' && canEmbed && embeddedEngine;
}
