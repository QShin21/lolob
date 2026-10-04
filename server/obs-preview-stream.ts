import { WebSocket } from 'ws';
import { ValidationError } from './state';
import { OBS_SNAPSHOT_INTERVAL_MS } from '../shared/obs-preview-policy';

export type MonitorKind = 'preview' | 'program';
type Channel = { clients: Map<WebSocket, boolean>; timer?: ReturnType<typeof setTimeout>; capturing: boolean; lastPumpAt?: number };

/** One 1 FPS snapshot producer per monitor, shared by all clients with decode backpressure. */
export class ObsPreviewStream {
  private channels: Record<MonitorKind, Channel> = {
    preview: { clients: new Map(), capturing: false }, program: { clients: new Map(), capturing: false },
  };
  private closed = false;
  constructor(private capture: (kind: MonitorKind) => Promise<Buffer>) {}
  attach(socket: WebSocket, kind: MonitorKind) {
    const channel = this.channels[kind];
    if (this.closed || channel.clients.size >= 4) { socket.close(1013, '实时预览连接已满'); return; }
    channel.clients.set(socket, true);
    socket.send(JSON.stringify({ type: 'status', status: 'loading', message: '正在连接 OBS 合成画面' }));
    socket.on('message', (data, binary) => {
      if (!binary && data.toString() === 'next' && channel.clients.has(socket)) {
        channel.clients.set(socket, true);
        this.schedule(kind);
      }
    });
    const remove = () => {
      channel.clients.delete(socket);
      if (!channel.clients.size && channel.timer) { clearTimeout(channel.timer); channel.timer = undefined; }
    };
    socket.once('close', remove); socket.on('error', remove);
    this.schedule(kind);
  }
  private schedule(kind: MonitorKind) {
    const channel = this.channels[kind];
    if (this.closed || channel.timer || channel.capturing || ![...channel.clients.values()].some(Boolean)) return;
    const remaining = channel.lastPumpAt === undefined ? 0 : Math.max(0, OBS_SNAPSHOT_INTERVAL_MS - (Date.now() - channel.lastPumpAt));
    if (!remaining) { void this.pump(kind); return; }
    channel.timer = setTimeout(() => { void this.pump(kind); }, remaining);
    channel.timer.unref();
  }
  private async pump(kind: MonitorKind) {
    const channel = this.channels[kind]; channel.timer = undefined;
    if (this.closed || !channel.clients.size || channel.capturing) return;
    channel.lastPumpAt = Date.now();
    if ([...channel.clients].some(([socket, ready]) => ready && socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 256 * 1024)) {
      channel.capturing = true;
      try {
        const pixels = await this.capture(kind);
        if (this.closed) return;
        for (const [socket, ready] of channel.clients) {
          if (!ready || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount >= 256 * 1024) continue;
          channel.clients.set(socket, false);
          socket.send(pixels, { binary: true });
        }
      } catch (error) {
        const message = error instanceof ValidationError ? error.message : 'OBS 实时画面读取失败，请检查引擎连接';
        for (const socket of channel.clients.keys()) {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'error', message }));
          socket.close(1011, 'OBS 实时预览暂不可用');
        }
        channel.clients.clear();
      } finally { channel.capturing = false; }
    }
    this.schedule(kind);
  }
  close() {
    this.closed = true;
    for (const channel of Object.values(this.channels)) {
      if (channel.timer) clearTimeout(channel.timer);
      for (const socket of channel.clients.keys()) socket.terminate();
      channel.clients.clear();
    }
  }
}
