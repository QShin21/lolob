/** Screenshot monitors share one sampled frame per second. Output timing is owned by OBS. */
export const OBS_SNAPSHOT_INTERVAL_MS = 1000;

export type ObsPreviewPurpose = 'program' | 'dynamic' | 'monitor';

/** Native projectors serve the program and the optional main dynamic preview. */
export function usesNativeObsPreview(
  kind: 'preview' | 'program',
  purpose: ObsPreviewPurpose = 'monitor',
  canEmbed = false,
  embeddedEngine = false,
) {
  return (kind === 'program' && purpose === 'program'||kind==='preview'&&purpose==='dynamic') && canEmbed && embeddedEngine;
}
