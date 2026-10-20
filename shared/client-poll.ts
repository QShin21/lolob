export const CLIENT_POLL_DEFAULT = 500;
export const CLIENT_POLL_MIN = 100;
export const CLIENT_POLL_MAX = 1000;

export function normalizeClientPollInterval(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(CLIENT_POLL_MAX, Math.max(CLIENT_POLL_MIN, Math.floor(value)))
    : CLIENT_POLL_DEFAULT;
}
