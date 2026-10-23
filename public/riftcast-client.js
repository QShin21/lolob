/** RiftCast browser-source client. The director creates a read-only key in Integrations. */
export class RiftCastClient {
  constructor({ baseUrl = location.origin, key }) {
    const base = new URL(baseUrl);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('RiftCast requires an HTTP(S) service address');
    if (typeof key !== 'string' || !key) throw new Error('A RiftCast read-only data key is required');
    this.baseUrl = base.origin; this.key = key; this.streams = new Set();
  }
  async snapshot({ signal } = {}) {
    const response = await fetch(`${this.baseUrl}/api/integrations/data`, { headers: { Authorization: `Bearer ${this.key}` }, signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`RiftCast data request failed (${response.status})`);
    return response.json();
  }
  subscribe(onData, onError = () => {}) {
    const url = new URL('/api/integrations/stream', this.baseUrl); url.searchParams.set('key', this.key);
    const stream = new EventSource(url); this.streams.add(stream);
    stream.addEventListener('game-data', event => { try { onData(JSON.parse(event.data)); } catch (error) { onError(error); } });
    stream.addEventListener('error', () => onError(new Error('RiftCast data stream disconnected; reconnecting')));
    return () => { stream.close(); this.streams.delete(stream); };
  }
  close() { for (const stream of this.streams) stream.close(); this.streams.clear(); }
}
